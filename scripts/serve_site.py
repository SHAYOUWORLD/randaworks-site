from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import json
import os
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT_DIR = Path(__file__).resolve().parent.parent
EVENTS_FILE = ROOT_DIR / ".tmp" / "analytics-events.jsonl"
ADMIN_TOKEN = os.environ.get("RANDA_ADMIN_TOKEN", "randa-local-admin")
ADMIN_USER = os.environ.get("RANDA_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("RANDA_ADMIN_PASS", ADMIN_TOKEN)


def append_event(payload: dict) -> None:
    EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_events(limit: int = 200) -> list[dict]:
    if not EVENTS_FILE.exists():
        return []

    rows = EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    selected = rows[-limit:]
    events = []
    for row in selected:
        row = row.strip()
        if not row:
            continue
        try:
            events.append(json.loads(row))
        except json.JSONDecodeError:
            events.append({"raw": row, "parse_error": True})
    return events


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


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path.startswith("/admin/"):
            if not self.is_basic_auth_valid():
                self.send_response(HTTPStatus.UNAUTHORIZED)
                self.send_header("WWW-Authenticate", 'Basic realm="Analytics Admin"')
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

        if parsed.path == "/__analytics/events":
            if not self.is_authorized(params):
                self.write_unauthorized()
                return
            events = read_events()
            payload = {
                "count": len(events),
                "events": events,
            }
            body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/__analytics/events.csv":
            if not self.is_authorized(params):
                self.write_unauthorized()
                return
            csv_body = events_to_csv(read_events(limit=5000)).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="analytics-events.csv"')
            self.send_header("Content-Length", str(len(csv_body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(csv_body)
            return

        if parsed.path == "/__analytics/events.jsonl":
            if not self.is_authorized(params):
                self.write_unauthorized()
                return
            events = read_events(limit=5000)
            jsonl_lines = [json.dumps(e, ensure_ascii=False) for e in events]
            body = ("\n".join(jsonl_lines) + "\n").encode("utf-8") if jsonl_lines else b""
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="analytics-events.jsonl"')
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/__analytics/summary":
            if not self.is_authorized(params):
                self.write_unauthorized()
                return
            events = read_events(limit=2000)
            payload = summarize_events(events)
            body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/__analytics":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        payload["_received_at"] = datetime.now(timezone.utc).isoformat()
        append_event(payload)

        response = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        if parsed.path != "/__analytics/events":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        if not self.is_authorized(params):
            self.write_unauthorized()
            return

        EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        EVENTS_FILE.write_text("", encoding="utf-8")
        response = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response)

    def is_authorized(self, params: dict[str, list[str]]) -> bool:
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer ") and header.removeprefix("Bearer ").strip() == ADMIN_TOKEN:
            return True

        token = self.headers.get("X-Admin-Token", "").strip()
        if token == ADMIN_TOKEN:
            return True

        query_token = (params.get("token") or [""])[0].strip()
        if query_token == ADMIN_TOKEN:
            return True

        return False

    def is_basic_auth_valid(self) -> bool:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            user, _, password = decoded.partition(":")
            return user == ADMIN_USER and password == ADMIN_PASS
        except Exception:
            return False

    def write_unauthorized(self) -> None:
        response = json.dumps({"ok": False, "error": "unauthorized"}).encode("utf-8")
        self.send_response(HTTPStatus.UNAUTHORIZED)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format: str, *args) -> None:
        super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the static site with a local analytics collector.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SiteHandler)
    print(f"Serving {ROOT_DIR} at http://{args.host}:{args.port}")
    print(f"Analytics collector: http://{args.host}:{args.port}/__analytics")
    print(f"Analytics events:    http://{args.host}:{args.port}/__analytics/events")
    print(f"Analytics summary:   http://{args.host}:{args.port}/__analytics/summary")
    print(f"Events JSONL:        http://{args.host}:{args.port}/__analytics/events.jsonl")
    print(f"Admin token:         {ADMIN_TOKEN}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
