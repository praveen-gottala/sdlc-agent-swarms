> **EVALUATION STATUS: Pending Review**
> - **What it contains:** Step-by-step instructions for running MCP spike tests (Figma bridge, TalkToFigma, Playwright setup)
> - **Why flagged:** Operational setup guide, not architecture documentation.
> - **Counter-argument:** Saves hours for anyone setting up MCP testing again. Practical and unique content.
> - **Recommendation:** Keep in docs/ — operational but useful. Or move to docs/setup/ for cleaner organization.

# MCP Spike Test Setup

Integration spikes proving MCP communication works end-to-end through the adapter layer.

## Figma MCP

### Prerequisites

1. A Figma account with a Personal Access Token
2. A Figma test file (any file — the spike reads structure, not specific designs)
3. Node.js 18+ (for native `fetch`)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `RUN_MCP_SPIKES` | Yes | Set to `true` to enable spike tests |
| `AGENTFORGE_MCP_FIGMA_TOKEN` | Yes | Figma Personal Access Token ([Settings > Personal Access Tokens](https://www.figma.com/developers/api#access-tokens)) |
| `AGENTFORGE_MCP_FIGMA_FILE_ID` | Yes | File ID from a Figma URL: `figma.com/design/<FILE_ID>/...` |

### Running the Spike

```bash
# From repo root
RUN_MCP_SPIKES=true \
  AGENTFORGE_MCP_FIGMA_TOKEN=figd_xxx \
  AGENTFORGE_MCP_FIGMA_FILE_ID=abc123 \
  npx jest --config packages/agents-ux/jest.config.cjs \
    --testPathPattern="__tests__/figma" \
    --verbose
```

Without `RUN_MCP_SPIKES=true`, all spike tests skip automatically:

```bash
npx jest --config packages/agents-ux/jest.config.cjs \
  --testPathPattern="__tests__/figma" --verbose
# Output: all "Figma MCP Spike" tests show as skipped
```

### What the Spike Tests

| # | Test | What it proves |
|---|---|---|
| 1 | `isAvailable('figma')` | MCPClient -> middleware -> transport chain works |
| 2 | `get_metadata` | Figma file read, response < 50KB |
| 3 | `get_variables` / `get_variable_defs` | Token retrieval + surfaces naming gap between UX agent contracts and FigmaAdapter |
| 4 | `get_code` with real node ID | Node data retrieval, logs token count |
| 5 | `FigmaAdapter.readDesign()` | Full adapter integration: get_code + get_metadata -> DesignContext |

### Known Issues

### Tool Name Mismatch (needs ADR-024)

UX squad agents declare `figma:get_variable_defs` in their contracts, but `FigmaAdapter.getTokens()` calls `get_variables`. The spike transport maps both to the same Figma REST endpoint, but a real MCP server would only expose one name. This needs alignment.

### Expected Output (success)

```
[spike] get_metadata response size: 12345 bytes
[spike] get_variables keys: status, error, meta
[spike] get_variable_defs keys: status, error, meta
[spike] NAMING GAP: UX agents use "get_variable_defs" but FigmaAdapter uses "get_variables"...
[spike] Using node: Page 1 (0:1)
[spike] get_code response: 8000 bytes, ~2000 tokens
[spike] readDesign OK - pageId=0:1, html length=0, lastModified=2024-...
```

## TalkToFigma MCP (Write Operations)

### Quick Start (Docker — recommended)

```bash
# 1. Start the WebSocket bridge
npm run figma:start

# 2. Verify it's running
npm run figma:status

# 3. Open Figma > Plugins > TalkToFigma (see docker/talk-to-figma/figma-plugin/README.md for plugin install)

# 4. Run preflight to auto-detect connection
npx tsx packages/agents-ux/src/scripts/figma-preflight.ts

# 5. Run the design pipeline (no env vars needed — preflight handles connection)
npx tsx packages/agents-ux/src/scripts/run-module-pipeline.ts --module cost-dashboard --stage design
```

### Docker Commands

| Command | Description |
|---|---|
| `npm run figma:start` | Start the WebSocket bridge container |
| `npm run figma:stop` | Stop and remove the container |
| `npm run figma:logs` | Tail container logs |
| `npm run figma:status` | Check container status |

### Auto-Connect Workflow

The design pipeline automatically connects to Figma using this priority:

1. **Env var override**: `AGENTFORGE_MCP_FIGMA_WRITE_URL` — explicit WebSocket URL
2. **Session file**: `.agentforge/figma-session.json` — reuses a recent connection (< 30 min old)
3. **Preflight auto-detect**: Checks `ws://localhost:3055`, starts Docker if needed, polls for plugin connection
4. **Mock MCP fallback**: If nothing works, uses a mock client (no Figma output)

### Manual Setup (without Docker)

If you prefer to run the bridge manually (requires Bun):

```bash
# Clone and start the bridge
git clone https://github.com/sonnylazuardi/cursor-talk-to-figma-mcp.git
cd talk-to-figma-mcp && bun install && bun socket
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AGENTFORGE_MCP_FIGMA_WRITE_URL` | No | WebSocket URL override (default: `ws://localhost:3055`) |
| `AGENTFORGE_MCP_FIGMA_CHANNEL` | No | Channel name override (auto-detected by preflight) |
| `AGENTFORGE_MCP_FIGMA_FILE_ID` | No | Figma file ID for REST API features (screenshots, self-correction) |
| `AGENTFORGE_MCP_FIGMA_TOKEN` | No | Figma Personal Access Token (enables visual self-correction loop) |

### Visual Self-Correction

When both `AGENTFORGE_MCP_FIGMA_TOKEN` and `AGENTFORGE_MCP_FIGMA_FILE_ID` are set,
the design agent automatically:

1. Captures a screenshot of the created design via Figma REST API
2. Evaluates the screenshot against the design spec using Claude vision
3. Generates and executes fix commands for critical/major issues
4. Repeats up to 3 times until quality score >= 80/100

### Spike Tests

```bash
RUN_MCP_SPIKES=true \
  AGENTFORGE_MCP_FIGMA_TOKEN=figd_xxx \
  AGENTFORGE_MCP_FIGMA_FILE_ID=abc123 \
  npx jest --config packages/agents-ux/jest.config.cjs \
    --testPathPattern="__tests__/talk-to-figma" \
    --verbose
```

| # | Test | Server | Method | What it proves |
|---|---|---|---|---|
| 1 | connects to bridge | `figma-write` | `isAvailable` | WebSocket + channel join works |
| 2 | create_frame | `figma-write` | `create_frame` | Node creation, returns ID |
| 3 | create_text in frame | `figma-write` | `create_text` | Text node in parent frame |
| 4 | set_layout_mode | `figma-write` | `set_layout_mode` | Layout modification |
| 5 | set_fill_color | `figma-write` | `set_fill_color` | Style application |
| 6 | compose card | `figma-write` | multiple | Multi-step: frame + text + fill + corner_radius + padding |
| 7 | move_node | `figma-write` | `move_node` | Position modification |
| 8 | bidirectional | both | get_metadata + create_frame | Read via `figma` (REST), write via `figma-write` (WebSocket) |

### Architecture Note

This spike uses two transports routed by server name:
- `'figma'` → REST transport (read-only, Figma API via Personal Access Token)
- `'figma-write'` → WebSocket transport (read/write, TalkToFigma bridge, no token needed)

The routing is handled in the test, not in core. A production implementation would register transports per server in the MCP client config.

## Playwright MCP

### Prerequisites

1. Playwright is already in devDependencies (`@playwright/test: ^1.48.0` pulls in `playwright`)
2. Chromium browser binaries must be installed:
   ```bash
   npx playwright install chromium
   ```
3. No API tokens or external accounts needed — uses a local HTML fixture

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `RUN_MCP_SPIKES` | Yes | Set to `true` to enable spike tests |

No additional tokens needed — Playwright runs a local browser against a static HTML fixture.

### Running the Spike

```bash
# From repo root
RUN_MCP_SPIKES=true \
  npx jest --config packages/agents-ux/jest.config.cjs \
    --testPathPattern="__tests__/playwright" \
    --verbose
```

Without `RUN_MCP_SPIKES=true`, all spike tests skip automatically:

```bash
npx jest --config packages/agents-ux/jest.config.cjs \
  --testPathPattern="__tests__/playwright" --verbose
# Output: all "Playwright MCP Spike" tests show as skipped
```

### What the Spike Tests

| # | Test | What it proves |
|---|---|---|
| 1 | `isAvailable('playwright')` | MCPClient → middleware → transport chain works |
| 2 | `snapshot` returns accessibility tree | `page.accessibility.snapshot()` returns ARIA content ("Monthly cost summary", "Total Cost"), logs response size (expect 2-5KB) |
| 3 | `screenshot` returns base64 PNG | Valid base64 with PNG magic bytes, logs size comparison vs snapshot (~10-50x larger) |
| 4 | Accessibility tree detects ARIA attributes | Contains `region` role, `aria-label`, `aria-describedby` content, `heading` role |
| 5 | `evaluate` extracts DOM text | `document.querySelector('.metric').textContent` returns `"$47.50"` |

### Expected Output (success)

```
[spike] snapshot response size: 850 bytes
[spike] size comparison — snapshot: 850 bytes, screenshot: 25000 bytes, ratio: 29.4x
[spike] ARIA attributes detected: region role, aria-label, aria-describedby content, heading role
[spike] evaluate result: $47.50
```
