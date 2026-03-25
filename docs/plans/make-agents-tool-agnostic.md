# Task: Make Research and Planning Agents Design-Tool-Agnostic

## Context

The research and planning agents produce abstract specs (design briefs, component trees, token bindings). Their output is the same whether the project uses Figma, Penpot, or no design tool at all. However, both agents currently hardcode Figma MCP tool calls — a legacy from before AgentForge had disk-based spec files (`design-tokens.yaml`, `brand.yaml`, `component-catalog.yaml`).

Now that `agentforge init` generates complete spec files on disk, the research and planning agents should read from disk (tool-agnostic) and only fall back to a connected design tool API when disk specs don't exist.

### What the Figma tools were doing

| Tool | Purpose | Why it's now unnecessary |
|------|---------|--------------------------|
| `figma:get_variable_defs` | Fetch Figma Variables (colors, spacing, typography defined in Figma) | `design-tokens.yaml` on disk has all this — with semantic mappings that Figma Variables don't always have |
| `figma:get_metadata` | Fetch Figma file metadata (pages, component names) | `pages.yaml` and `component-catalog.yaml` on disk |
| `figma:get_code_connect_map` | Fetch Figma Code Connect mappings (component→code bindings) | `component-library.yaml` + `component-catalog.yaml` on disk |
| `figma:get_code` | Extract inline styles from Figma components as last-resort token extraction | Disk tokens are the primary source now — this fallback is unnecessary |

---

## Changes

### 1. Research agent — remove Figma tools from contract

**File:** `packages/agents-ux/src/ux-research/ux-dashboard-research.ts`

Change the contract tools (line 63) from:
```typescript
tools: ['figma:get_metadata', 'figma:get_variable_defs'],
```
To:
```typescript
tools: ['spec.read_project', 'spec.read_pages'],
```

The research agent reads PRD requirements and design tokens from disk. It never needs to interact with any design tool directly. It already receives `designTokensSpec` in its input (from the caller) — no MCP call needed.

### 2. Planning agent — remove Figma tools from contract

**File:** `packages/agents-ux/src/ux-planning/ux-dashboard-planning.ts`

Change the contract tools (line 66) from:
```typescript
tools: ['figma:get_variable_defs', 'figma:get_code_connect_map'],
```
To:
```typescript
tools: ['spec.read_project', 'spec.read_pages', 'spec.read_spec'],
```

### 3. Planning agent — invert token loading priority to disk-first

**File:** `packages/agents-ux/src/ux-planning/ux-dashboard-planning.ts`

Replace the entire token loading block (currently around lines 264-290) with a disk-first approach:

```typescript
// 2. Load design tokens — disk first (tool-agnostic), then try connected design tool
let tokenContext = '';
let validTokenNames: Set<string> | undefined;

// Primary: Load from agentforge/spec/design-tokens.yaml (works for any design tool)
const diskTokens = loadDesignTokens(context.projectRoot, context.fs);
if (diskTokens.ok) {
  tokenContext = `\nDesign Tokens (from project spec — design-tokens.yaml):\n${JSON.stringify(diskTokens.value, null, 2)}`;
  validTokenNames = extractValidTokenNames(diskTokens.value);
  tokenContext += buildTokenAllowlist(diskTokens.value);
  // Also inject brand spec if available
  const diskBrand = loadBrandSpec(context.projectRoot, context.fs);
  if (diskBrand.ok) {
    tokenContext += `\n\nBrand Spec (from project spec — brand.yaml):\n${JSON.stringify(diskBrand.value, null, 2)}`;
  }
}

// Fallback: Try connected design tool API if disk tokens unavailable
if (!tokenContext) {
  for (const toolName of ['figma', 'penpot']) {
    try {
      const varResult = await context.mcpClient.callTool(toolName, 'get_variable_defs', { moduleId });
      if (varResult.ok) {
        const content = varResult.value;
        const hasContent = content && typeof content === 'object' && Object.keys(content as Record<string, unknown>).length > 0;
        if (hasContent) {
          tokenContext = `\nDesign Tokens (from ${toolName} API):\n${JSON.stringify(content, null, 2)}`;
          break;
        }
      }
    } catch {
      // Tool not connected — skip silently
    }
  }
  if (!tokenContext) {
    // eslint-disable-next-line no-console
    console.warn('[planning] No design tokens found — disk tokens missing and no design tool connected. Planning will proceed without token constraints.');
  }
}
```

Key changes:
- Disk tokens are tried FIRST (not as a fallback)
- The Figma-specific `get_code` fallback (line 282) is REMOVED entirely — it was a Figma-specific workaround for extracting tokens from inline styles, unnecessary now that disk tokens are the primary source
- The design tool API fallback tries both `figma` and `penpot` — not just Figma
- If nothing works, warn and proceed — don't silently pass empty tokens

### 4. Remove ADR-024 comment

The comment `// ADR-024: try get_variable_defs, fall back to disk tokens, then get_code` (around line 263) references the old priority order. Update or remove it:

```typescript
// Design tokens: disk-first (agentforge/spec/design-tokens.yaml), design tool API as fallback
```

---

## What NOT to change

- **Design agents** (`ux-penpot-design.ts`, `ux-dashboard-design.ts`, `penpot-browser-agent.ts`) — these ARE tool-specific and must remain so. They generate Penpot scripts or Figma API calls.
- **`discoverPenpotAPI()`** — this is design-agent-level functionality, not planning-level.
- **Interface names, file names, event names** — no renaming in this task.
- **The `existingTokens` / `designTokensSpec` fields on research input** — these were just fixed in the previous task, leave them as-is.

---

## Tests

**File:** `packages/agents-ux/src/ux-planning/ux-dashboard-planning.test.ts`

- Add test: when disk tokens exist, no MCP call is made at all (verify `mcpClient.callTool` is NOT called)
- Add test: when disk tokens are missing and MCP returns empty `{}`, the agent warns but still produces valid output
- Update any existing test that mocks `figma:get_variable_defs` as the primary path — it should now mock `loadDesignTokens` instead
- Add test: when both `figma` and `penpot` MCP fail, the agent still produces output with a warning

**File:** `packages/agents-ux/src/ux-research/ux-dashboard-research.test.ts`

- Verify no MCP calls are made by the research agent (it receives tokens via input, not MCP)

---

## Verification

1. `nx run agents-ux:typecheck` — no type errors
2. `nx run agents-ux:test` — all tests pass
3. `grep -r "figma:get_variable_defs\|figma:get_metadata\|figma:get_code_connect_map" packages/agents-ux/src/ux-planning/ packages/agents-ux/src/ux-research/` — should return 0 results (only in design agents)
4. Run the bill-entry pipeline — planning prompt should show `Design Tokens (from project spec — design-tokens.yaml)` not `Design Tokens (from Figma Variables API): {}`
