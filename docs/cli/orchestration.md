# Orchestration Commands

Commands for running SDLC phases and managing the orchestration engine.

## `agentforge start`

Start the orchestration engine for an SDLC phase.

```bash
agentforge start <phase>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `phase` | Yes | SDLC phase to start |

### Phases

| Phase | Description |
|-------|-------------|
| `design` | Run design agents (UX research, planning, implementation) |
| `spec` | Run specification agents (requirements analysis, API contracts) |
| `code` | Run code generation agents (implementation from spec) |
| `cicd` | Run CI/CD agents (pipeline generation, deployment) |
| `observe` | Run observability agents (monitoring, alerting) |

The engine auto-starts if not already running (equivalent to running `agentforge setup` first). The active thread ID is persisted for subsequent `status` and `approve` commands.

**Examples:**
```bash
# Start the design phase
agentforge start design

# Start code generation
agentforge start code
```

---

## `agentforge status`

View task status for the current project.

```bash
agentforge status [--watch]
```

| Option | Description |
|--------|-------------|
| `-w, --watch` | Live-updating mode, refreshes every 2 seconds |

Reads `agentforge.tasks.yaml` and displays a formatted table of all tasks grouped by phase. Shows task ID, status, assigned agent, and timestamps.

**Examples:**
```bash
# View current status
agentforge status

# Watch for changes (live refresh)
agentforge status --watch
```

---

## `agentforge approve`

Approve a task awaiting human review (HITL checkpoint).

```bash
agentforge approve <task_id> [--changes <feedback>]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `task_id` | Yes | ID of the task to approve |

| Option | Description |
|--------|-------------|
| `--changes <feedback>` | Request changes instead of approving, with feedback text |

Marks the task as approved (or requests changes), emits a `HITLApproved` event, updates the YAML file, and notifies the engine if an active thread exists.

**Examples:**
```bash
# Approve a task
agentforge approve task_design_001

# Request changes
agentforge approve task_design_001 --changes "Add dark mode support"
```

---

## `agentforge abort`

Stop a running or pending task.

```bash
agentforge abort [task_id] [--cleanup] [--all]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `task_id` | No | ID of the task to abort (required unless `--all`) |

| Option | Description |
|--------|-------------|
| `--cleanup` | Delete the feature branch after aborting |
| `--all` | Abort all in-progress and pending tasks |

Marks the task(s) as aborting, emits `AgentAborted` events, polls the engine until terminal state, then optionally deletes Git branches.

**Examples:**
```bash
# Abort a specific task
agentforge abort task_code_042

# Abort and clean up the branch
agentforge abort task_code_042 --cleanup

# Abort everything
agentforge abort --all
```
