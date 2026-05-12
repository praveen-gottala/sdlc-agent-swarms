# Observability

> Authoritative source: [vision.md Layer 11](../vision.md#layer-11-observability) and [Langfuse Setup Guide](../guides/langfuse-setup.md)

Every LLM call, tool call, and pipeline stage is traced with OpenTelemetry — and every trace is tagged with the exact prompt version that produced it, enforced by a pre-commit hook. Langfuse self-hosted as trace backend; budget governance middleware can abort runs that exceed cost thresholds. Graceful no-op when `LANGFUSE_SECRET_KEY` is unset — pipeline runs identically without telemetry infrastructure.

## Why CHIP does this

Three locked decisions from [ADR-052](../adrs/ADR-052-langfuse-observability.md) shape CHIP's observability:

- **Self-hosted traces.** All telemetry data stays on infrastructure you control — no prompt content or model outputs leave your network.
- **Prompt versioning with pre-commit enforcement.** Every prompt file carries a version in its frontmatter. A pre-commit hook blocks content changes without a version bump. Every Langfuse trace records which version produced it, so regression analysis traces quality changes to specific prompt edits.
- **Per-call cost tracking.** Every LLM call records input/output token counts and cost. Governance middleware uses these to enforce budget thresholds per run — the same data that powers observability also powers budget governance.

## Architecture

```mermaid
graph TB
    subgraph App ["CHIP Telemetry Layer"]
        TP[TracedProvider] -->|LLM spans| OTel[OpenTelemetry SDK]
        MCP[createTracedMCPClient] -->|Tool spans| OTel
        LS[LangfuseSink] -->|Pipeline stage spans| OTel
        CS[CompositeSink] --> LS
    end

    OTel --> LF[Langfuse Self-Hosted]

    subgraph LF ["Langfuse Backend"]
        PG[(PostgreSQL)]
        CH[(ClickHouse)]
        RD[(Redis)]
        MO[(MinIO)]
    end

    style TP fill:#4A90D9,color:#fff
    style LS fill:#2ECC71,color:#fff
    %% Blue (#4A90D9) = LLM tracing, Green (#2ECC71) = pipeline lifecycle
```

## Span Types

| Span | Created by | Attributes |
|------|-----------|------------|
| LLM call | `TracedProvider` wrapping `provider.complete()` | Model, prompt version, input/output tokens, latency, cost (`costDetails`), response schema |
| Tool call | `createTracedMCPClient` wrapping `MCPClient.callTool()` | Tool name, arguments (sanitized), response size, latency. Uses `@opentelemetry/api` for post-hoc span lifecycle. |
| Pipeline stage | `LangfuseSink` | Stage name (`stage:research`, `stage:planning`, etc.), duration, cost/token aggregates. `dispose()` for orphan cleanup. |

CompositeSink routes telemetry to multiple destinations: terminal output for CLI users, real-time dashboard updates (via server-sent events), and Langfuse for persistent traces.

## Components

| Component | Source | Purpose |
|-----------|--------|---------|
| TracedProvider | `packages/telemetry/src/traced-provider.ts` | Wraps LLM calls with OpenTelemetry spans |
| createTracedMCPClient | `packages/telemetry/src/traced-mcp-client.ts` | Wraps tool calls with OpenTelemetry spans |
| LangfuseSink | `packages/telemetry/src/langfuse-sink.ts` | Pipeline stage lifecycle spans with cost/token attributes |
| CompositeSink | `packages/telemetry/src/composite-sink.ts` | Routes telemetry to multiple destinations |

## Prompt Versioning

Every `.md` prompt file carries YAML frontmatter:

```yaml
---
version: 2.1.0
purpose: Generate DesignSpec JSON for a single screen
---
```

Three enforcement mechanisms:

1. `parsePromptFrontmatter()` — strips frontmatter before LLM input
2. `TracedProvider` — records `metadata.promptVersion` on every Langfuse generation span
3. `scripts/check-prompt-versions.ts` — pre-commit hook fails if prompt content changed without version bump

Every Langfuse trace shows which prompt version produced it. Regression analysis traces quality changes to specific prompt edits.

## Cost Tracking

`TracedProvider` captures per-call cost: `input_tokens * model_input_rate + output_tokens * model_output_rate`. Langfuse aggregates per call, per stage, per run, per project. Governance middleware budget layer can abort runs when cost exceeds configurable threshold.

## Setup

```bash
docker compose -f docker/docker-compose.langfuse.yml up -d
# Langfuse UI at http://localhost:3001 — create project, copy keys

export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_BASE_URL=http://localhost:3001
```

Full setup, verification, and troubleshooting: [Langfuse Setup Guide](../guides/langfuse-setup.md).

## Current Implementation

- **TracedProvider:** Wraps all `provider.complete()` calls. LLM spans with model, tokens, cost, prompt version.
- **MCP tracing:** `createTracedMCPClient` wraps tool calls with OTel spans.
- **LangfuseSink:** Pipeline stage lifecycle spans with cost/token attributes. Orphan cleanup via `dispose()`.
- **Prompt versioning:** Frontmatter parser + TracedProvider metadata + pre-commit hook. All operational.
- **Langfuse self-hosted:** Docker Compose (Postgres, ClickHouse, Redis, MinIO). UI at port 3001.

## Known limitations

- **Cost aggregation in CHIP dashboard.** Cost data surfaces in the Langfuse UI today; CHIP dashboard integration is planned.
- **Evaluation hooks for regression detection.** Planned as part of Layer 12 (evaluation infrastructure); deferred until observability Phase 5.
- **Sampling strategy at scale.** POC uses 100% sampling. Production sampling (head-based for successful runs, 100% for failures) is an open decision per [vision.md Layer 11](../vision.md#layer-11-observability).

## Related Docs

- [Vision Layer 11](../vision.md#layer-11-observability) — observability authority
- [Langfuse Setup Guide](../guides/langfuse-setup.md) — setup and troubleshooting
- [ADR-052](../adrs/ADR-052-langfuse-observability.md) — architectural decision
- [Observability Plan](../plans/active/observability/execution-plan.md) — Phases 1-4 complete
