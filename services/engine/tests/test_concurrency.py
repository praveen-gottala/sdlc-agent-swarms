"""Tests for SlotManager."""

from __future__ import annotations

from agentforge_engine.concurrency import SlotManager


def test_acquire_and_release() -> None:
    sm = SlotManager(max_slots=2)
    assert sm.can_start()
    assert sm.acquire("t1")
    assert sm.acquire("t2")
    assert not sm.can_start()
    assert not sm.acquire("t3")

    sm.release("t1")
    assert sm.can_start()
    assert sm.acquire("t3")


def test_ci_waiting_holds_slot() -> None:
    sm = SlotManager(max_slots=2)
    sm.acquire("t1")
    sm.acquire("t2")

    sm.mark_ci_waiting("t1")
    # t1 moved to CI-waiting but slot is still occupied.
    assert sm.active_count == 2
    assert not sm.can_start()
    assert "t1" in sm.ci_waiting_ids
    assert "t1" not in sm.executing_ids


def test_release_ci_waiting() -> None:
    sm = SlotManager(max_slots=2)
    sm.acquire("t1")
    sm.mark_ci_waiting("t1")
    sm.release("t1")
    assert sm.active_count == 0
    assert sm.can_start()


def test_cannot_acquire_duplicate() -> None:
    sm = SlotManager(max_slots=3)
    assert sm.acquire("t1")
    assert not sm.acquire("t1")


def test_max_slots_property() -> None:
    sm = SlotManager(max_slots=5)
    assert sm.max_slots == 5
