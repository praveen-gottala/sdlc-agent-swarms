"""File-based event transport between Python engine and TypeScript runtime.

Events are stored as JSON lines in `.agentforge/events.jsonl`.
Each line has a `source` field ("engine" or "ts-runtime") so each side
can skip events it produced itself.

The read offset is persisted in `.agentforge/engine_offset` for restart
resilience.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from .models import DomainEvent

_event_adapter: TypeAdapter[DomainEvent] = TypeAdapter(DomainEvent)

_EVENTS_FILE = ".agentforge/events.jsonl"
_OFFSET_FILE = ".agentforge/engine_offset"


def _events_path(project_root: Path) -> Path:
    return project_root / _EVENTS_FILE


def _offset_path(project_root: Path) -> Path:
    return project_root / _OFFSET_FILE


def ensure_dir(project_root: Path) -> None:
    """Create the .agentforge directory if it doesn't exist."""
    (project_root / ".agentforge").mkdir(parents=True, exist_ok=True)


def write_event(
    project_root: Path,
    event: DomainEvent,
    source: str = "engine",
) -> None:
    """Append an event as a JSON line to the events file."""
    ensure_dir(project_root)
    ep = _events_path(project_root)
    payload = event.model_dump(by_alias=True)
    payload["source"] = source
    with ep.open("a") as f:
        f.write(json.dumps(payload, separators=(",", ":")) + "\n")


def read_events(
    project_root: Path,
    skip_source: str = "engine",
) -> list[dict[str, Any]]:
    """Read new events since the last tracked offset, skipping own source."""
    ep = _events_path(project_root)
    if not ep.exists():
        return []

    offset = _load_offset(project_root)
    events: list[dict[str, Any]] = []

    with ep.open("r") as f:
        f.seek(offset)
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if data.get("source") != skip_source:
                events.append(data)
        new_offset = f.tell()

    _save_offset(project_root, new_offset)
    return events


def parse_event(data: dict[str, Any]) -> DomainEvent:
    """Parse a raw dict into a typed DomainEvent."""
    # Remove transport-only fields before validation.
    cleaned = {k: v for k, v in data.items() if k != "source"}
    return _event_adapter.validate_python(cleaned)


def truncate(project_root: Path) -> None:
    """Truncate the events file and reset the offset (called at phase start)."""
    ensure_dir(project_root)
    ep = _events_path(project_root)
    ep.write_text("")
    _save_offset(project_root, 0)


def _load_offset(project_root: Path) -> int:
    op = _offset_path(project_root)
    if not op.exists():
        return 0
    try:
        return int(op.read_text().strip())
    except (ValueError, OSError):
        return 0


def _save_offset(project_root: Path, offset: int) -> None:
    ensure_dir(project_root)
    op = _offset_path(project_root)
    op.write_text(str(offset))
