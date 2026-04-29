# Observability — MCP Tracing E2E Verification

## Status: BACKLOG

Deferred from Phase 4 (2026-04-28). `createTracedMCPClient` is wired in `design-page.ts` but untested end-to-end because the pipeline run used `--tool=browser` (no Penpot MCP calls).

## What exists

- `packages/telemetry/src/traced-mcp-client.ts` — wraps `MCPClient.callTool()` with Langfuse `tool` observations via `startActiveObservation('mcp:server.method', ..., { asType: 'tool' })`
- Wired at 3 MCP client creation points in `packages/cli/src/commands/design-page.ts`
- 3 unit tests pass (graceful degradation path only)

## What needs verification

1. Run `design:page <page> --tool=penpot` with a live Penpot MCP server and Langfuse configured
2. Verify `mcp:penpot.execute_code` spans appear in Langfuse UI
3. Verify span attributes: `mcp.server`, `mcp.method`, `mcp.latency_ms`, `mcp.success`
4. Verify error spans when tool call fails

## Prerequisites

- Penpot MCP server running (Docker)
- Langfuse running (`docker compose -f docker/docker-compose.langfuse.yml up -d`)
- `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` set

## When to pick up

When next working on Penpot MCP integration or design pipeline with `--tool=penpot`.
