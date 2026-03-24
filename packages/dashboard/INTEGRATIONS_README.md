# AgentForge Dashboard — Integrations

The Integrations page provides a unified view of all external service connections used by AgentForge. It is organized into four tabs: **Channels**, **MCP Servers**, **LLM Providers**, and **Design Tools**.

## Channels

Messaging channels deliver notifications, approval requests, and status updates from agents to humans.

| Type | Icon | Description |
|------|------|-------------|
| `slack` | `#` | Slack workspace channels. Supports full HITL interaction, approvals, threaded status updates. |
| `telegram` | `@` | Telegram bots/groups. Good for mobile-first approval workflows and critical alerts. |
| `cli` | `>_` | Local developer terminal. Highest-fidelity output with full formatting. |
| `discord` | `D` | Discord server channels. Basic status updates and notifications. |
| `whatsapp` | `W` | WhatsApp Business API. Notify-only for critical escalation alerts. |
| `email` | `@` | Email distribution lists. Asynchronous status digests and critical alerts. |
| `teams` | `T` | Microsoft Teams channels. Approval workflows and status updates. |

### Channel Capabilities

Each channel declares its capability level:

- **full** — Can handle all interaction types: approvals, code review, status updates, alerts
- **approvals** — Can process approval requests with accept/reject buttons
- **basic** — Receives formatted messages but no interactive elements
- **notify-only** — One-way notifications, no response expected

### Routing Rules

Channels are assigned routing tags that control which events they receive:

- `approvals` — HITL approval requests
- `status_updates` — Task and phase progress notifications
- `critical_alerts` — Budget alerts, failures, security escalations

### Escalation Policy

Configurable timeout chain for unacknowledged approvals:

| Setting | Default | Description |
|---------|---------|-------------|
| `approval_timeout_minutes` | 60 | Time before escalating to secondary channel |
| `on_timeout` | `pause_and_notify_secondary` | Action on timeout (auto-approve is never allowed) |
| `secondary_timeout_minutes` | 120 | Time before pausing the pipeline entirely |

---

## MCP Servers

Model Context Protocol (MCP) servers provide tools that agents use to interact with external systems.

| Server | Transport | Auth | Tools |
|--------|-----------|------|-------|
| **Talk to Figma** | SSE | API Key | `figma.generate_figma_design`, `figma.get_screenshot`, `figma.get_metadata`, `figma.get_design_context`, `figma.whoami` |
| **GitHub** | stdio | Token | `github.create_pull_request`, `github.list_issues`, `github.get_file_contents`, `github.search_code`, `github.create_branch`, `github.merge_pr` |
| **Filesystem** | stdio | None | `fs.read_file`, `fs.write_file`, `fs.list_directory`, `fs.search_files` |
| **PostgreSQL** | SSE | Connection String | `postgres.query`, `postgres.list_tables`, `postgres.describe_table` |
| **Slack Notify** | stdio | Bot Token | `slack.send_message`, `slack.send_approval`, `slack.update_message` |
| **Docker** | stdio | None | `docker.list_containers`, `docker.run_container`, `docker.stop_container`, `docker.build_image`, `docker.logs` |

### Health Metrics

Each MCP server card displays:

- **Auth** — Authentication status (OK / Failed)
- **Rate** — Current usage vs rate limit (RPM)
- **Calls/24h** — Total tool invocations in the last 24 hours
- **Errors** — Error count in the last 24 hours (red if > 0)

---

## LLM Providers

AI model providers used for agent reasoning, code generation, and review.

| Provider | Models | Description |
|----------|--------|-------------|
| **Anthropic** | `claude-sonnet-4`, `claude-opus-4`, `claude-haiku-4` | Primary provider. Opus for architecture, Sonnet for general tasks, Haiku for fast review. |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o3-mini` | Alternative provider with strong coding capabilities. |
| **Google** | `gemini-2.5-pro`, `gemini-2.5-flash` | Long-context provider (1M tokens). Good for large codebase analysis. |
| **Ollama** | `llama-3.3-70b`, `deepseek-r1` | Local/self-hosted models. Zero cost, full privacy. Requires local GPU. |

### Provider Card Details

Each provider card shows:

- **Connection status** — Active (API key configured) or Available (ready to configure)
- **Models** — List of available models with context window sizes and per-1K-token costs
- **API Key** — Configuration status
- **Spend/24h** — Estimated spend in the last 24 hours
- **Calls/24h** — Total API calls in the last 24 hours

---

## Design Tools

Visual design integrations for the design-to-code pipeline.

| Tool | Description | Capabilities |
|------|-------------|-------------|
| **Figma** | Primary design tool. Bidirectional sync — read wireframes, write designs back. | `read_wireframes`, `write_designs`, `extract_tokens`, `code_connect`, `auto_layout`, `variables_api` |
| **Storybook** | Component development environment with visual testing. | `component_preview`, `visual_regression`, `accessibility_audit` |

---

## Configuration

All integrations are configured in the project's `agentforge.yaml` file under the following sections:

```yaml
channels:
  - type: slack
    name: "#dev-channel"
    capabilities: full
    priority: 1
    connected: true
    routing: [approvals, status_updates]

mcp:
  - name: "GitHub"
    uri: "stdio://github-mcp-server"
    transport: stdio
    auth: token
    rate_limit_rpm: 120
    tools: [github.create_pull_request, github.list_issues]

agents:
  providers:
    default: claude-sonnet-4
    overrides:
      architecture: claude-opus-4

design:
  figma:
    connected: true
    file_id: "abc123"
    capabilities: [read_wireframes, write_designs]
  storybook:
    connected: true
    url: "http://localhost:6006"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/channels` | GET | List all configured messaging channels with escalation policy |
| `/api/mcp` | GET | List all MCP servers with health metrics |
| `/api/providers` | GET | List all LLM providers (configured + available) with model metadata |
| `/api/design` | GET | List all design tools with capabilities |
| `/api/design` | PUT | Update design tool configuration |

## Testing

Run the integration tests:

```bash
npx nx test dashboard
```

Tests cover:
- All 7 channel types (slack, telegram, cli, discord, whatsapp, email, teams)
- All 4 LLM providers (Anthropic, OpenAI, Google, Ollama)
- All 2 design tools (Figma, Storybook)
- All 6 MCP servers with health metrics
- Edge cases: empty config, missing fields, provider inference from model names
