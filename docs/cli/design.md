# Design Commands

Commands for creating and iterating on designs through the UX agent pipeline.

## `agentforge design`

Request a new page design from the design agent pipeline (code-first workflow).

```bash
agentforge design <description>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | Yes | Natural language description of the page to design |

Publishes a `PageRequested` event for design agents to process. This is the code-first design workflow — for Figma-native design, use `design:figma`.

**Example:**
```bash
agentforge design "user profile settings page with avatar upload"
```

---

## `agentforge design:figma`

Create a Figma design via the full UX agent pipeline (Research, Planning, Design) with live Figma integration through the TalkToFigma WebSocket bridge.

```bash
agentforge design:figma <description> [options]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | Yes | Natural language description of what to design |

| Option | Description |
|--------|-------------|
| `--stage <stage>` | Skip to a stage: `research`, `planning`, `design` (loads prior stages from cache) |
| `--module <id>` | Module ID (default: derived from description) |
| `--no-wait` | Exit immediately after design without entering the feedback loop |

### Pipeline stages

1. **Research** — Analyzes PRD requirements, produces a design brief
2. **Planning** — Builds component spec with tree, tokens, responsive rules
3. **Design** — Creates Figma components via TalkToFigma MCP bridge

After design completes, an interactive feedback loop starts (unless `--no-wait` or non-TTY). See [Feedback Loop](#feedback-loop) below.

### Artifacts

All artifacts are saved to `.agentforge/previews/<module-id>/`:
- `research-brief.json` — research stage output
- `planning-spec.json` — planning stage output
- `figma-design.json` — design stage output (Figma node IDs, file ID, breakpoints)

### Skipping stages

Use `--stage` to resume from a specific stage, loading prior outputs from cached artifacts:

```bash
# Re-run only the design stage (reuses cached research + planning)
agentforge design:figma "cost dashboard" --stage design --module cost-dashboard
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | **Required.** Anthropic API key for LLM calls |
| `AGENTFORGE_MCP_FIGMA_WRITE_URL` | WebSocket URL for the Figma bridge (default: auto-detect) |
| `AGENTFORGE_MCP_FIGMA_CHANNEL` | Explicit channel to join (skips discovery) |
| `AGENTFORGE_MCP_FIGMA_FILE_ID` | Figma file ID for REST API features (screenshots, evaluation) |
| `AGENTFORGE_MCP_FIGMA_TOKEN` | Figma Personal Access Token (enables review feature) |

**Examples:**
```bash
# Full pipeline
agentforge design:figma "cost dashboard with charts and tables"

# Resume from design stage
agentforge design:figma "cost dashboard" --stage design --module cost-dashboard

# Skip feedback loop (CI/automation)
agentforge design:figma "cost dashboard" --no-wait

# Explicit Figma bridge connection
AGENTFORGE_MCP_FIGMA_CHANNEL=abc123 \
agentforge design:figma "cost dashboard" --stage design
```

---

## `agentforge design:collaborate`

Resume an existing Figma design for interactive human-agent collaboration without re-running the pipeline.

```bash
agentforge design:collaborate --module <id>
```

| Option | Required | Description |
|--------|----------|-------------|
| `--module <id>` | Yes | Module ID of the design to collaborate on |

Loads the saved `figma-design.json` artifact, connects to Figma, and enters the interactive feedback loop. No pipeline stages are re-run — this is purely for iterating on an existing design.

**Prerequisites:**
- A prior `design:figma` run must have completed and saved artifacts
- The Figma bridge must be running and the plugin connected

**Example:**
```bash
# Iterate on an existing design
agentforge design:collaborate --module cost-dashboard
```

---

## Feedback Loop

Both `design:figma` and `design:collaborate` enter an interactive feedback loop where you can collaborate with the agent on the Figma design.

### Commands

| Command | Description |
|---------|-------------|
| `approve` or `y` | Accept the design and exit |
| `quit` or `q` | Reject the design and exit |
| `review` or `r` | Capture a screenshot and evaluate the current design |
| `help` or `h` | Show available commands |
| Any other text | Send as natural language feedback to modify the design |

### Feedback

Type natural language instructions and the agent will translate them into Figma modifications:

```
> make the header background darker
  Applying feedback: "make the header background darker"...
  Feedback applied (1 change).
  [review] Score: 88/100 (good)
    [minor] Cards — slight spacing inconsistency
> increase card spacing to 16px
  Applying feedback: "increase card spacing to 16px"...
  Feedback applied (2 changes).
  [review] Score: 94/100 (good)
  [review] No issues found.
> approve
  Design approved.
```

### Review

After every agent change, an automatic review runs (if `AGENTFORGE_MCP_FIGMA_TOKEN` and `AGENTFORGE_MCP_FIGMA_FILE_ID` are set). The review:

1. Captures a screenshot of the design via the Figma REST API
2. Evaluates it against the planning spec using vision LLM
3. Reports a score (0-100) and any issues found

The review is **read-only** — it never auto-fixes or modifies the design. You decide what to act on. User's manual Figma edits are never touched.

You can also type `review` at any time to manually trigger an evaluation.

### Design-system-aware feedback

The feedback loop is design-system-aware. When you provide natural language feedback, the agent considers the full design system context:

- **Colors** — shade scales (Tailwind-based) so "darker" picks the next shade in the same color family (e.g., slate-800 → slate-900), not an arbitrary dark color
- **Typography** — scale steps (12px → 14px → 18px → 24px → 32px) so "bigger text" picks the next size, not a random value
- **Spacing** — system values (8px → 16px → 24px → 32px) so "more space" uses the next step in the scale
- **Component hierarchy** — knows which components contain which children and what tokens they use
- **Token bindings** — maps component properties to design tokens (e.g., `Header.fill → color.surface.header`)

This context is automatically loaded from the planning stage output and the design system prompt. If no planning artifact is available (e.g., in `design:collaborate` without prior planning), the feedback loop degrades gracefully to the generic prompt.

### Non-TTY behavior

When stdin is not a TTY (piped input, CI), the feedback loop auto-approves immediately:

```bash
# CI mode — no interactive prompt
echo "" | agentforge design:figma "dashboard" --module my-module
```

Use `--no-wait` for explicit non-interactive mode.

---

## Figma Bridge Setup

The design commands communicate with Figma through the TalkToFigma WebSocket bridge.

### Docker setup

```bash
docker compose build figma-bridge
docker compose up -d figma-bridge
```

### Connecting the plugin

1. Open Figma desktop app
2. Go to **Plugins > TalkToFigma**
3. The bridge auto-discovers the plugin channel, or set `AGENTFORGE_MCP_FIGMA_CHANNEL` explicitly

### Troubleshooting

- **"No active Figma plugin detected"** — Open Figma and start the TalkToFigma plugin
- **Channel not discovered** — Rebuild the Docker bridge (`docker compose build --no-cache figma-bridge`) to apply the `/channels` endpoint patch, or set `AGENTFORGE_MCP_FIGMA_CHANNEL` manually
- **"Invalid tool name"** — The LLM generated an unrecognized Figma operation; try rephrasing your feedback
