"""Shared test fixtures for the orchestration engine."""

from __future__ import annotations

import pytest
from pathlib import Path
from ruamel.yaml import YAML

_yaml = YAML()


@pytest.fixture()
def tmp_project(tmp_path: Path) -> Path:
    """Create a minimal project directory with agentforge.yaml and tasks."""
    manifest = {
        "version": "1.0",
        "project": {
            "name": "test-project",
            "id": "test-001",
            "description": "A test project",
            "platforms": ["web"],
        },
        "stack": {
            "frontend": "react",
            "backend": "node",
            "database": "postgres",
            "styling": "tailwind",
        },
        "repo": {"provider": "github", "org": "test-org", "name": "test-repo"},
        "agents": {
            "providers": {"default": "anthropic", "overrides": None},
            "sandbox": {"type": "docker", "timeout_minutes": 10, "max_retries": 3},
            "orchestration": {
                "max_concurrent_agents": 3,
                "ci_wait_strategy": "poll",
            },
        },
        "hitl": {"default": "full_approval", "overrides": None},
        "channels": [
            {"type": "cli", "capabilities": "full", "priority": 1},
        ],
        "routing": {
            "approval_requests": "all",
            "status_updates": "primary",
            "critical_alerts": "all",
        },
        "budget": {
            "per_task_max_usd": 5.0,
            "per_phase_max_usd": 50.0,
            "monthly_max_usd": 500.0,
            "alert_threshold": 0.8,
        },
    }

    tasks = {
        "tasks": [
            {
                "id": "task-1",
                "title": "Design homepage",
                "phase": "design",
                "agent": "design-agent",
                "status": "pending",
                "depends_on": [],
                "spec_ref": "specs/homepage.yaml",
                "branch": None,
                "pr_number": None,
                "cost_usd": 0.0,
                "tokens_used": 0,
                "attempts": 0,
                "max_attempts": 3,
                "hitl_status": "",
                "hitl_channel": None,
            },
            {
                "id": "task-2",
                "title": "Implement auth",
                "phase": "code",
                "agent": "code-agent",
                "status": "pending",
                "depends_on": ["task-1"],
                "spec_ref": "specs/auth.yaml",
                "branch": None,
                "pr_number": None,
                "cost_usd": 0.0,
                "tokens_used": 0,
                "attempts": 0,
                "max_attempts": 3,
                "hitl_status": "",
                "hitl_channel": None,
            },
            {
                "id": "task-3",
                "title": "Implement API",
                "phase": "code",
                "agent": "code-agent",
                "status": "pending",
                "depends_on": ["task-1"],
                "spec_ref": "specs/api.yaml",
                "branch": None,
                "pr_number": None,
                "cost_usd": 0.0,
                "tokens_used": 0,
                "attempts": 0,
                "max_attempts": 3,
                "hitl_status": "",
                "hitl_channel": None,
            },
        ]
    }

    with (tmp_path / "agentforge.yaml").open("w") as f:
        _yaml.dump(manifest, f)
    with (tmp_path / "agentforge.tasks.yaml").open("w") as f:
        _yaml.dump(tasks, f)

    (tmp_path / ".agentforge").mkdir(exist_ok=True)
    return tmp_path
