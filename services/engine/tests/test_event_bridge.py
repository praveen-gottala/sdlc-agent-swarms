"""Tests for the file-based event bridge."""

from __future__ import annotations

from pathlib import Path

from agentforge_engine.event_bridge import (
    parse_event,
    read_events,
    truncate,
    write_event,
)
from agentforge_engine.models import AgentCompleted, AgentStarted


def test_write_and_read_events(tmp_path: Path) -> None:
    """Write events from engine, read back skipping own source."""
    (tmp_path / ".agentforge").mkdir()

    write_event(tmp_path, AgentStarted(agentId="a1", taskId="t1"), source="engine")
    write_event(
        tmp_path, AgentCompleted(agentId="a1", taskId="t1"), source="ts-runtime"
    )

    # Reading as engine should skip engine-sourced events.
    events = read_events(tmp_path, skip_source="engine")
    assert len(events) == 1
    assert events[0]["type"] == "AgentCompleted"


def test_offset_tracking_across_reads(tmp_path: Path) -> None:
    """Offset advances so subsequent reads don't replay old events."""
    (tmp_path / ".agentforge").mkdir()

    write_event(tmp_path, AgentStarted(agentId="a1", taskId="t1"), source="ts-runtime")
    events1 = read_events(tmp_path, skip_source="engine")
    assert len(events1) == 1

    # Second read returns nothing (no new events).
    events2 = read_events(tmp_path, skip_source="engine")
    assert len(events2) == 0

    # Write another event, only the new one appears.
    write_event(tmp_path, AgentStarted(agentId="a2", taskId="t2"), source="ts-runtime")
    events3 = read_events(tmp_path, skip_source="engine")
    assert len(events3) == 1
    assert events3[0]["agentId"] == "a2"


def test_source_filtering(tmp_path: Path) -> None:
    """Events from the same source as skip_source are filtered out."""
    (tmp_path / ".agentforge").mkdir()

    write_event(tmp_path, AgentStarted(agentId="a1", taskId="t1"), source="engine")
    write_event(tmp_path, AgentStarted(agentId="a2", taskId="t2"), source="engine")

    events = read_events(tmp_path, skip_source="engine")
    assert len(events) == 0


def test_truncate_resets(tmp_path: Path) -> None:
    """Truncate clears events and resets offset."""
    (tmp_path / ".agentforge").mkdir()

    write_event(tmp_path, AgentStarted(agentId="a1", taskId="t1"), source="ts-runtime")
    read_events(tmp_path, skip_source="engine")

    truncate(tmp_path)

    # After truncate, writing and reading should work fresh.
    write_event(tmp_path, AgentStarted(agentId="a3", taskId="t3"), source="ts-runtime")
    events = read_events(tmp_path, skip_source="engine")
    assert len(events) == 1
    assert events[0]["agentId"] == "a3"


def test_parse_event(tmp_path: Path) -> None:
    """Parse raw dict into typed DomainEvent."""
    data = {
        "type": "AgentStarted",
        "agentId": "a1",
        "taskId": "t1",
        "timestamp": 100.0,
    }
    event = parse_event(data)
    assert isinstance(event, AgentStarted)
    assert event.agentId == "a1"
