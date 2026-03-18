# ADR-018: Observability Middleware Moved to Outermost Position

## Date
2026-03-18

## Status
Rejected

## PRD Reference
PRD v2.0 Section 18: "Agents never interact with raw MCP servers directly; they go through an adapter layer that provides authentication, rate limiting, error recovery, caching, and observability hooks."

The PRD specifies observability hooks as a fundamental property of the adapter layer, implying every MCP interaction should be observable.

## What the Implementation Did (Before Fix)
The middleware chain was ordered: governance → auth → rateLimit → cache → retry → observability. Observability was the innermost middleware, closest to the transport. When the cache middleware returned a cached response, it short-circuited before reaching the observability middleware. This meant:
- Cache hits produced no observability traces
- Governance-blocked calls produced no observability traces
- Only calls that reached the transport were observed

## Reasoning
The original ordering placed observability innermost to measure "actual MCP server call latency." However, this violated the PRD intent that the adapter layer provides observability for all interactions. Cache hits and governance blocks are valid MCP interactions that operators need visibility into.

## Downstream Impact
P31 Event Catalog (Wave 7) validates that every middleware pipeline step produces an observability record. With the original ordering, P31 would report incomplete coverage for cached responses and governance-blocked calls.

## Decision
Moved observability middleware to the outermost position in the chain. New order: observability → governance → auth → rateLimit → cache → retry. Every MCP interaction now produces an observability trace, including:
- Cache hits (trace.cached = true)
- Governance-blocked calls (trace.success = false, trace.error set)
- Transport failures after retries

## Fix Applied
- `packages/core/src/mcp/mcp-middleware.ts`: Moved `createObservabilityMiddleware` to first position in `composeMCPMiddleware` array
- Updated module docstring to reflect new ordering
- Updated tests in `mcp-client.test.ts`, `mcp-middleware-pipeline-p14.test.ts`, `mcp-health-check-p14b.test.ts`
- All 76 MCP tests pass after fix

## PRD Update Required
None — the PRD already specifies observability hooks. The fix aligns implementation with PRD intent.
