# AgentForge

Multi-agent framework for end-to-end SDLC orchestration. Design, spec, build, deploy, and observe -- all driven by AI agents with human-in-the-loop oversight.

**Open source, Apache 2.0.**

## What is AgentForge?

AgentForge is a CLI-driven framework that orchestrates AI agents across every phase of the software development lifecycle. It provides:

- **Design agents** that create UX designs in Figma or Penpot from natural language descriptions
- **Spec generation** that turns a PRD into pages, models, and API definitions
- **SDLC orchestration** with a Python + LangGraph engine managing agent workflows
- **Human-in-the-loop** approval gates at every critical checkpoint
- **Design system** support with tokens, brand identity, and WCAG accessibility compliance

## Prerequisites

| Requirement | Purpose |
|---|---|
| Node.js 18+ | CLI and TypeScript packages |
| Python 3.9+ | Orchestration engine (LangGraph) |
| Docker | Figma bridge / Penpot MCP server |
| `ANTHROPIC_API_KEY` | Required for all LLM-powered commands |

## Installation

Clone the repo and link the CLI locally:

```bash
git clone https://github.com/praveengottala/sdlc-agent-swarms.git
cd sdlc-agent-swarms
npm install
npx nx build cli
npm link --prefix packages/cli
```

> **Note:** Do NOT run `npm install -g @agentforge/cli` -- that installs an
> unrelated package from the npm registry, not this project.

After linking, the `agentforge` command is available globally and points to your
local build. To rebuild after making changes:

```bash
npx nx build cli
```

## Quick Start: Onboarding an App

### 1. Initialize the project

```bash
agentforge init my-app
cd my-app
```

The interactive wizard asks for project name, description, Git repo, Slack channel, design archetype (`warm`, `professional`, or `bold`), and target audience. It generates:

- `agentforge.yaml` -- project manifest
- `agentforge/agents.yaml` -- agent configuration
- `design-tokens.yaml` -- colors, typography, spacing
- `brand.yaml` -- brand identity and accessibility settings
- `tailwind.config.ts` -- wired to your design tokens

### 2. Describe your application

```bash
agentforge describe
```

Provide an existing PRD or answer a short Q&A (app description, target users, key features, technical constraints). Outputs `docs/prd.md` as the single source of truth.

### 3. Generate app spec

```bash
agentforge design:generate
```

Reads your PRD and generates a complete app spec: pages, data models, and API endpoints.

### 4. Create designs

Using Figma:

```bash
# Start the Figma bridge
docker compose up -d figma-bridge

# Design a screen
agentforge design:figma "dashboard with analytics charts and user activity feed"
```

Using Penpot:

```bash
docker compose up -d penpot-mcp
agentforge design:penpot "dashboard with analytics charts and user activity feed"
```

Both run a three-stage pipeline: **Research** (analyzes PRD, produces design brief) -> **Planning** (component spec with tokens and responsive rules) -> **Design** (creates components in the design tool).

After design, an interactive feedback loop lets you refine:

- Type natural language feedback to iterate
- `review` / `r` -- capture screenshot and score against spec
- `approve` / `y` -- accept the design
- `quit` / `q` -- discard

### 5. Run SDLC phases

```bash
agentforge start design    # or: spec, code, cicd, observe
```

Auto-bootstraps the Python orchestration engine on first run.

### 6. Monitor and approve

```bash
# Watch task progress in real time
agentforge status --watch

# Approve a task at a human review checkpoint
agentforge approve <task_id>

# Request changes instead
agentforge approve <task_id> --changes "use the secondary color palette for the sidebar"
```

### 7. Verify integrations

```bash
agentforge doctor
```

Checks Python availability, LLM provider connectivity (Anthropic, OpenAI, Vertex AI), and channel integrations (Slack, Telegram, Figma).

## CLI Command Reference

### Setup & Configuration

| Command | Description |
|---|---|
| `agentforge init [dir]` | Scaffold a new project with interactive wizard |
| `agentforge describe` | Capture app context via PRD (provide or generate) |
| `agentforge setup` | Bootstrap the Python orchestration engine |
| `agentforge config [key] [value]` | View or update `agentforge.yaml` (supports dot-notation) |
| `agentforge doctor` | Verify integrations are reachable |
| `agentforge migrate [--dry]` | Apply pending schema migrations to YAML files |

### Design System

| Command | Description |
|---|---|
| `agentforge design-system show` | Display current design tokens and brand config |
| `agentforge design-system update` | Re-run archetype selection wizard |
| `agentforge design-system validate` | Validate tokens for internal consistency |

### Design (UX Agent Pipeline)

| Command | Description |
|---|---|
| `agentforge design <description>` | Code-first design (emits `PageRequested` event) |
| `agentforge design:figma <desc>` | Full Figma pipeline: Research -> Planning -> Design |
| `agentforge design:penpot <desc>` | Full Penpot pipeline: Research -> Planning -> Design |
| `agentforge design:collaborate --module <id>` | Resume a design for human-agent collaboration |
| `agentforge design:generate` | Generate pages, models, and API spec from PRD |
| `agentforge design:preview` | Open design system preview in browser |

### Orchestration

| Command | Description |
|---|---|
| `agentforge start <phase>` | Start an SDLC phase (`design`, `spec`, `code`, `cicd`, `observe`) |
| `agentforge status [--watch]` | View task status (live-updating with `--watch`) |
| `agentforge approve <task_id>` | Approve a task awaiting human review |
| `agentforge abort [task_id] [--all]` | Stop a running or pending task |

See [docs/cli/](docs/cli/) for detailed command reference.

## Architecture

```
packages/
  cli/          Commander.js CLI (TypeScript)
  core/         Zero-dep core: types, event bus, state, MCP transports
  governance/   Middleware wrapping agent execution (budget, HITL, policies)
  providers/    LLM provider adapters (Anthropic, OpenAI, Vertex AI)
  channels/     Notification channels (Slack, Telegram)
  agents-ux/    UX design agents (Figma + Penpot pipelines)
  dashboard/    Next.js monitoring dashboard

services/
  engine/       Python + LangGraph orchestration engine

docs/
  PRD-v2.md     Product requirements (source of truth)
  adrs/         Architecture decision records
  cli/          CLI command documentation
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npx nx run-many -t build

# Run tests
npx nx run-many -t test

# Test a single package
npx nx test core

# Type check
npx nx run-many -t typecheck

# Lint
npx nx run-many -t lint
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `AGENTFORGE_MCP_FIGMA_WRITE_URL` | For Figma commands | WebSocket URL for Figma bridge |
| `AGENTFORGE_MCP_FIGMA_FILE_ID` | For Figma screenshots | Figma file ID (REST API) |
| `AGENTFORGE_MCP_FIGMA_TOKEN` | For Figma review | Figma Personal Access Token |
| `AGENTFORGE_MCP_PENPOT_URL` | For Penpot commands | Penpot MCP server URL |

## License

Apache 2.0
