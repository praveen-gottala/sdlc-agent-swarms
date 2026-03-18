"""YAML I/O for project manifest and tasks files.

Uses ruamel.yaml for round-trip fidelity with TypeScript-generated YAML.
"""

from __future__ import annotations

from pathlib import Path

from ruamel.yaml import YAML

from .models import ProjectManifest, TaskEntry, TasksFile

_yaml = YAML()
_yaml.preserve_quotes = True  # type: ignore[assignment]


def load_manifest(project_root: Path) -> ProjectManifest:
    """Load the agentforge.yaml project manifest."""
    manifest_path = project_root / "agentforge.yaml"
    with manifest_path.open() as f:
        data = _yaml.load(f)
    return ProjectManifest.model_validate(data)


def load_tasks(project_root: Path) -> TasksFile:
    """Load the agentforge.tasks.yaml task state file."""
    tasks_path = project_root / "agentforge.tasks.yaml"
    if not tasks_path.exists():
        return TasksFile(tasks=[])
    with tasks_path.open() as f:
        data = _yaml.load(f)
    if data is None:
        return TasksFile(tasks=[])
    return TasksFile.model_validate(data)


def save_tasks(project_root: Path, tasks: TasksFile) -> None:
    """Write the agentforge.tasks.yaml task state file (round-trip safe)."""
    tasks_path = project_root / "agentforge.tasks.yaml"
    data = tasks.model_dump()
    with tasks_path.open("w") as f:
        _yaml.dump(data, f)


def update_task_status(
    project_root: Path, task_id: str, status: str
) -> TaskEntry | None:
    """Update a single task's status in the tasks file and return the updated entry."""
    tf = load_tasks(project_root)
    updated: list[TaskEntry] = []
    found: TaskEntry | None = None
    for t in tf.tasks:
        if t.id == task_id:
            found = t.model_copy(update={"status": status})
            updated.append(found)
        else:
            updated.append(t)
    if found is not None:
        save_tasks(project_root, TasksFile(tasks=updated))
    return found
