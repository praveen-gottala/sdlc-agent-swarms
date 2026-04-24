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
| `agentforge describe` | Capture app context / generate PRD |
| `agentforge design-system update [--mock]` | Re-run the design system wizard |
| `agentforge design-system show` | Display current design system |
| `agentforge design-system validate` | Validate design tokens and brand spec |
| `agentforge design-system regenerate-catalog` | Regenerate component catalog from base template |
| `agentforge config [key] [value]` | View or update configuration |
| `agentforge doctor` | Verify integrations are reachable |
| `agentforge migrate [--dry]` | Apply schema migrations to YAML files |
| `agentforge setup` | Bootstrap project dependencies |

### [Design](./design.md)

Create and iterate on designs through the UX agent pipeline.

| Command | Description |
|---------|-------------|
| `agentforge design:generate` | Generate app spec (pages, models, API) from PRD |
| `agentforge design:preview` | Open design system preview in browser |
| `agentforge design <description>` | Request a code-first design (event-driven) |
| `agentforge design:page <pageId>` | Create a design via Research/Planning/Design pipeline |
| `agentforge design:page:all` | Batch-design all pages from `pages.yaml` |
| `agentforge design:page:browser <description>` | Create design via Playwright browser automation |
| `agentforge design:page:review --url <url>` | Review and improve an existing design via browser agent |
| `agentforge design:list` | List all designs with status and metadata |

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
