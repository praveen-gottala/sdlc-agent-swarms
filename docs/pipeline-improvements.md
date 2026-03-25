# Pipeline Improvement Plans

5 architectural improvements to the UX design pipeline, ordered by impact. Each plan will be refined before implementation.

---

## Plan 1: Bridge Design → Implementation Gap

**Problem**: The Implementation stage receives only `planningOutput` (component tree + token names). The actual visual design created in Figma/Penpot — colors, spacing, layout, screenshots, node IDs — is completely ignored. The `design` parameter in the implement callback is accepted but never used.

**Evidence**:
- `packages/cli/src/commands/design-figma.ts` lines 465-471: `componentSpec: planningOutput` — design output discarded
- `packages/agents-ux/src/ux-design/ux-design.ts`: returns `figmaNodeIds`, `figmaFileId`, `breakpoints` — none forwarded
- Implementation generates code from abstract token names, not from the actual visual design

**Goal**: Generated code should reflect what was actually designed visually, not just the planning spec.

**Approach**:

1. **Capture design snapshot before implementation**
   - After Design stage completes (and HITL approves), capture a screenshot of each major component via `DesignToolAdapter.captureScreenshot()`
   - Extract computed styles (colors, font sizes, spacing) via adapter — Figma: `get_code` / `get_node_info`, Penpot: equivalent inspection tools
   - Store as `design-snapshot.json` alongside existing artifacts

2. **Enrich implementation input**
   - Extend `UXImplementationInput` with:
     - `designScreenshots`: base64 screenshots of key components (multimodal input to LLM)
     - `extractedStyles`: actual color values, spacing, typography from the design tool
     - `nodeMap`: component name → design tool node ID (for traceability)
   - The implementation LLM prompt should include both the planning spec AND the visual reference

3. **Update implement callback**
   - In `design-figma.ts` and future unified CLI: pass `design` output into `implInput`
   - Add screenshot capture step between design approval and implementation

**Files to modify**:
- `packages/agents-ux/src/types.ts` — extend `UXImplementationInput`
- `packages/cli/src/commands/design-figma.ts` — use design output in implement callback
- `packages/agents-ux/src/ux-design/ux-design.ts` — add style extraction to output
- Implementation system prompt — include visual reference instructions

**Open questions**:
- How many screenshots per design? One per top-level component, or one full-page?
- Token cost of multimodal input — is it worth sending screenshots for every implementation run?
- Should extracted styles override token bindings from planning, or serve as validation?

---

## Plan 2: Unify Pipeline Runner (Figma + Penpot)

**Problem**: `run-module-pipeline.ts` is hardcoded for Figma — imports Figma-specific functions, uses WebSocket channel discovery, saves to `figma-design.json`. Penpot has its own separate CLI paths but no unified pipeline runner. The `DesignToolAdapter` abstraction exists in `core/src/mcp/design-tool-adapter.ts` but isn't used.

**Evidence**:
- `packages/agents-ux/src/scripts/run-module-pipeline.ts`: imports `loadFigmaSession`, `runFigmaPreflight`, `createTalkToFigmaTransport`, `discoverChannels` directly
- `packages/core/src/mcp/design-tool-adapter.ts`: clean interface with `kind`, `createMCPClient()`, `runPreflight()`, `captureScreenshot()` — both Figma and Penpot implement it
- CLI commands (`design-figma.ts`, `design-penpot.ts`) create transports directly instead of going through adapter

**Goal**: One pipeline runner that accepts either design tool via `--tool figma|penpot` flag, using the adapter interface.

**Approach**:

1. **Standardize design output type**
   - Create `DesignOutput` (tool-agnostic) replacing `UXDesignOutput`:
     ```
     toolKind: 'figma' | 'penpot'
     fileId: string          // figmaFileId or penpotProjectId
     pageId: string          // figmaPageId or penpotPageId
     nodeIds: Record<string, string>  // component → node ID
     moduleId: string
     breakpoints: string[]
     ```
   - Adapter maps tool-specific fields to this shape

2. **Refactor run-module-pipeline.ts**
   - Accept `DesignToolAdapter` as parameter (or resolve from `--tool` flag)
   - Replace all Figma-specific imports with adapter method calls:
     - `loadFigmaSession()` → `adapter.loadSession()`
     - `runFigmaPreflight()` → `adapter.runPreflight()`
     - `createFigmaBridgeMCPClient()` → `adapter.createMCPClient(config)`
   - Save artifact as `design-output.json` (not tool-specific filename)
   - Keep backward compat: load old `figma-design.json` / `penpot-design.json` if `design-output.json` not found

3. **Unify design work function signature**
   - Current mismatch: Figma takes 4 params, Penpot takes 3
   - Create unified signature: `(input, provider, mcpClient, context?)`
   - Or better: single `DesignWorkInput` object with all fields

4. **Expand DesignToolAdapter interface** (if needed)
   - Add `getDesignWorkFn()` that returns the correct stage function
   - Or keep work functions external and dispatch based on `adapter.kind`

**Files to modify**:
- `packages/core/src/mcp/design-tool-adapter.ts` — expand interface if needed
- `packages/core/src/types/index.ts` — add `DesignOutput` type
- `packages/agents-ux/src/scripts/run-module-pipeline.ts` — refactor to use adapter
- `packages/agents-ux/src/ux-design/ux-penpot-design.ts` — align function signature
- `packages/agents-ux/src/ux-design/ux-design.ts` — return `DesignOutput` shape

**Open questions**:
- Should the pipeline runner auto-detect the available tool (check for running Figma bridge vs Penpot MCP), or always require explicit `--tool`?
- Do we keep tool-specific pipeline scripts as thin wrappers, or fully consolidate?

---

## Plan 3: Add `design:list` Command

**Problem**: No way to discover past designs. Users must remember module IDs or manually browse `.agentforge/previews/`. The `design:collaborate` command requires `--module <id>` but there's no way to find valid IDs.

**Evidence**:
- `.agentforge/previews/` contains directories like `cost-dashboard/`, `bookshelf-catalog/`, plus empty dirs from failed runs
- No CLI command searches or lists these
- Each artifact has metadata (moduleId, briefId, specRef) but no index

**Goal**: `agentforge design:list` shows all designs with status, tool, timestamps, and completion level.

**Approach**:

1. **Scan `.agentforge/previews/`**
   - Read all subdirectories
   - For each, check for: `research-brief.json`, `planning-spec.json`, `figma-design.json`, `penpot-design.json`, `design-output.json` (future unified name)
   - Skip empty directories (or show them as "failed/incomplete" with a flag)

2. **Extract metadata from artifacts**
   - `moduleId` from any artifact
   - Tool used: presence of `figma-design.json` vs `penpot-design.json`
   - Completion: count of stages completed (0-3)
   - Last modified: `statSync()` on most recent artifact file
   - Component count: from `planningSpec.componentTree` if available

3. **Output format**
   ```
   Module ID          Tool     Stages   Last Modified        Components
   ─────────────────────────────────────────────────────────────────────
   cost-dashboard     figma    3/3      2026-03-22 00:48     12
   bookshelf-catalog  penpot   3/3      2026-03-22 17:22     8
   dashboard-design   —        0/3      2026-03-21 15:30     —
   ```

4. **Options**
   - `--verbose`: show component tree summary, breakpoints, brief excerpt
   - `--tool figma|penpot`: filter by design tool
   - `--complete`: show only 3/3 completed designs
   - `--json`: machine-readable output

**Files to create**:
- `packages/cli/src/commands/design-list.ts`

**Files to modify**:
- `packages/cli/src/index.ts` — register command

**Dependencies**: None — can be built independently of other plans.

---

## Plan 4: Penpot Code Generation Parity

**Problem**: Penpot CLI commands have no `--implement` flag and no feedback loop. Users can create designs in Penpot but can't generate code from them. Figma has both.

**Evidence**:
- `packages/cli/src/commands/design-penpot.ts`: no implement callback, no `runDesignFeedbackLoop` call
- `packages/cli/src/commands/design-figma.ts` lines 460-489: has `createImplementFn()` and feedback loop
- `packages/agents-ux/src/ux-design/penpot-browser-review.ts`: has interactive review but no code gen trigger

**Goal**: `agentforge design:penpot <desc> --implement` generates code, and the interactive feedback loop works for Penpot designs.

**Approach**:

1. **Add implement callback to Penpot CLI**
   - Mirror the pattern from `design-figma.ts`
   - After design stage, if `--implement` flag, call `uxDashboardImplementationWork`
   - Pass `planningOutput` as componentSpec (same as Figma currently does)
   - After Plan 1 is done, also pass design screenshots/styles

2. **Add feedback loop to Penpot CLI**
   - Wire `runDesignFeedbackLoop` into `design-penpot.ts`
   - The feedback loop already accepts a generic MCP client — should work with Penpot adapter
   - The `CorrectionAdapter` in `correction-loop.ts` is tool-agnostic (just needs `captureScreenshot` and `executeFixes`)

3. **Ensure Penpot screenshot works in feedback loop**
   - Penpot adapter's `captureScreenshot()` tries multiple tool names: `export-frame`, `export-component`, `get-thumbnail`
   - Verify this works in practice and falls back gracefully
   - Browser-based path (`penpot-browser-adapter.ts`) uses Playwright screenshots — may be more reliable

4. **Add `--implement` and `--no-wait` flags to Penpot commands**
   - `design:penpot` — add both flags
   - `design:penpot:browser` — add both flags
   - `design:penpot:all` — add `--implement` (generates code for each page after design)

**Files to modify**:
- `packages/cli/src/commands/design-penpot.ts` — add implement callback + feedback loop
- `packages/cli/src/commands/design-penpot-browser.ts` — add implement callback
- `packages/cli/src/commands/design-penpot-all.ts` — add `--implement` support per page

**Dependencies**: Benefits from Plan 2 (unified pipeline) but can be done independently. Plan 1 (design→impl bridge) enhances the quality of generated code.

**Open questions**:
- Should Penpot browser-based screenshot be preferred over MCP-based for the correction loop?
- Does the Penpot MCP server support enough inspection tools for style extraction (Plan 1)?

---

## Plan 5: CLI Commands Use DesignToolAdapter

**Status**: IMPLEMENTED (Figma refactored; Penpot already compliant)

**Problem**: `design-figma.ts` bypassed the `DesignToolAdapter` abstraction — it created MCP transports and managed connections directly with inline code. This duplicated connection logic and prevented adapter reuse.

**Corrected analysis**: The original Plan 5 claimed *both* CLI commands bypassed the adapter. This was wrong for Penpot — `design-penpot.ts` already uses `createPenpotAdapter()` (line 23) and calls `adapter.createMCPClient()` (lines 300-309). Only Figma bypassed the adapter.

### What was distinct between the two commands

| Aspect | design-figma.ts (before) | design-penpot.ts |
|--------|--------------------------|------------------|
| **Adapter usage** | None — direct transport + inline MCP client | Yes — `createPenpotAdapter()` |
| **Preflight** | Inline: env-var → session → Docker preflight (~80 lines) | Via agents-ux: `runPenpotPreflight()` + adapter for client |
| **MCP client** | Custom inline `createFigmaMCPClient()` | `adapter.createMCPClient()` |
| **Session management** | `loadFigmaSession()` from agents-ux directly | `loadPenpotSession()` from agents-ux directly |
| **`--implement` flag** | Yes — `createImplementFn()` callback | No (Plan 4 scope) |
| **Feedback loop** | Yes — `runDesignFeedbackLoop()` with review/implement/approve | No (Plan 4 scope) |
| **Collaboration session** | Yes — `createDesignCollaborationSession()` | No (Plan 4 scope) |
| **Design work fn** | `uxDashboardDesignWork()` (4 params) | `penpotDesignWork()` (3 params) |

### Scope clarification

Implementation (`--implement`, feedback loop) is NOT part of Plan 5. Those are:
- Plan 1: Bridge design output → implementation input (quality of generated code)
- Plan 4: Add `--implement` + feedback loop to Penpot commands (feature parity)

Plan 5 is strictly about connection setup abstraction.

### What was done

**1. Completed the Figma adapter** (`packages/core/src/mcp/figma-adapter.ts`)
- Implemented `loadSession()` — reads `.agentforge/figma-session.json`, validates age, supports both `FigmaSession` (wsUrl) and `DesignToolSession` (url) formats
- Implemented `runPreflight()` with all 3 connection strategies encapsulated:
  - Strategy 1: Env-var override (`AGENTFORGE_MCP_FIGMA_WRITE_URL` + `AGENTFORGE_MCP_FIGMA_CHANNEL`) with channel discovery + polling
  - Strategy 2: Cached session from `loadSession()`
  - Strategy 3: Full preflight delegate (Docker start, plugin build, etc.) — injected via `FigmaAdapterConfig.fullPreflight`
- Added `FigmaAdapterConfig` interface for dependency injection (core cannot depend on agents-ux)
- Added `discoverFigmaChannels()` and `discoverFigmaTools()` helper functions in core
- Accepts `log` callback for status messages (no direct console.log)

**2. Refactored design-figma.ts to use adapter**
- Replaced inline `createFigmaMCPClient()` (was lines 116-139) with `adapter.createMCPClient()`
- Replaced 3 inline connection strategies (~80 lines) with single `adapter.runPreflight()` call
- Removed direct imports of `createTalkToFigmaTransport`, `TALK_TO_FIGMA_TOOLS`, `loadFigmaSession`, `discoverChannels`, `discoverTools`
- Adapter is created with `fullPreflight` delegate that wraps `runFigmaPreflight` from agents-ux
- All stage logic (research/planning/design), implement callback, and feedback loop unchanged

**3. Verified design-penpot.ts adapter usage**
- Already uses `createPenpotAdapter()` for MCP client creation — no changes needed
- Session loading and preflight still delegated to agents-ux functions (consistent pattern)

### Files modified
- `packages/core/src/mcp/figma-adapter.ts` — complete preflight + loadSession + config types
- `packages/core/src/mcp/index.ts` — export new types (`FigmaAdapterConfig`, `FigmaAdapterLog`, `discoverFigmaChannels`, `discoverFigmaTools`)
- `packages/core/src/index.ts` — re-export new types
- `packages/cli/src/commands/design-figma.ts` — use adapter instead of direct transport

### Files NOT modified (out of scope)
- `design-penpot.ts` — already uses adapter
- Implementation-related code — Plans 1 and 4
- Feedback loop code — Plan 4
- `design-collaborate.ts` — future work, already accepts `--tool` flag

**Dependencies**: Enables Plan 2 (unified pipeline runner) and Plan 4 (Penpot parity) to be cleaner.

---

## Implementation Order

```
Plan 5 (Adapter wiring)  ──→  Plan 2 (Unified pipeline)  ──→  Plan 4 (Penpot parity)
                                                                      │
Plan 3 (design:list)     ──→  (independent, do anytime)               │
                                                                      ▼
Plan 1 (Design→Impl bridge)  ──────────────────────────────→  (biggest impact,
                                                                needs Plans 2+5
                                                                for full effect)
```

**Recommended order**:
1. **Plan 3** — independent, quick win, immediately useful
2. **Plan 5** — foundation for everything else
3. **Plan 2** — unified pipeline using adapters from Plan 5
4. **Plan 4** — Penpot parity, cleaner with unified pipeline
5. **Plan 1** — biggest impact, benefits from all prior plans being in place
