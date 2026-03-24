# ADR-030: Penpot as Alternative Design Tool

## Status
Accepted

## Context
AgentForge supports Figma as its sole design tool via a WebSocket bridge
(docker/talk-to-figma/). Penpot is an open-source design tool that provides
an MCP server on its `mcp-prod` branch, using HTTP/SSE transport (port 4401).

Users who prefer open-source tooling or self-hosted design environments need
an alternative to Figma.

## Decision

### Adapter Pattern
Introduce `DesignToolAdapter` interface in `packages/core/src/mcp/` that
abstracts transport, preflight, and MCP client creation. Both Figma and
Penpot implement this interface.

### Separate Commands
- `design:figma` -- existing Figma pipeline (unchanged)
- `design:penpot` -- new Penpot pipeline
- `design:collaborate --tool <figma|penpot>` -- tool-agnostic collaboration

### No Universal Tool Mapping
Figma and Penpot have different tool APIs with different names and parameter
schemas. Each gets its own LLM prompt. The LLM adapts to the tool rather
than us maintaining a brittle translation layer.

### Dynamic Tool Discovery for Penpot
Unlike Figma's statically-defined 76+ tools, Penpot tools are discovered
at runtime via `tools/list`. This makes the adapter resilient to Penpot
MCP server updates.

### Transport Differences
| Aspect | Figma | Penpot |
|--------|-------|--------|
| Transport | WebSocket (ws://localhost:3055) | HTTP/SSE (http://localhost:4401/mcp) |
| Protocol | Custom message/broadcast | JSON-RPC 2.0 |
| Channels | Yes (plugin discovery) | No |
| Tool list | Static (hardcoded) | Dynamic (tools/list) |
| Plugin | Required (Figma desktop) | Not required |

## Consequences
- Pipeline code becomes tool-agnostic through the adapter interface
- Existing Figma behavior is unchanged (no regression risk)
- New env vars: `AGENTFORGE_MCP_PENPOT_URL`, `AGENTFORGE_MCP_PENPOT_WS_URL`
- Docker setup: `docker/penpot-mcp/` with standalone Dockerfile
