# Design Commands

Commands for creating and iterating on designs through the UX agent pipeline.

## `agentforge design:generate`

Generate the application specification (pages, models, API) from a PRD.

**Interactive.** Prompts for design theme selection and spec approval.

**Claude Code limitation:** Piped input (`printf 'n\ny\n' |`) partially works
but hangs on the theme selection prompt (expects 1/2/3, not y). Run
interactively via `! cd <project> && node ../../packages/cli/dist/bin.js design:generate`.

```bash
cd <project-root>
agentforge design:generate
```

| Prompt | Options | Notes |
|--------|---------|-------|
| "Regenerate design system?" | y/n | `n` keeps existing tokens |
| "Choose 1, 2, or 3" | 1/2/3/r | Design theme selection |
| "Approve this spec?" | y/r/n | `y` writes pages.yaml |

**Outputs:** `agentforge/spec/pages.yaml`, `agentforge/spec/models.yaml`,
`agentforge/spec/api.yaml`

**Screen type classification:** The LLM assigns `screen_type` per page:
- `page` (default) — full-screen views
- `drawer` — side panels (notifications, settings)
- `modal` — confirmation dialogs
- `sheet` — bottom panels

!!! warning "Gotcha: Page IDs change on regeneration"

    The LLM generates new descriptive IDs (`dashboard`, `claims-list`) that don't match existing design files (`page-001.json`). Existing designs become orphaned. Dashboard shows "Ready to design" for pages that have designs under old names. Manual rename required.

---

## `agentforge design:page`

Run the full UX pipeline (Research → Planning → Design) for a single page.

```bash
cd <project-root>
agentforge design:page <pageId> [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--tool <tool>` | string | `browser` | Design tool: `browser` or `penpot` |
| `--stage <stage>` | string | — | Skip to stage: `research`, `planning`, `design`, `replay`, `replay-browser`, `connect` |
| `--width <px>` | number | 1440 | Viewport width in pixels |
| `--fresh` | boolean | false | Force re-run all stages, ignoring cached artifacts |
| `--evaluate` | boolean | false | Non-interactive design evaluation (CI/CD mode) |
| `--evaluate-threshold <score>` | number | 75 | Minimum score (0-100) for `--evaluate` |
| `--implement` | boolean | false | Skip feedback loop, generate code directly |
| `--interactive` / `--no-interactive` | boolean | auto | Force interactive/non-interactive browser correction |
| `--export-penpot` / `--no-export-penpot` | boolean | prompt | Export to Penpot after design |
| `--penpot-correction` | boolean | false | Use legacy Penpot-based correction |
| `--mock` | boolean | false | Use mock LLM provider (no API key needed) |
| `--no-wait` | boolean | false | Exit after design without feedback loop |

**Special stages (`--stage`):**
- `replay` — re-execute cached Penpot script (requires Penpot connection, `--tool penpot` only)
- `replay-browser` — re-render cached DesignSpec v2 in browser. Works for both `--tool browser` and `--tool penpot` runs since both produce `scripts/designspec-v2.json` in DesignSpecV2 format.
- `connect` — test Penpot connection only

---

## `agentforge design:page:all`

Run the full design pipeline for all pages in `pages.yaml`.

```bash
cd <project-root>
agentforge design:page:all [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--tool <tool>` | string | `browser` | Design tool: `browser` or `penpot` |
| `--pages <ids>` | string | — | Only design specific pages (comma-separated) |
| `--width <px>` | number | 1440 | Override viewport width for all pages |
| `--design-only` | boolean | false | Skip LLM calls, use cached research/planning/chrome |

**Pipeline stages (sequential per vision Layer 7):**

```
Chrome Pass: runDesignPipeline({ chromePass: { mode: 'generate' }, ... })
             on the reference page — produces shared-chrome.json once.
For each remaining page (sequentially, in spec order):
  runDesignPipeline({ chromePass: { mode: 'consume', spec, activePageId }, ... })
    → Research → Planning → Design (LLM) → Evaluator
  Post-pipeline: runBrowserCorrectionPipeline (non-interactive, --tool browser only)
  Write penpot-design.json envelope (script/nodeIds/projectId for --tool penpot,
  browserCorrectionResult for --tool browser).
Manifest: build prototype.json with screens + navigation bindings.
```

Sequential per-page processing matches vision Layer 7 ("across-screen
generation is sequential via topological order"); the previous parallel
stage model has been removed. The `--concurrency` flag is deprecated and
ignored — a warning is printed if set.

**Timing:** Sequential processing trades wall-clock for vision-correct
ordering. Expect roughly `pages × single-page-time`, with cache warm-up
benefiting `--design-only` runs (no LLM calls when research/planning
artifacts are present). Reference numbers from the prior parallel model
(~163s wall-clock for 6 pages) no longer apply — measure on your project.

**Screen type → viewport resolution:**

| screen_type | Design width | Rendering |
|-------------|-------------|-----------|
| page | 1440px (default) | Full screen replacement |
| drawer | 320px | Right slide-in overlay |
| modal | 560px | Centered dialog overlay |
| sheet | full width | Bottom panel overlay |

**Chrome Pass output:** `shared-chrome.json` with:
- Shared nav header nodes (brand, links, bell icon, avatar)
- `regions` map (header/sidebar/footer → node IDs) — set by LLM

**Forcing Chrome Pass regeneration:**
```bash
rm .agentforge/previews/__shared-chrome__/scripts/designspec-v2.json
rm .agentforge/previews/shared-chrome.json
agentforge design:page:all   # NOT --design-only
```

**Critical constraint:** `--design-only` does NOT run Chrome Pass. If
you deleted the chrome cache, you must run without `--design-only`.

---

## `agentforge design`

Request a new page design from the design agent pipeline (code-first workflow).

**Purpose:** Entry point for the event-driven design workflow. Publishes a
`PageRequested` event that triggers the full UX agent pipeline: Research →
Planning → Design → Evaluation. Unlike `design:page` (which runs the
pipeline synchronously), this command is fire-and-forget — it emits the event
and returns immediately. Downstream agents pick up the event and process it
asynchronously.

```bash
agentforge design <description>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | Yes | Natural language description of the page to design |

**Event emitted:** `PageRequested` with `{ description, timestamp }`

**When to use:**
- Use `design` for event-driven workflows where agents run asynchronously
- Use `design:page` for synchronous, interactive design sessions with live tool integration

**Example:**
```bash
agentforge design "user profile settings page with avatar upload"
```

---

## `agentforge design:generate`

Generate a complete app specification (pages, data models, API endpoints) from your
project description using AI. This is the bridge between `describe` (PRD) and the
design pipeline — it turns your requirements into structured page definitions.

**Purpose:** Reads the PRD (`docs/prd.md`) and project config, then uses an LLM to
generate `pages.yaml`, `models.yaml`, and `api.yaml` under `agentforge/spec/`.
These files drive all downstream design commands (`design:page`).

```bash
agentforge design:generate
```

**Prerequisites:**
- `agentforge.yaml` must exist (run `agentforge init` first)
- `docs/prd.md` should exist (run `agentforge describe` first)

**Outputs:**
- `agentforge/spec/pages.yaml` — page definitions with components, data sources, routes
- `agentforge/spec/models.yaml` — data model definitions
- `agentforge/spec/api.yaml` — API endpoint definitions

**Example:**
```bash
agentforge design:generate
```

---

## `agentforge design:preview`

Open the design system and app spec preview in your default browser. Generates a
static HTML file showing your design tokens, component catalog, and page specs.

**Purpose:** Quick visual check of the design system (colors, typography, spacing)
and generated app spec without opening design tools.

```bash
agentforge design:preview
```

**Prerequisites:** Project initialized with design tokens and brand spec.

**Output:** Opens an HTML preview in the default browser.

**Example:**
```bash
agentforge design:preview
```

---

## `agentforge design:list`

List all designs in the `.agentforge/previews/` directory with their status and metadata.

```bash
agentforge design:list
```

Scans each module directory for stage artifacts and displays a summary table:

| Column | Description |
|--------|-------------|
| MODULE ID | Kebab-case identifier for the design module |
| TOOL | Design tool used: `penpot` or `-` (no design stage) |
| STAGES | Completed/total stages (e.g. `3/3`) |
| LAST MODIFIED | Timestamp of the most recently modified artifact |
| COMPONENTS | Number of components (from design or planning output) |

**Example output:**
```
Found 3 design(s):

  MODULE ID          TOOL    STAGES  LAST MODIFIED     COMPONENTS
  ──────────────────────────────────────────────────────────────
✔ cost-dashboard     penpot  3/3     2026-03-22 00:48  12
● bookshelf-catalog  penpot  2/3     2026-03-22 17:22  8
○ dashboard-design   -       0/3     2026-03-21 15:30  -
```

---

## Feedback Loop

The `design:page` command enters an interactive feedback loop after design completes.

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

### 1. Build the patched Figma plugin

The upstream TalkToFigma plugin doesn't include AgentForge's 37 custom commands (`create_ellipse`, `set_effects`, `create_table`, etc.). The patched plugin is **built automatically** the first time you run `design:figma` or `design:collaborate` — the preflight step detects the missing `dist/` directory and runs the build.

You can also build it manually:

```bash
npm run figma:build-plugin
```

This clones the upstream plugin, applies `patch-plugin-commands.js`, and outputs a loadable plugin to `docker/talk-to-figma/figma-plugin/dist/`. The build is cached — subsequent runs skip it unless you delete `dist/`.

### 2. Load the plugin in Figma

1. Open **Figma Desktop**
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `docker/talk-to-figma/figma-plugin/dist/manifest.json`

The plugin now appears under **Plugins > Development > cursor-talk-to-figma-mcp**.

### 3. Start the Docker bridge

```bash
docker compose build figma-bridge
docker compose up -d figma-bridge
```

### 4. Connect

1. Open Figma desktop app
2. Run the TalkToFigma plugin (from Development plugins)
3. The bridge auto-discovers the plugin channel, or set `AGENTFORGE_MCP_FIGMA_CHANNEL` explicitly

### Troubleshooting

- **"No active Figma plugin detected"** — Open Figma and start the TalkToFigma plugin
- **Channel not discovered** — Rebuild the Docker bridge (`docker compose build --no-cache figma-bridge`) to apply the `/channels` endpoint patch, or set `AGENTFORGE_MCP_FIGMA_CHANNEL` manually
- **"Invalid tool name"** -- The LLM generated an unrecognized Figma operation; try rephrasing your feedback

---

## `agentforge design:penpot`

Create a Penpot design via the UX agent pipeline (Research, Planning, Design) with Penpot integration through the Penpot MCP HTTP/SSE server.

The command resolves `<pageId>` against `pages.yaml` to load structured page context (components, data sources, routes, sibling pages) instead of relying on free-form descriptions.

```bash
agentforge design:penpot <pageId> [options]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `pageId` | Yes | Page ID from `pages.yaml` (e.g., `"bill-entry"`), case-insensitive page name (e.g., `"Bill Entry"`), or free-form description (legacy fallback when `pages.yaml` is absent) |

**Page resolution order:**
1. Exact match on `pages[].id`
2. Case-insensitive match on `pages[].name`
3. If `pages.yaml` exists but no match → **error** listing available page IDs
4. If `pages.yaml` does not exist → falls back to using input as free-form description (legacy behavior)

When a page is resolved:
- `page.id` is used as the module ID (output goes to `.agentforge/previews/{page.id}/`)
- `page.description` is used as the primary description for LLM prompts
- `page.components` is passed as the required component list
- `page.data_sources` filters models and API endpoints for context
- All sibling pages (with routes and shared components) are included for cross-page navigation awareness

| Option | Description |
|--------|-------------|
| `--stage <stage>` | Skip to a stage: `research`, `planning`, `design`, `replay`, `connect` |
| `--module <id>` | Module ID override (default: page ID from `pages.yaml`) |
| `--no-wait` | Exit immediately after design without entering the feedback loop |
| `--implement` | Skip feedback loop and generate React + Tailwind code directly after design |
| `--mock` | Use mock MCP and mock LLM provider — skips design tool connection AND all LLM API calls, using saved/canned responses for instant zero-cost replay. No `ANTHROPIC_API_KEY` required. |
| `--project-dir <dir>` | Project directory for artifact path resolution (default: current directory) |
| `--designspec-v1` | Use legacy V1 LLM-based script generation (default is V2 deterministic renderer) |
| `--fresh` | Force re-run all stages, ignoring cached research/planning artifacts |
| `--evaluate` | Run non-interactive design evaluation after design (for CI/CD). Exit code 1 if score < threshold |
| `--evaluate-threshold <score>` | Minimum score (0-100) for `--evaluate` to pass (default: 75) |

### Stages

| Stage | Description |
|-------|-------------|
| `research` | Run from research stage (default — auto-reuses cache if available) |
| `planning` | Skip research, load from cache |
| `design` | Skip research + planning, load from cache |
| `replay` | Re-execute the cached design script without LLM calls |
| `connect` | Test Penpot connection only, load design from cache |

### Interactive Feedback Loop

After design completes (on TTY, without `--implement` or `--no-wait`), an interactive feedback loop starts — identical to the Figma feedback loop:

| Command | Description |
|---------|-------------|
| `approve` or `y` | Accept the design and exit |
| `quit` or `q` | Reject the design and exit |
| `review` or `r` | Capture screenshot via `export_shape` and evaluate |
| `implement` or `impl` | Generate React + Tailwind code from the design |
| Any other text | Send as feedback to modify the design |

Feedback is applied by generating a Penpot Plugin API fix script via LLM and executing it through `execute_code`.

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENTFORGE_MCP_PENPOT_URL` | `http://localhost:4401/mcp` | Penpot MCP server URL |
| `ANTHROPIC_API_KEY` | -- | Required for LLM calls |

### Prerequisites

1. Docker installed and running
2. Penpot MCP server: `docker compose up penpot-mcp`
3. Penpot desktop app open with a project

### Artifacts

All artifacts are saved to `.agentforge/previews/<module-id>/`:
- `research-brief.json` -- research stage output
- `planning-spec.json` -- planning stage output
- `penpot-design.json` -- design stage output (includes `script` field for replay)

### Examples

```bash
# Design a page by ID (reads pages.yaml for full context)
agentforge design:penpot bill-entry

# Design by page name (case-insensitive)
agentforge design:penpot "Bill Entry"

# Resume from design stage
agentforge design:penpot bill-entry --stage design

# Skip feedback loop, generate code directly
agentforge design:penpot bill-entry --implement

# Re-execute cached design script (no LLM calls)
agentforge design:penpot bill-entry --stage replay

# Test connection only
agentforge design:penpot bill-entry --stage connect

# Skip feedback loop (CI/automation)
agentforge design:penpot bill-entry --no-wait

# CI/CD quality gate — fail if design scores below 80
agentforge design:penpot bill-entry --evaluate --evaluate-threshold 80

# Force re-run research + planning (ignore cached artifacts)
agentforge design:penpot bill-entry --fresh

# Use legacy V1 LLM-based script generation
agentforge design:penpot bill-entry --designspec-v1

# Run from repo root, resolving artifacts in a subdirectory project
agentforge design:penpot bill-entry --stage replay --project-dir split-easy
```

### Architecture

See [ADR-030](../adrs/ADR-030-penpot-design-tool-support.md) for details on the Penpot adapter pattern, transport differences from Figma, and dynamic tool discovery.

---

## `agentforge design:penpot:all`

Batch-design all screens from `pages.yaml` in Penpot. Reads the project spec
automatically and runs the full pipeline (Research → Planning → Design) for each page.

**Purpose:** Automates designing every page in one command instead of running
`design:penpot` individually for each page ID.

```bash
agentforge design:penpot:all [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--pages <ids>` | string | all | Comma-separated page IDs to design (e.g. `"home,book-detail"`) |
| `--width <pixels>` | number | 1440 | Viewport width — overrides per-page viewports |
| `--design-only` | boolean | false | Skip research+planning, use cached artifacts |

**Inputs:** Reads `agentforge/spec/pages.yaml` for page definitions.

**Outputs:** Same as `design:penpot` per page — Penpot script + artifacts in `.agentforge/previews/<pageId>/`.

**Example:**
```bash
agentforge design:penpot:all --pages "home,settings" --width 1280
```

---

## `agentforge design:penpot:browser`

Create a Penpot design using Playwright browser automation. The browser agent
takes screenshots and reads Penpot state directly for a more interactive
design experience compared to the MCP-based `design:penpot`.

**Purpose:** Alternative to `design:penpot` that uses headful browser automation
for real-time visual feedback during design generation.

```bash
agentforge design:penpot:browser <description> [options]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `<description>` | Yes | Natural language description of what to design |

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--stage <stage>` | string | — | Skip to: `research`, `planning`, `design` |
| `--module <id>` | string | derived | Module ID |
| `--width <pixels>` | number | 1440 | Viewport width |
| `--headless` | boolean | false | Run browser headless |
| `--no-wait` | boolean | false | Exit after design without approval wait |
| `--implement` | boolean | false | Skip feedback, generate code after design |
| `--mock` | boolean | false | Use mock MCP |

**Prerequisites:** Penpot running locally, Playwright installed.

**Outputs:** Penpot design + artifacts in `.agentforge/previews/<moduleId>/`.

**Example:**
```bash
# Full pipeline with browser
agentforge design:penpot:browser "cost dashboard with charts"

# Headless mode (CI)
agentforge design:penpot:browser "cost dashboard" --headless
```

---

## `agentforge design:penpot:review`

Review and interactively improve an existing Penpot design using a browser agent.
The agent takes screenshots, evaluates the design against spec, and suggests improvements.

**Purpose:** Post-design QA — run after `design:penpot` to refine and improve
the generated design with AI-assisted evaluation.

```bash
agentforge design:penpot:review [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--url <url>` | string | **required** | Penpot workspace URL (user must be logged in) |
| `--page <id>` | string | — | Page ID from `pages.yaml` to focus evaluation |
| `--headless` | boolean | false | Run browser headless |

**Prerequisites:** Active Penpot session in browser, design already generated.

**Example:**
```bash
agentforge design:penpot:review --url "http://localhost:9001/view/..."
```

---

## `design:collaborate` with Penpot

The `design:collaborate` command supports Penpot via the `--tool` option:

```bash
agentforge design:collaborate --module <id> --tool penpot
```

| Option | Description |
|--------|-------------|
| `--tool <tool>` | Design tool to use: `figma` (default) or `penpot` |

This loads the `penpot-design.json` artifact (instead of `figma-design.json`) and connects to the Penpot MCP server for the collaboration session.
