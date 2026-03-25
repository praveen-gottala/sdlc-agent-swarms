# ADR-032: `runAgent` does not retry when `recoverable: false`

## Status

Accepted

## Context

Agent contracts often specify `on_error: 'retry(max=2) then notify_human + pause'`. The runtime interpreted this as retrying **any** `Err` from the work function up to `retryMax + 1` attempts.

Work functions can return `Err` with `recoverable: false` for deterministic failures (missing required files, invalid input shape, policy violations). Retrying these attempts wastes time and obscures the real error.

## Decision

When the work function returns `Err` and `error.recoverable === false`, `runAgent` stops immediately (no further attempts), then applies the same post-failure path as exhausted retries: audit + `Ok({ status: 'error', error })`.

## Consequences

- Callers must set `recoverable: true` on transient failures (LLM timeouts, rate limits) if retries should run.
- Configuration or missing dependency errors should use `recoverable: false` for fast fail.

## References

- Implementation: `packages/core/src/agent-runtime/base-agent.ts`
- Tests: `packages/core/src/agent-runtime/base-agent.test.ts`
