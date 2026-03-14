"""Cloud Run analytics API for randaworks-site.

Mirrors the endpoints in scripts/serve_site.py but stores events in
Google Cloud Storage instead of a local JSONL file.
"""

from __future__ import annotations

import json
import os
import random
from collections import defaultdict
from datetime import datetime, timezone
from time import sleep

from flask import Flask, Response, jsonify, request
from google.api_core.exceptions import NotFound, PreconditionFailed
from google.cloud import storage

app = Flask(__name__)

BUCKET_NAME = os.environ.get("GCS_BUCKET", "randaworks-analytics-events")
BLOB_NAME = "analytics-events.jsonl"
ADMIN_TOKEN = os.environ.get("RANDA_ADMIN_TOKEN", "randa-local-admin")

_gcs_client: storage.Client | None = None


def gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def bucket() -> storage.Bucket:
    return gcs_client().bucket(BUCKET_NAME)


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
        "Access-Control-Max-Age": "86400",
    }


# ── Storage helpers ──────────────────────────────────────────────────

def append_event(payload: dict) -> None:
    line = json.dumps(payload, ensure_ascii=False) + "\n"

    # GCS objects are immutable per generation. Without a generation check,
    # simultaneous writes can overwrite each other and drop analytics events.
    for attempt in range(6):
        blob = bucket().blob(BLOB_NAME)
        try:
            blob.reload()
            current_generation = blob.generation
            existing = blob.download_as_text(encoding="utf-8")
            blob.upload_from_string(
                existing + line,
                content_type="text/plain; charset=utf-8",
                if_generation_match=current_generation,
            )
            return
        except NotFound:
            try:
                blob.upload_from_string(
                    line,
                    content_type="text/plain; charset=utf-8",
                    if_generation_match=0,
                )
                return
            except PreconditionFailed:
                pass
        except PreconditionFailed:
            pass

        if attempt < 5:
            sleep(0.05 * (attempt + 1) + random.random() * 0.05)

    raise RuntimeError("Failed to append analytics event after concurrent-write retries")


def read_events(limit: int = 2000) -> list[dict]:
    blob = bucket().blob(BLOB_NAME)
    if not blob.exists():
        return []
    text = blob.download_as_text(encoding="utf-8")
    rows = text.splitlines()
    selected = rows[-limit:]
    events: list[dict] = []
    for row in selected:
        row = row.strip()
        if not row:
            continue
        try:
            events.append(json.loads(row))
        except json.JSONDecodeError:
            events.append({"raw": row, "parse_error": True})
    return events


def clear_events() -> None:
    blob = bucket().blob(BLOB_NAME)
    blob.upload_from_string("", content_type="text/plain; charset=utf-8")


# ── Auth ─────────────────────────────────────────────────────────────

def is_authorized() -> bool:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer ") and header.removeprefix("Bearer ").strip() == ADMIN_TOKEN:
        return True
    token = request.headers.get("X-Admin-Token", "").strip()
    if token == ADMIN_TOKEN:
        return True
    query_token = request.args.get("token", "").strip()
    if query_token == ADMIN_TOKEN:
        return True
    return False


# ── Summarization logic (ported from serve_site.py) ──────────────────

EXPERIENCE_PAGE_TYPES = {"inga_overview", "demo_play"}
EXPERIENCE_EVENT_NAMES = {
    "page_view",
    "play_session_start",
    "play_session_end",
    "demo_boot_start",
    "demo_boot_success",
    "demo_boot_error",
    "title_reached",
    "wishlist_click",
    "return_to_lp",
    "cta_click",
    "audio_toggle",
    "fullscreen_toggle",
}


def parse_event_time(event: dict) -> datetime:
    for key in ("_received_at", "timestamp", "started_at", "ended_at"):
        value = str(event.get(key, "")).strip()
        if not value:
            continue
        try:
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return datetime.min.replace(tzinfo=timezone.utc)


def iso_or_empty(value: datetime | None) -> str:
    return value.isoformat() if value else ""


def seconds_between(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    return max(0, int((end - start).total_seconds()))


def first_non_empty(events: list[dict], *keys: str) -> str:
    for event in events:
        for key in keys:
            value = str(event.get(key, "")).strip()
            if value:
                return value
    return ""


def summarize_event_row(event: dict) -> dict:
    return {
        "at": iso_or_empty(parse_event_time(event)),
        "event_name": str(event.get("event_name", "")),
        "page_type": str(event.get("page_type", "")),
        "placement": str(event.get("placement", "")),
        "label": str(event.get("label", "")),
    }


def build_play_session_text(play_session: dict) -> str:
    lines = [
        f"play_session_id: {play_session.get('play_session_id') or '-'}",
        f"session_id: {play_session.get('session_id') or '-'}",
        f"開始: {play_session.get('opened_at') or '-'}",
        f"終了: {play_session.get('ended_at') or play_session.get('last_seen_at') or '-'}",
        f"時間: {play_session.get('duration_sec') if play_session.get('duration_sec') is not None else '-'}秒",
        f"端末: {play_session.get('device_type') or '-'} / {play_session.get('browser') or '-'} / {play_session.get('os') or '-'} / {play_session.get('viewport_label') or '-'} / {play_session.get('lang') or '-'}",
        f"流入: {play_session.get('entry_src') or '-'}",
        f"起動: {play_session.get('boot_status') or '-'}",
        f"タイトル到達: {'yes' if play_session.get('title_reached') else 'no'}",
    ]
    return "\n".join(lines)


def is_experience_event(event: dict) -> bool:
    event_name = str(event.get("event_name", ""))
    page_type = str(event.get("page_type", ""))
    if event.get("play_session_id"):
        return True
    if page_type in EXPERIENCE_PAGE_TYPES:
        return True
    return event_name in EXPERIENCE_EVENT_NAMES


def get_play_session_key(event: dict) -> str:
    play_session_id = str(event.get("play_session_id", "")).strip()
    if play_session_id:
        return play_session_id
    session_id = str(event.get("session_id", "")).strip()
    page_type = str(event.get("page_type", "")).strip()
    event_name = str(event.get("event_name", "")).strip()
    if session_id and page_type in EXPERIENCE_PAGE_TYPES:
        return f"fallback:{session_id}:{page_type}"
    if session_id and event_name in {
        "play_session_start", "play_session_end",
        "demo_boot_start", "demo_boot_success", "demo_boot_error",
        "title_reached",
    }:
        return f"fallback:{session_id}:experience"
    return ""


def build_play_sessions(events: list[dict]) -> list[dict]:
    sorted_events = sorted(events, key=parse_event_time)
    session_events: dict[str, list[dict]] = defaultdict(list)

    for event in sorted_events:
        session_key = get_play_session_key(event)
        if session_key and is_experience_event(event):
            session_events[session_key].append(event)

    play_sessions: list[dict] = []
    for session_key, items in session_events.items():
        ordered_items = sorted(items, key=parse_event_time)
        opened_at = parse_event_time(ordered_items[0]) if ordered_items else None
        explicit_end = next(
            (parse_event_time(event) for event in reversed(ordered_items) if str(event.get("event_name", "")) == "play_session_end"),
            None,
        )
        last_seen_at = parse_event_time(ordered_items[-1]) if ordered_items else None
        final_at = explicit_end or last_seen_at

        play_session = {
            "play_session_id": session_key if not session_key.startswith("fallback:") else "",
            "session_id": first_non_empty(ordered_items, "session_id"),
            "page_type": first_non_empty(ordered_items, "page_type"),
            "build_id": first_non_empty(ordered_items, "build_id"),
            "entry_src": first_non_empty(ordered_items, "entry_src"),
            "device_type": first_non_empty(ordered_items, "device_type"),
            "browser": first_non_empty(ordered_items, "browser"),
            "os": first_non_empty(ordered_items, "os"),
            "viewport_w": int(first_non_empty(ordered_items, "viewport_w") or 0),
            "viewport_h": int(first_non_empty(ordered_items, "viewport_h") or 0),
            "viewport_label": f"{int(first_non_empty(ordered_items, 'viewport_w') or 0)}x{int(first_non_empty(ordered_items, 'viewport_h') or 0)}",
            "lang": first_non_empty(ordered_items, "lang"),
            "opened_at": iso_or_empty(opened_at),
            "ended_at": iso_or_empty(explicit_end),
            "last_seen_at": iso_or_empty(last_seen_at),
            "duration_sec": seconds_between(opened_at, final_at),
            "boot_status": "success" if any(str(e.get("event_name", "")) == "demo_boot_success" for e in ordered_items) else (
                "error" if any(str(e.get("event_name", "")) == "demo_boot_error" for e in ordered_items) else (
                    "started" if any(str(e.get("event_name", "")) == "demo_boot_start" for e in ordered_items) else "not_started"
                )
            ),
            "title_reached": any(str(e.get("event_name", "")) == "title_reached" for e in ordered_items),
            "events_count": len(ordered_items),
            "timeline": [summarize_event_row(event) for event in ordered_items[-50:]],
        }
        play_session["text_summary"] = build_play_session_text(play_session)
        play_sessions.append(play_session)

    play_sessions.sort(key=lambda item: item.get("opened_at") or item.get("last_seen_at") or "", reverse=True)
    return play_sessions


def flatten_event(event: dict, prefix: str = "") -> dict:
    flat: dict[str, object] = {}
    for key, value in event.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(flatten_event(value, full_key))
        elif isinstance(value, list):
            flat[full_key] = json.dumps(value, ensure_ascii=False)
        else:
            flat[full_key] = value
    return flat


def events_to_csv(events: list[dict]) -> str:
    keys: set[str] = set()
    for event in events:
        keys.update(event.keys())
    ordered_keys = sorted(keys)
    rows = [",".join(ordered_keys)]
    for event in events:
        values = []
        for key in ordered_keys:
            value = event.get(key, "")
            text = str(value).replace('"', '""')
            values.append(f'"{text}"')
        rows.append(",".join(values))
    return "\n".join(rows) + "\n"


def summarize_events(events: list[dict]) -> dict:
    event_counts: dict[str, int] = {}
    page_counts: dict[str, int] = {}
    placement_counts: dict[str, int] = {}
    sessions: set[str] = set()

    for event in events:
        event_name = str(event.get("event_name", "unknown"))
        page_type = str(event.get("page_type", "unknown"))
        placement = str(event.get("placement", ""))
        session_id = str(event.get("session_id", ""))
        event_counts[event_name] = event_counts.get(event_name, 0) + 1
        page_counts[page_type] = page_counts.get(page_type, 0) + 1
        if placement:
            placement_counts[placement] = placement_counts.get(placement, 0) + 1
        if session_id:
            sessions.add(session_id)

    boot_sessions = {str(e.get("session_id")) for e in events if e.get("event_name") == "demo_boot_success" and e.get("session_id")}
    wishlist_sessions = {str(e.get("session_id")) for e in events if e.get("event_name") == "wishlist_click" and e.get("session_id")}
    title_sessions = {str(e.get("session_id")) for e in events if e.get("event_name") == "title_reached" and e.get("session_id")}

    funnel = {
        "boot_success": len(boot_sessions),
        "title_reached": len(title_sessions),
        "wishlist_clicks": len(wishlist_sessions),
        "boot_success_events": sum(1 for e in events if e.get("event_name") == "demo_boot_success"),
        "title_reached_events": sum(1 for e in events if e.get("event_name") == "title_reached"),
        "wishlist_click_events": sum(1 for e in events if e.get("event_name") == "wishlist_click"),
    }

    play_sessions = build_play_sessions(events)

    return {
        "total_events": len(events),
        "unique_sessions": len(sessions),
        "event_counts": dict(sorted(event_counts.items(), key=lambda item: (-item[1], item[0]))),
        "page_counts": dict(sorted(page_counts.items(), key=lambda item: (-item[1], item[0]))),
        "placement_counts": dict(sorted(placement_counts.items(), key=lambda item: (-item[1], item[0]))),
        "funnel": funnel,
        "play_sessions": play_sessions[:100],
        "overview": {
            "play_sessions": len(play_sessions),
            "boot_success_sessions": sum(1 for item in play_sessions if item.get("boot_status") == "success"),
            "title_reached_sessions": sum(1 for item in play_sessions if item.get("title_reached")),
        },
        "recent_events": events[-20:],
    }


# ── Flask routes ─────────────────────────────────────────────────────

@app.route("/__analytics", methods=["POST", "OPTIONS"])
def collect_event():
    if request.method == "OPTIONS":
        return Response(status=204, headers=_cors_headers())

    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return Response(
            json.dumps({"ok": False, "error": "Invalid JSON"}),
            status=400,
            content_type="application/json",
            headers=_cors_headers(),
        )

    payload["_received_at"] = datetime.now(timezone.utc).isoformat()
    append_event(payload)

    return Response(
        json.dumps({"ok": True}),
        status=200,
        content_type="application/json",
        headers=_cors_headers(),
    )


@app.route("/__analytics/summary", methods=["GET", "OPTIONS"])
def get_summary():
    if request.method == "OPTIONS":
        return Response(status=204, headers=_cors_headers())
    if not is_authorized():
        return Response(
            json.dumps({"ok": False, "error": "unauthorized"}),
            status=401,
            content_type="application/json",
            headers=_cors_headers(),
        )
    events = read_events(limit=2000)
    payload = summarize_events(events)
    return Response(
        json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        content_type="application/json; charset=utf-8",
        headers={**_cors_headers(), "Cache-Control": "no-store"},
    )


@app.route("/__analytics/events", methods=["GET", "DELETE", "OPTIONS"])
def handle_events():
    if request.method == "OPTIONS":
        return Response(status=204, headers=_cors_headers())
    if not is_authorized():
        return Response(
            json.dumps({"ok": False, "error": "unauthorized"}),
            status=401,
            content_type="application/json",
            headers=_cors_headers(),
        )
    if request.method == "DELETE":
        clear_events()
        return Response(
            json.dumps({"ok": True}),
            status=200,
            content_type="application/json",
            headers=_cors_headers(),
        )
    events = read_events()
    payload = {"count": len(events), "events": events}
    return Response(
        json.dumps(payload, ensure_ascii=False, indent=2),
        status=200,
        content_type="application/json; charset=utf-8",
        headers={**_cors_headers(), "Cache-Control": "no-store"},
    )


@app.route("/__analytics/events.csv", methods=["GET", "OPTIONS"])
def get_events_csv():
    if request.method == "OPTIONS":
        return Response(status=204, headers=_cors_headers())
    if not is_authorized():
        return Response(
            json.dumps({"ok": False, "error": "unauthorized"}),
            status=401,
            content_type="application/json",
            headers=_cors_headers(),
        )
    csv_body = events_to_csv(read_events(limit=5000))
    return Response(
        csv_body,
        status=200,
        content_type="text/csv; charset=utf-8",
        headers={
            **_cors_headers(),
            "Content-Disposition": 'attachment; filename="analytics-events.csv"',
            "Cache-Control": "no-store",
        },
    )


@app.route("/__analytics/events.jsonl", methods=["GET", "OPTIONS"])
def get_events_jsonl():
    if request.method == "OPTIONS":
        return Response(status=204, headers=_cors_headers())
    if not is_authorized():
        return Response(
            json.dumps({"ok": False, "error": "unauthorized"}),
            status=401,
            content_type="application/json",
            headers=_cors_headers(),
        )
    events = read_events(limit=5000)
    jsonl_lines = [json.dumps(e, ensure_ascii=False) for e in events]
    body = ("\n".join(jsonl_lines) + "\n") if jsonl_lines else ""
    return Response(
        body,
        status=200,
        content_type="application/x-ndjson; charset=utf-8",
        headers={
            **_cors_headers(),
            "Content-Disposition": 'attachment; filename="analytics-events.jsonl"',
            "Cache-Control": "no-store",
        },
    )


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "randaworks-analytics"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
