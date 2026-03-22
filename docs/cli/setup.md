# Setup & Configuration Commands

Commands for initializing projects, configuring settings, and verifying integrations.

## `agentforge init`

Scaffold a new AgentForge project with an interactive wizard.

```bash
agentforge init [directory]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `directory` | No | Target directory (defaults to current directory) |

The wizard asks 5 questions to configure your project, then generates:
- `agentforge.manifest.yaml` — project manifest
- `agentforge.agents.yaml` — agent configuration
- `.agentforge/` — working directory for artifacts
- Spec and task directories

**Example:**
```bash
agentforge init my-project
```

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
