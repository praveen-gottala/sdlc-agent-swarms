# Setup & Configuration Commands

Commands for initializing projects, configuring settings, and verifying integrations.

## `agentforge init`

Scaffold a new AgentForge project with an interactive wizard.

```bash
agentforge init [directory] [--mock]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `directory` | No | Target directory (defaults to current directory) |

| Option | Description |
|--------|-------------|
| `--mock` | Skip LLM calls and use built-in design archetypes (for testing) |

The wizard asks 7 questions to configure your project, then generates:
- `agentforge.yaml` — project manifest
- `agentforge/agents.yaml` — agent configuration
- `agentforge/spec/design-tokens.yaml` — design tokens (colors, typography, spacing)
- `agentforge/spec/brand.yaml` — brand direction (tone, audience, accessibility)
- `tailwind.config.ts` — Tailwind CSS config wired to design tokens
- `src/styles/global.css` — CSS with Google Fonts import
- `.agentforge/` — working directory for artifacts
- Spec, task, and journey directories

**Example:**
```bash
agentforge init my-project
```

---

## `agentforge design-system`

Manage the project design system (tokens, brand, validation).

### `agentforge design-system show`

Display the current design system configuration: colors, typography, spacing, and brand.

```bash
agentforge design-system show
```

### `agentforge design-system update`

Re-run the design system wizard. Two independent steps:

1. **Component library** — pick which React library to build with (shadcn/ui, MUI, Chakra UI, Ant Design, Radix Themes, or Mantine). Writes `component-library.yaml` with React import mappings so the implementation agent uses the correct component imports.
2. **Visual theme** — LLM generates 3 design options (colors, fonts, brand) tailored to your app. Opens an HTML preview for comparison. Falls back to built-in archetypes if no API key.

These are independent: a cafe app using MUI still gets warm, inviting colors. The component library determines *imports*, the theme determines *visual identity*.

```bash
agentforge design-system update [--mock]
```

| Option | Description |
|--------|-------------|
| `--mock` | Skip LLM calls and use built-in design archetypes (for testing) |

Writes: `component-library.yaml`, `design-tokens.yaml`, `brand.yaml`, `tailwind.config.ts`, `global.css`.

### `agentforge design-system validate`

Validate `design-tokens.yaml` and `brand.yaml` for internal consistency.

```bash
agentforge design-system validate
```

Checks:
- Semantic colors reference existing primitive colors
- Typography scale entries reference existing font families
- Spacing scale is sorted ascending
- WCAG level is valid
- Motion duration is positive

Returns exit code 0 if valid, 1 if errors found.

**Examples:**
```bash
# View current design system
agentforge design-system show

# Change to bold archetype
agentforge design-system update

# Check for consistency errors
agentforge design-system validate
```

**Note:** `design-tokens.yaml` and `brand.yaml` are created during `agentforge init`. Projects without these files will show a message suggesting to run init or update.

---

## `agentforge setup`

Bootstrap the Python orchestration engine environment.

```bash
agentforge setup
```

No arguments. Creates a Python virtual environment and installs LangGraph dependencies. Automatically triggered by `agentforge start` if not already set up.

---

## `agentforge config`

View or update `agentforge.yaml` configuration.

```bash
agentforge config [key] [value]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `key` | No | Dot-notation config key (e.g. `budget.per_task_max_usd`) |
| `value` | No | New value to set |

**Behavior:**
- No arguments: prints the full configuration
- Key only: prints that specific value
- Key + value: updates the configuration

**Examples:**
```bash
# View all config
agentforge config

# View a specific setting
agentforge config agents.providers.default

# Update a setting
agentforge config budget.per_task_max_usd 5.0
```

---

## `agentforge doctor`

Verify that configured integrations are reachable.

```bash
agentforge doctor
```

No arguments. Checks:
- **Infrastructure:** Python availability, engine source files
- **LLM providers:** Anthropic, OpenAI, Vertex AI API connectivity
- **Channels:** Slack, Telegram, Figma env var validation

**Example:**
```bash
agentforge doctor
```

---

## `agentforge migrate`

Apply pending schema migrations to YAML files.

```bash
agentforge migrate [--dry]
```

| Option | Description |
|--------|-------------|
| `--dry` | Preview changes without applying them |

Reads all versioned YAML files (manifest, spec, tasks), detects version mismatches, and applies migrations in order.

**Examples:**
```bash
# Apply migrations
agentforge migrate

# Preview what would change
agentforge migrate --dry
```

---

## Penpot Prerequisites

To use `design:penpot` or `design:collaborate --tool penpot`, the following must be configured:

### 1. Docker

Docker must be installed and running. The Penpot MCP server runs as a Docker container.

### 2. Penpot MCP Server

Start the Penpot MCP server:

```bash
docker compose up -d penpot-mcp
```

The server listens on port 4401 by default (HTTP/SSE transport).

### 3. Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENTFORGE_MCP_PENPOT_URL` | `http://localhost:4401/mcp` | Penpot MCP server URL |
| `ANTHROPIC_API_KEY` | -- | Required for LLM calls |

### 4. Penpot Application

Open the Penpot desktop application (or web app) with your target project before running design commands. Unlike Figma, Penpot does not require a browser plugin -- the MCP server communicates directly via HTTP.

### Troubleshooting

- **"Penpot MCP not reachable"** -- Ensure Docker is running and the container is healthy: `docker compose ps penpot-mcp`
- **"Session expired"** -- Sessions are cached for 30 minutes. Re-run the command to establish a new session.
- **Tool discovery fails** -- The Penpot MCP server may not be fully initialized. Wait a few seconds and retry.
