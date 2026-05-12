# ADR-052: Langfuse Observability — Phase 7 Pull-Forward

## Status

Accepted (2026-04-27)

## Context

The design pipeline makes multiple LLM calls per page (research, planning, design) but has no way to inspect the actual prompts, responses, token usage, or cost per call. Debugging a multi-minute pipeline run is effectively impossible — the only output is CLI stage names and final artifacts.

Vision Layer 11 prescribes OpenTelemetry + Langfuse self-hosted for LLM observability but schedules it as Phase 7 of the pipeline unification roadmap. The immediate need for LLM I/O visibility during E2E testing justified pulling Phase 7 forward.

## Decision

### 1. New `packages/telemetry/` package

Observability code lives in a dedicated package, following the established pattern where sink implementations live in their transport packages (CLI sink in `packages/cli/`, dashboard sink in `packages/dashboard/`). This keeps OTel/Langfuse dependencies out of `packages/agents-ux/` and `packages/core/`.

### 2. TracedProvider — OTel at the provider level

Rather than widening the `PipelineTelemetrySink` interface with prompt/response content fields, LLM calls are instrumented at the provider level. `createTracedProvider(provider)` wraps any `LLMProvider` and auto-creates OTel spans for every `complete()` call with full input/output capture.

This means:
- **Every** LLM call through any codepath (design pipeline, design:generate, future agents) is auto-traced
- No changes to `PipelineTelemetrySink` interface
- No per-stage wiring needed for new stages
- Vision-aligned: "every LLM call emits an OTel span"

### 3. LangfuseSink — pipeline lifecycle spans

`LangfuseSink` implements `PipelineTelemetrySink` for stage-level events (start, complete, fail). Combined with `TracedProvider`, this produces nested trace trees: pipeline → stage → LLM call.

### 4. CompositeSink — additive integration

`CompositeSink` forwards all sink callbacks to multiple sinks. CLI commands create `CompositeSink([cliSink, langfuseSink])` so Langfuse runs alongside existing CLI output.

### 5. Graceful degradation

When `LANGFUSE_SECRET_KEY` is not set:
- `initLangfuseTracing()` is a no-op
- `createTracedProvider()` returns the unwrapped provider
- `createLangfuseSink()` returns null
- Zero behavior change from the pre-telemetry codebase

### 6. Self-hosted Docker Compose

`docker/docker-compose.langfuse.yml` provides a one-command Langfuse v3 stack (Postgres, ClickHouse, Redis, MinIO, web+worker) for local development.

Key configuration details discovered during setup:
- **`CLICKHOUSE_CLUSTER_ENABLED=false`** — single-node ClickHouse doesn't have Zookeeper; without this, migrations fail with `ReplicatedMergeTree` errors
- **`CLICKHOUSE_MIGRATION_URL`** — uses native protocol (`clickhouse://`) on port 9000, separate from the HTTP query URL on 8123
- **`ENCRYPTION_KEY`** — must be exactly 64 hex characters (256 bits); generate with `openssl rand -hex 32`
- **`LANGFUSE_S3_EVENT_UPLOAD_*`** — Langfuse v3 requires explicit S3 bucket config for event uploads (not just generic `S3_BUCKET_NAME`)
- **MinIO buckets** — `langfuse` and `langfuse-media` must exist; the compose entrypoint auto-creates them via `mc mb`
- **Port 3001** — mapped to avoid conflict with AgentForge dashboard on port 3000

## Consequences

- `packages/telemetry/` adds `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/sdk-node` as dependencies
- `packages/cli/` adds `@agentforge/telemetry` as a dependency
- Docker is required only for the Langfuse UI — the pipeline works without it
- Phase 7 of the pipeline unification roadmap is partially complete (LLM call tracing + prompt versioning). Remaining: cost aggregation dashboard, evaluation replay infrastructure.

## Alternatives Considered

1. **File-based trace dump** — Custom JSON files per LLM call. Rejected: throwaway once Langfuse ships, no query/filter/compare capability, no nested traces.

2. **Widen PipelineTelemetrySink.onLlmCall** — Add optional `input`/`output` content fields. Rejected: couples interface to Langfuse's needs, requires updates for each new trace type, every sink implementation must change.

3. **Keep Phase 7 deferred** — Wait until after Phase 4/5. Rejected: immediate need for LLM I/O visibility during E2E testing; Langfuse integration is additive and doesn't conflict with Phase 4/5 work.
