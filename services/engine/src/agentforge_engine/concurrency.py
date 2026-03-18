"""Slot manager for concurrent agent execution.

Enforces the max_concurrent_agents limit from the project manifest.
CI-blocked agents keep their slot per PRD 11.3.4.
"""

from __future__ import annotations

import threading


class SlotManager:
    """Track active agent slots, including CI-waiting agents."""

    def __init__(self, max_slots: int) -> None:
        self._max_slots = max_slots
        self._executing: set[str] = set()
        self._ci_waiting: set[str] = set()
        self._lock = threading.Lock()

    @property
    def max_slots(self) -> int:
        return self._max_slots

    @property
    def active_count(self) -> int:
        """Total slots in use (executing + CI-waiting)."""
        with self._lock:
            return len(self._executing) + len(self._ci_waiting)

    @property
    def executing_ids(self) -> frozenset[str]:
        with self._lock:
            return frozenset(self._executing)

    @property
    def ci_waiting_ids(self) -> frozenset[str]:
        with self._lock:
            return frozenset(self._ci_waiting)

    def can_start(self) -> bool:
        """Whether there is a free slot to start a new task."""
        return self.active_count < self._max_slots

    def acquire(self, task_id: str) -> bool:
        """Try to acquire a slot for *task_id*. Returns True on success."""
        with self._lock:
            if len(self._executing) + len(self._ci_waiting) >= self._max_slots:
                return False
            if task_id in self._executing or task_id in self._ci_waiting:
                return False
            self._executing.add(task_id)
            return True

    def release(self, task_id: str) -> None:
        """Release the slot held by *task_id*."""
        with self._lock:
            self._executing.discard(task_id)
            self._ci_waiting.discard(task_id)

    def mark_ci_waiting(self, task_id: str) -> None:
        """Transition a task from executing to CI-waiting (slot stays occupied)."""
        with self._lock:
            if task_id in self._executing:
                self._executing.discard(task_id)
                self._ci_waiting.add(task_id)
