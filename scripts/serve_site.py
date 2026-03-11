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
GAME_EVENT_NAMES = {
    "title_reached", "run_start", "battle_start", "battle_end",
    "run_end", "run_record", "combo_triggered",
}
EXPERIENCE_EVENT_NAMES = GAME_EVENT_NAMES | {
    "page_view",
    "play_session_start",
    "play_session_end",
    "demo_boot_start",
    "demo_boot_success",
    "demo_boot_error",
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
        "hero": str(event.get("hero", "")),
        "enemy_id": str(event.get("enemy_id", "")),
        "combo_id": str(event.get("combo_id", "")),
        "result": str(event.get("result", "")),
        "stage_id": str(event.get("stage_id", "") or event.get("stage_reached", "")),
        "end_reason": str(event.get("end_reason", "")),
        "label": str(event.get("label", "")),
    }


def top_counts(counter: dict[str, int], limit: int = 3) -> list[dict]:
    return [
        {"id": key, "count": value}
        for key, value in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def build_run_text(run: dict) -> str:
    lines = [
        f"run_id: {run.get('run_id') or '-'}",
        f"play_session_id: {run.get('play_session_id') or '-'}",
        f"開始: {run.get('started_at') or '-'}",
        f"終了: {run.get('ended_at') or run.get('last_seen_at') or '-'}",
        f"時間: {run.get('duration_sec') if run.get('duration_sec') is not None else '-'}秒",
        f"端末: {run.get('device_type') or '-'} / {run.get('browser') or '-'} / {run.get('os') or '-'} / {run.get('viewport_label') or '-'} / {run.get('lang') or '-'}",
        f"流入: {run.get('entry_src') or '-'}",
        f"英雄: {run.get('hero') or '-'}",
        f"結果: {run.get('result') or '-'}",
        f"終了理由: {run.get('end_reason') or '-'}",
        f"到達: {run.get('stage_reached') or '-'}",
        f"最後の敗北敵: {run.get('last_enemy') or '-'}",
        "主なコンボ:",
    ]

    combos = run.get("top_combos") or []
    if combos:
        for combo in combos:
            lines.append(f"- {combo.get('id', '-')} x{combo.get('count', 0)}")
    else:
        lines.append("- なし")

    return "\n".join(lines)


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
        f"ラン数: {play_session.get('run_count', 0)}",
        f"最後の結果: {play_session.get('final_result') or '-'}",
        f"最後の敗北敵: {play_session.get('last_enemy') or '-'}",
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
    if session_id and event_name in (GAME_EVENT_NAMES | {"play_session_start", "play_session_end", "demo_boot_start", "demo_boot_success", "demo_boot_error"}):
        return f"fallback:{session_id}:experience"
    return ""


def build_play_sessions_and_runs(events: list[dict]) -> tuple[list[dict], list[dict]]:
    sorted_events = sorted(events, key=parse_event_time)
    session_events: dict[str, list[dict]] = defaultdict(list)
    runs_by_key: dict[str, dict] = {}
    current_run_by_session: dict[str, str] = {}
    run_seq_by_session: dict[str, int] = defaultdict(int)

    def ensure_run(session_key: str, event: dict, explicit_run_id: str = "") -> tuple[str, dict]:
        run_seq_by_session[session_key] += 1
        derived_run_id = explicit_run_id or f"{session_key.split(':')[-1]}-run-{run_seq_by_session[session_key]}"
        run_key = f"{session_key}::{derived_run_id}"
        if run_key not in runs_by_key:
            runs_by_key[run_key] = {
                "run_id": derived_run_id,
                "external_run_id": explicit_run_id,
                "play_session_id": session_key if not session_key.startswith("fallback:") else "",
                "session_id": str(event.get("session_id", "")),
                "page_type": str(event.get("page_type", "")),
                "build_id": str(event.get("build_id", "")),
                "entry_src": str(event.get("entry_src", "")),
                "device_type": str(event.get("device_type", "")),
                "browser": str(event.get("browser", "")),
                "os": str(event.get("os", "")),
                "viewport_w": int(event.get("viewport_w", 0) or 0),
                "viewport_h": int(event.get("viewport_h", 0) or 0),
                "viewport_label": f"{int(event.get('viewport_w', 0) or 0)}x{int(event.get('viewport_h', 0) or 0)}",
                "lang": str(event.get("lang", "")),
                "hero": str(event.get("hero", "")),
                "mode": str(event.get("mode", "")),
                "result": "",
                "end_reason": "",
                "stage_reached": "",
                "started_at": "",
                "ended_at": "",
                "last_seen_at": "",
                "duration_sec": None,
                "last_enemy": "",
                "deck_snapshot": [],
                "summary": {},
                "combo_counts": defaultdict(int),
                "enemy_counts": defaultdict(int),
                "top_combos": [],
                "enemy_stats_top": [],
                "timeline": [],
                "events": [],
                "events_count": 0,
            }
        return run_key, runs_by_key[run_key]

    for event in sorted_events:
        session_key = get_play_session_key(event)
        if session_key and is_experience_event(event):
            session_events[session_key].append(event)

        event_name = str(event.get("event_name", ""))
        if event_name not in GAME_EVENT_NAMES:
            continue

        explicit_run_id = str(event.get("run_id", "")).strip()
        run_key = ""
        run = None

        if session_key and explicit_run_id:
            existing_key = f"{session_key}::{explicit_run_id}"
            if existing_key in runs_by_key:
                run_key = existing_key
                run = runs_by_key[run_key]
                current_run_by_session[session_key] = run_key
            elif event_name != "run_start" and current_run_by_session.get(session_key):
                run_key = current_run_by_session[session_key]
                run = runs_by_key[run_key]
                if not run.get("external_run_id"):
                    run["external_run_id"] = explicit_run_id
                    run["run_id"] = explicit_run_id
            else:
                run_key, run = ensure_run(session_key, event, explicit_run_id)
                current_run_by_session[session_key] = run_key
        elif event_name == "run_start" and session_key:
            run_key, run = ensure_run(session_key, event, explicit_run_id)
            current_run_by_session[session_key] = run_key
        elif session_key and current_run_by_session.get(session_key):
            run_key = current_run_by_session[session_key]
            run = runs_by_key[run_key]
        elif session_key:
            run_key, run = ensure_run(session_key, event, explicit_run_id)
            current_run_by_session[session_key] = run_key

        if not run:
            continue

        event_time = parse_event_time(event)
        run["events"].append(event)
        run["events_count"] += 1
        run["last_seen_at"] = iso_or_empty(event_time)
        run["timeline"].append(summarize_event_row(event))

        if not run["started_at"] and event_name in {"run_start", "battle_start", "battle_end", "combo_triggered", "run_end", "run_record"}:
            run["started_at"] = iso_or_empty(event_time)

        if event_name == "run_start":
            run["hero"] = str(event.get("hero", "")) or run["hero"]
            run["mode"] = str(event.get("mode", "")) or run["mode"]
            run["stage_reached"] = str(event.get("stage_id", "")) or run["stage_reached"]
        elif event_name == "battle_end":
            enemy_id = str(event.get("enemy_id", "")).strip()
            if enemy_id:
                run["enemy_counts"][enemy_id] += 1
            if str(event.get("result", "")) == "lose":
                run["last_enemy"] = enemy_id
        elif event_name == "combo_triggered":
            combo_id = str(event.get("combo_id", "")).strip()
            if combo_id:
                run["combo_counts"][combo_id] += 1
        elif event_name == "run_end":
            run["ended_at"] = iso_or_empty(event_time)
            run["result"] = str(event.get("result", "")) or run["result"]
            run["end_reason"] = str(event.get("end_reason", "")) or run["end_reason"]
            run["stage_reached"] = str(event.get("stage_reached", "")) or run["stage_reached"]
            run["hero"] = str(event.get("hero", "")) or run["hero"]
            run["mode"] = str(event.get("mode", "")) or run["mode"]
        elif event_name == "run_record":
            run["external_run_id"] = explicit_run_id or run["external_run_id"]
            if explicit_run_id:
                run["run_id"] = explicit_run_id
            run["result"] = str(event.get("result", "")) or run["result"]
            run["hero"] = str(event.get("hero", "")) or run["hero"]
            run["stage_reached"] = str(event.get("stage_reached", "")) or run["stage_reached"]
            run["end_reason"] = str(event.get("end_reason", "")) or run["end_reason"]
            run["deck_snapshot"] = event.get("deck_snapshot", []) or []
            run["summary"] = event.get("summary", {}) or {}
            run["enemy_stats_top"] = event.get("enemy_stats_top", []) or []
            if event.get("top_combos"):
                run["top_combos"] = event.get("top_combos", []) or []
            if event.get("duration_sec") is not None:
                try:
                    run["duration_sec"] = int(event.get("duration_sec"))
                except (TypeError, ValueError):
                    pass

    runs: list[dict] = []
    runs_by_session: dict[str, list[dict]] = defaultdict(list)
    for run_key, run in runs_by_key.items():
        if not run["top_combos"]:
            run["top_combos"] = top_counts(dict(run["combo_counts"]))
        if not run["enemy_stats_top"]:
            run["enemy_stats_top"] = top_counts(dict(run["enemy_counts"]))
        if run["duration_sec"] is None:
            run["duration_sec"] = seconds_between(
                parse_event_time({"_received_at": run["started_at"]}) if run["started_at"] else None,
                parse_event_time({"_received_at": run["ended_at"] or run["last_seen_at"]}) if (run["ended_at"] or run["last_seen_at"]) else None,
            )
        run["text_summary"] = build_run_text(run)
        run["timeline"] = run["timeline"][-50:]
        runs.append(run)
        session_key = run_key.split("::", 1)[0]
        runs_by_session[session_key].append(run)

    runs.sort(key=lambda item: item.get("started_at") or item.get("last_seen_at") or "", reverse=True)

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
        session_runs = sorted(
            runs_by_session.get(session_key, []),
            key=lambda item: item.get("started_at") or item.get("last_seen_at") or "",
        )

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
            "run_count": len(session_runs),
            "completed_runs": sum(1 for run in session_runs if run.get("result")),
            "final_result": session_runs[-1]["result"] if session_runs else "",
            "final_stage": session_runs[-1]["stage_reached"] if session_runs else "",
            "last_enemy": session_runs[-1]["last_enemy"] if session_runs else "",
            "events_count": len(ordered_items),
            "timeline": [summarize_event_row(event) for event in ordered_items[-50:]],
            "runs": [
                {
                    "run_id": run.get("run_id", ""),
                    "hero": run.get("hero", ""),
                    "result": run.get("result", ""),
                    "started_at": run.get("started_at", ""),
                    "ended_at": run.get("ended_at", ""),
                    "last_enemy": run.get("last_enemy", ""),
                }
                for run in session_runs
            ],
        }
        play_session["text_summary"] = build_play_session_text(play_session)
        play_sessions.append(play_session)

    play_sessions.sort(key=lambda item: item.get("opened_at") or item.get("last_seen_at") or "", reverse=True)
    return play_sessions, runs


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

    lp_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "page_view"
        and event.get("page_type") == "demo_lp"
        and event.get("session_id")
    }
    play_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "play_cta_click"
        and event.get("session_id")
    }
    boot_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "demo_boot_success"
        and event.get("session_id")
    }
    wishlist_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "wishlist_click"
        and event.get("session_id")
    }
    title_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "title_reached"
        and event.get("session_id")
    }
    run_start_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "run_start"
        and event.get("session_id")
    }
    first_battle_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "battle_start"
        and event.get("session_id")
    }
    run_end_win_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "run_end"
        and event.get("result") == "win"
        and event.get("session_id")
    }
    run_end_lose_sessions = {
        str(event.get("session_id"))
        for event in events
        if event.get("event_name") == "run_end"
        and event.get("result") == "lose"
        and event.get("session_id")
    }

    play_after_lp_sessions = lp_sessions & play_sessions
    boot_after_play_sessions = play_sessions & boot_sessions
    wishlist_after_lp_sessions = lp_sessions & wishlist_sessions
    title_after_boot_sessions = boot_sessions & title_sessions
    run_start_after_title_sessions = title_sessions & run_start_sessions
    first_battle_after_run_sessions = run_start_sessions & first_battle_sessions
    run_win_sessions = run_start_sessions & run_end_win_sessions
    run_lose_sessions = run_start_sessions & run_end_lose_sessions

    funnel = {
        "lp_views": len(lp_sessions),
        "play_clicks": len(play_after_lp_sessions),
        "boot_success": len(boot_after_play_sessions),
        "title_reached": len(title_after_boot_sessions),
        "run_starts": len(run_start_after_title_sessions),
        "first_battle": len(first_battle_after_run_sessions),
        "run_end_win": len(run_win_sessions),
        "run_end_lose": len(run_lose_sessions),
        "wishlist_clicks": len(wishlist_after_lp_sessions),
        "lp_view_events": sum(1 for event in events if event.get("event_name") == "page_view" and event.get("page_type") == "demo_lp"),
        "play_click_events": sum(1 for event in events if event.get("event_name") == "play_cta_click"),
        "boot_success_events": sum(1 for event in events if event.get("event_name") == "demo_boot_success"),
        "title_reached_events": sum(1 for event in events if event.get("event_name") == "title_reached"),
        "run_start_events": sum(1 for event in events if event.get("event_name") == "run_start"),
        "battle_start_events": sum(1 for event in events if event.get("event_name") == "battle_start"),
        "battle_end_events": sum(1 for event in events if event.get("event_name") == "battle_end"),
        "run_end_events": sum(1 for event in events if event.get("event_name") == "run_end"),
        "run_record_events": sum(1 for event in events if event.get("event_name") == "run_record"),
        "wishlist_click_events": sum(1 for event in events if event.get("event_name") == "wishlist_click"),
    }
    funnel["play_click_rate"] = round((funnel["play_clicks"] / funnel["lp_views"]) * 100, 1) if funnel["lp_views"] else 0.0
    funnel["boot_success_rate"] = round((funnel["boot_success"] / funnel["play_clicks"]) * 100, 1) if funnel["play_clicks"] else 0.0
    funnel["title_rate"] = round((funnel["title_reached"] / funnel["boot_success"]) * 100, 1) if funnel["boot_success"] else 0.0
    funnel["run_start_rate"] = round((funnel["run_starts"] / funnel["title_reached"]) * 100, 1) if funnel["title_reached"] else 0.0
    funnel["first_battle_rate"] = round((funnel["first_battle"] / funnel["run_starts"]) * 100, 1) if funnel["run_starts"] else 0.0
    funnel["wishlist_rate"] = round((funnel["wishlist_clicks"] / funnel["lp_views"]) * 100, 1) if funnel["lp_views"] else 0.0

    play_sessions, runs = build_play_sessions_and_runs(events)

    return {
        "total_events": len(events),
        "unique_sessions": len(sessions),
        "event_counts": dict(sorted(event_counts.items(), key=lambda item: (-item[1], item[0]))),
        "page_counts": dict(sorted(page_counts.items(), key=lambda item: (-item[1], item[0]))),
        "placement_counts": dict(sorted(placement_counts.items(), key=lambda item: (-item[1], item[0]))),
        "funnel": funnel,
        "game_stats": build_game_stats(events),
        "play_sessions": play_sessions[:100],
        "runs": runs[:150],
        "overview": {
            "play_sessions": len(play_sessions),
            "boot_success_sessions": sum(1 for item in play_sessions if item.get("boot_status") == "success"),
            "title_reached_sessions": sum(1 for item in play_sessions if item.get("title_reached")),
            "runs": len(runs),
            "completed_runs": sum(1 for item in runs if item.get("result")),
        },
        "recent_events": events[-20:],
    }


def build_game_stats(events: list[dict]) -> dict:
    hero_counts: dict[str, int] = {}
    enemy_kill_counts: dict[str, int] = {}
    enemy_encounter_counts: dict[str, int] = {}
    combo_counts: dict[str, int] = {}
    run_results: dict[str, int] = {"win": 0, "lose": 0, "abandon": 0}
    stage_reached_counts: dict[str, int] = {}

    for event in events:
        name = event.get("event_name", "")

        if name == "run_start":
            hero = str(event.get("hero", ""))
            if hero:
                hero_counts[hero] = hero_counts.get(hero, 0) + 1

        elif name == "battle_end":
            enemy_id = str(event.get("enemy_id", ""))
            result = str(event.get("result", ""))
            if enemy_id:
                enemy_encounter_counts[enemy_id] = enemy_encounter_counts.get(enemy_id, 0) + 1
                if result == "lose":
                    enemy_kill_counts[enemy_id] = enemy_kill_counts.get(enemy_id, 0) + 1

        elif name == "run_end":
            result = str(event.get("result", ""))
            if result in run_results:
                run_results[result] += 1
            stage = str(event.get("stage_reached", ""))
            if stage:
                stage_reached_counts[stage] = stage_reached_counts.get(stage, 0) + 1

        elif name == "combo_triggered":
            combo_id = str(event.get("combo_id", ""))
            if combo_id:
                combo_counts[combo_id] = combo_counts.get(combo_id, 0) + 1

    return {
        "hero_picks": dict(sorted(hero_counts.items(), key=lambda x: -x[1])),
        "enemies_most_defeating_players": dict(sorted(enemy_kill_counts.items(), key=lambda x: -x[1])[:10]),
        "enemy_encounter_counts": dict(sorted(enemy_encounter_counts.items(), key=lambda x: -x[1])[:10]),
        "combo_usage": dict(sorted(combo_counts.items(), key=lambda x: -x[1])[:10]),
        "run_results": run_results,
        "stage_reached_distribution": dict(sorted(stage_reached_counts.items())),
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


def game_events_to_csv(events: list[dict]) -> str:
    game_events = [e for e in events if e.get("event_name") in GAME_EVENT_NAMES]
    if not game_events:
        return "no_game_events\n"

    flattened = [flatten_event(e) for e in game_events]
    keys: set[str] = set()
    for row in flattened:
        keys.update(row.keys())

    ordered_keys = sorted(keys)
    rows = [",".join(ordered_keys)]
    for row in flattened:
        values = []
        for key in ordered_keys:
            value = row.get(key, "")
            text = str(value).replace('"', '""')
            values.append(f'"{text}"')
        rows.append(",".join(values))
    return "\n".join(rows) + "\n"


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

        if parsed.path == "/__analytics/events-game.csv":
            if not self.is_authorized(params):
                self.write_unauthorized()
                return
            csv_body = game_events_to_csv(read_events(limit=5000)).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="analytics-game-events.csv"')
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
    print(f"Game events CSV:     http://{args.host}:{args.port}/__analytics/events-game.csv")
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
