"""Shared state schema and helpers for LangGraph phase graphs."""

from __future__ import annotations

from typing import TypedDict


class BasePhaseState(TypedDict, total=False):
    """Base state shared by all phase graphs."""

    project_root: str
    phase: str
    manifest: dict
    tasks: list[dict]
    events: list[dict]
    hitl_decision: str | None
    hitl_feedback: str | None
    error: str | None
