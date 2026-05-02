# How to use CLI design commands

> See also: [Design Generation Guide](design-generation.md) | [CLI Reference](../cli/design.md)

CHIP provides 10 design-related CLI commands for generating designs, managing the design system, and previewing results. This guide explains which command to use when.

## Prerequisites

- Initialized project (`agentforge init` completed)
- `ANTHROPIC_API_KEY` set for commands that make LLM calls
- For Penpot commands: Docker running with Penpot stack (`docker compose up -d penpot-frontend penpot-mcp`)

## Decision tree: which command do I need?

```
Start here:
  ├── "I want to generate a design for one page"
  │     └── agentforge design:page <pageId>
  ├── "I want to generate designs for ALL pages"
  │     └── agentforge design:page:all
  ├── "I want to set up or change the design system"
  │     ├── "Show what I have"  →  agentforge design-system show
  │     ├── "Pick new colors/fonts"  →  agentforge design-system update
  │     ├── "Check for errors"  →  agentforge design-system validate
  │     └── "Refresh component catalog"  →  agentforge design-system regenerate-catalog
  ├── "I want to generate the app spec (pages, models, API)"
  │     └── agentforge design:generate
  ├── "I want to preview existing designs"
  │     └── agentforge design:preview
  └── "I want to see what designs exist"
        └── agentforge design:list
```

## Commands

### `agentforge design:page <pageId>`

Runs the full design pipeline (Research → Planning → Design → Evaluator) for a single page. The page must exist in `agentforge/spec/pages.yaml`.

```bash
agentforge design:page home --project-dir ./my-app
```

Key flags:

| Flag | Default | Purpose |
|------|---------|---------|
| `--tool <tool>` | `browser` | Rendering target: `browser` or `penpot` |
| `--stage <stage>` | (all) | Resume from: `research`, `planning`, `design`, or `evaluator` |
| `--width <px>` | 1440 | Viewport width for the generated design |
| `--fresh` | off | Force re-run all stages (ignore cached artifacts) |
| `--evaluate` | off | Non-interactive evaluation (for CI/CD) |
| `--evaluate-threshold <n>` | 75 | Minimum pass score (0-100) |
| `--vision-correction` | off | Enable vision-based self-correction loop |
| `--mock` | off | Use mock LLM provider (no API key needed) |
| `--implement` | off | Skip feedback loop, generate code directly |
| `--design-only` | off | Skip research+planning, use cached artifacts |

**File:** `packages/cli/src/commands/design-page.ts`

### `agentforge design:page:all`

Runs the design pipeline for every page in `pages.yaml`, sequentially. Generates shared chrome (navigation bars, sidebars) once and propagates to all pages. Builds `prototype.json` for multi-screen navigation.

```bash
agentforge design:page:all --project-dir ./my-app
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--pages <ids>` | (all) | Comma-separated page IDs to filter |
| `--design-only` | off | Skip LLM calls, use cached artifacts (~8s vs ~3min) |
| `--width <px>` | 1440 | Viewport width override |

**File:** `packages/cli/src/commands/design-page-all.ts`

### `agentforge design:generate`

Two-phase command: (1) generates the design system (tokens + brand) if missing, (2) generates the app spec (pages, models, API endpoints) from the project description. Opens an HTML preview for approval.

```bash
agentforge design:generate --project-dir ./my-app
```

Writes `pages.yaml`, `models.yaml`, and `api.yaml` to `agentforge/spec/`.

**File:** `packages/cli/src/commands/design-generate.ts`

### `agentforge design-system show`

Displays the current design token values: colors (primitive + semantic), typography, spacing, brand identity.

```bash
agentforge design-system show --project-dir ./my-app
```

### `agentforge design-system update`

Interactive two-step setup: (1) pick a component library from presets, (2) generate a theme via LLM or use built-in archetypes (warm/professional/bold). Regenerates the component catalog for the chosen library.

```bash
agentforge design-system update --project-dir ./my-app
agentforge design-system update --mock  # skip LLM, use built-in archetypes
```

### `agentforge design-system validate`

Validates `design-tokens.yaml` and `brand.yaml` for structural correctness — required fields, value ranges, type compliance.

```bash
agentforge design-system validate --project-dir ./my-app
```

### `agentforge design-system regenerate-catalog`

Regenerates `component-catalog.yaml` from the base catalog, filtered by the selected component library.

```bash
agentforge design-system regenerate-catalog --project-dir ./my-app
```

### `agentforge design:list`

Scans `.agentforge/previews/` for existing design artifacts and prints a summary: module name, design tool used, completed stages, last modified date, component count.

```bash
agentforge design:list --project-dir ./my-app
```

**File:** `packages/cli/src/commands/design-list.ts`

### `agentforge design:preview`

Opens HTML previews for the existing design system and app spec without regenerating anything.

```bash
agentforge design:preview --project-dir ./my-app
```

**File:** `packages/cli/src/commands/design-preview.ts`

## Verify

After running any design command, confirm:

1. Expected output files exist: `ls .agentforge/previews/<page>/scripts/designspec-v2.json`
2. Design system is valid: `agentforge design-system validate`
3. For all-pages runs: `prototype.json` and `shared-chrome.json` exist in `.agentforge/previews/`

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "No agentforge.yaml found" | Project not initialized | Run `agentforge init` |
| "Penpot MCP not connected" | Docker not running or Penpot stack not started | `docker compose up -d penpot-frontend penpot-mcp` |
| Stage hangs | Missing API key | Set `ANTHROPIC_API_KEY` |
| `--design-only` shows stale results | No cached artifacts exist | Run full pipeline first without `--design-only` |

## What's next

- [Design Generation Guide](design-generation.md) — pipeline stages and workflow
- [CLI Design Reference](../cli/design.md) — detailed CLI docs
- [Design Pipeline Dataflow](../architecture/design-pipeline-dataflow.md) — architecture
