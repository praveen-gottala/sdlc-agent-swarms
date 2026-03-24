# ADR-027: Figma Bridge Tool Discovery

## Status
Accepted

## Context
The `TALK_TO_FIGMA_TOOLS` list in `packages/core/src/mcp/talk-to-figma-transport.ts` is a
static, manually maintained list of tools the TalkToFigma bridge supports. There was no
validation that the bridge actually implements all listed tools.

This caused issue #22: `create_ellipse` was listed in `TALK_TO_FIGMA_TOOLS` but the Figma
plugin (`cursor-talk-to-figma-mcp`) does not implement a `create_ellipse` command. The LLM
would generate `create_ellipse` calls that always failed at runtime.

### Architecture Constraints
- **Agent → MCP Client → WebSocket → Bridge (Docker) → Figma Plugin**
- The bridge is a relay — it does not know what commands the plugin supports.
- The plugin (`code.js`) is third-party and has no introspection API.
- Dynamic discovery from the plugin is not feasible without forking it.

## Decision
Add a `GET /tools` endpoint to the bridge patch (same pattern as existing `/channels`
endpoint). This returns a **verified tool list** — tools we have manually confirmed work
with the Figma plugin.

At runtime, `discoverTools()` queries this endpoint. The result is:
1. Stored in `FigmaSession.supportedTools` for caching
2. Used to filter `TALK_TO_FIGMA_TOOLS` in `listTools()` responses

If the bridge is unreachable or unpatched, the full static `TALK_TO_FIGMA_TOOLS` list is
used as a fallback.

`create_ellipse` has been removed from `TALK_TO_FIGMA_TOOLS` entirely since it is verified
as unsupported.

## Process for Updating the Verified Tool List
1. Test the tool manually via the TalkToFigma bridge + Figma plugin
2. Add to the `tools` array in `docker/talk-to-figma/patch-channels-endpoint.js`
3. Add to `TALK_TO_FIGMA_TOOLS` in `packages/core/src/mcp/talk-to-figma-transport.ts`
4. Rebuild Docker image: `docker compose build figma-bridge`
5. Run preflight to verify: `npx tsx packages/agents-ux/src/scripts/figma-preflight.ts`

## Consequences
- Tools not in the bridge's verified list are filtered out at runtime, preventing LLM from
  generating calls to unsupported tools
- `TALK_TO_FIGMA_TOOLS` remains the static fallback when the bridge is unreachable
- Two places to update when adding a tool (bridge patch + core static list), but this is
  intentional — the bridge list is the verified source of truth
- The bridge tool list is **not** introspected from the plugin — it is manually curated
