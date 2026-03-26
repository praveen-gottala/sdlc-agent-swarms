# AgentForge CLI Reference

Command-line interface for the AgentForge multi-agent SDLC framework.

```bash
npm install -g @agentforge/cli
agentforge --help
```

## Command Groups

### [Setup & Configuration](./setup.md)

Project initialization, settings, and integration verification.

| Command | Description |
|---------|-------------|
| `agentforge init [dir] [--mock]` | Scaffold a new project with interactive wizard |
| `agentforge setup` | Bootstrap the Python orchestration engine |
| `agentforge config [key] [value]` | View or update configuration |
| `agentforge doctor` | Verify integrations are reachable |
| `agentforge migrate [--dry]` | Apply schema migrations to YAML files |

### [Design](./design.md)

Create and iterate on designs through the UX agent pipeline.

| Command | Description |
|---------|-------------|
| `agentforge design <description>` | Request a code-first design |
| `agentforge design:figma <description>` | Create a Figma design via Research/Planning/Design pipeline |
| `agentforge design:penpot <description>` | Create a Penpot design via Research/Planning/Design pipeline |
| `agentforge design:collaborate --module <id>` | Resume an existing design for human-agent collaboration |

### [Orchestration](./orchestration.md)

Run SDLC phases and manage tasks.

| Command | Description |
|---------|-------------|
| `agentforge start <phase>` | Start an SDLC phase (design, spec, code, cicd, observe) |
| `agentforge status [--watch]` | View task status |
| `agentforge approve <task_id>` | Approve a task awaiting human review |
| `agentforge abort [task_id]` | Stop a running or pending task |

## Global Requirements

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For LLM-powered commands | Anthropic API key |

Run `agentforge doctor` to verify all integrations.
