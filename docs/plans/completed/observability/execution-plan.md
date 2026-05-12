# Observability — Execution Plan

## Related Documents

- **ADR:** [`docs/adrs/ADR-052-langfuse-observability.md`](../../adrs/ADR-052-langfuse-observability.md)
- **Vision:** [`docs/vision.md`](../../vision.md) → Layer 11 (Observability)
- **Setup guide:** [`docs/guides/langfuse-setup.md`](../../guides/langfuse-setup.md)
- **Package:** `packages/telemetry/` (TracedProvider, LangfuseSink, CompositeSink, otel-init)

## Context

Vision Layer 11 prescribes OpenTelemetry + Langfuse self-hosted for LLM observability. Phase 1 (core integration) was pulled forward from the unify-pipeline Phase 7 timeline and completed 2026-04-27.

---

## Progress Checklist

### Phase 1 — Core Integration (COMPLETE, 2026-04-27)
- [x] **1.1** `packages/telemetry/` scaffolded with TracedProvider, LangfuseSink, CompositeSink, otel-init
- [x] **1.2** TracedProvider wraps `provider.complete()` with OTel generation spans (input/output/tokens/cost)
- [x] **1.3** CLI `design:page` wired (initLangfuseTracing + createTracedProvider + CompositeSink)
- [x] **1.4** CLI `design:page:all` wired
- [x] **1.5** Dashboard design route wired
- [x] **1.6** Docker Compose for self-hosted Langfuse v3 (`docker/docker-compose.langfuse.yml`)
- [x] **1.7** Setup guide (`docs/guides/langfuse-setup.md`)
- [x] **1.8** ADR-046 written
- [x] **1.9** Vision Layer 11 current state updated
- [x] **1.10** E2E script (`scripts/e2e-full-pipeline-with-tracing.sh`)
- [x] **1.11** Langfuse skill installed (`npx skills add langfuse/skills`), best practices applied
- [x] **1.12** Planning stage schema fix (`additionalProperties` → array pattern for `defaultValues`)
- [x] **1.13** Verified: 9 traces in Langfuse with full prompt/response content

### Phase 2 — Complete LLM Coverage
- [x] **2.1** CLI `design:generate` wired (2026-04-27)
- [x] **2.2** CLI `generate-design-options` wired (2026-04-27)
- [x] **2.3** Verified: design:generate trace lands in Langfuse (trace #9, programmatic check)
- [x] **2.4** Cleanup `promptTraces` — remove redundant in-memory trace mechanism (2026-04-27)

### Phase 3 — Prompt Versioning (COMPLETE, 2026-04-28)
- [x] **3.1** Add `version: X.Y.Z` frontmatter parser for `.md` prompt files (2026-04-28). `parsePromptFrontmatter()` in `packages/core/src/prompts/`. Strips frontmatter from LLM prompt, extracts version. All 8 prompt files now have frontmatter; all 8 loaders strip it. 15 unit tests.
- [x] **3.2** LLM wrapper records prompt version per call (in OTel span metadata) (2026-04-28). `promptVersion?: string` added to `CompletionOptions`. `TracedProvider` records it in Langfuse `metadata.promptVersion`. Threaded in 4 standard agents (planning, research, implementation via `provider.complete()`/`stream()`). 3 agents with local LLM interfaces (review, penpot-v2, browser-agent) strip frontmatter but can't thread version until migrated to standard provider.
- [x] **3.3** Pre-commit hook fails if prompt content changed without version bump (2026-04-28). `checkVersionBump()` in `packages/core/src/prompts/`. Script at `scripts/check-prompt-versions.ts`. `npm run check:prompts`. Install via `scripts/install-hooks.sh`. 6 unit tests.

### Phase 4 — Extended Tracing (COMPLETE, 2026-04-28)
- [x] **4.1** MCP tool call tracing (2026-04-28). `createTracedMCPClient()` in `packages/telemetry/src/traced-mcp-client.ts` — wraps `MCPClient.callTool()` with Langfuse `tool` observations via `startActiveObservation(..., { asType: 'tool' })`. Initially used raw `@opentelemetry/api` but Langfuse's `shouldExportSpan` filter drops raw OTel spans — switched to `@langfuse/tracing` SDK. Wired in `design-page.ts` (3 call sites). E2E deferred to backlog (needs live Penpot). 3 unit tests.
- [x] **4.2** Pipeline state transition tracing (2026-04-28). Added optional `wrapStage()` to `PipelineTelemetrySink` interface. `LangfuseSink.wrapStage()` uses `startActiveObservation('stage:${name}')` — establishes OTel context so LLM generation spans nest under stage spans automatically. Pipeline orchestrator (`pipeline.ts`) calls `sink.wrapStage()` when available, falls back to direct execution. E2E verified: all 4 `stage:*` spans visible in Langfuse with `promptVersion` metadata on nested LLM traces. 6 unit tests (LangfuseSink) + 2 pipeline integration tests (wrapStage + backward compat) + 2 CompositeSink tests.
- [x] **4.3** Cost aggregation — verified (2026-04-28). No new code needed. `TracedProvider` already sends `costDetails` on every generation span. Langfuse aggregates automatically.

### Phase 5 — Evaluation Infrastructure (NOT STARTED, deferred)
- [ ] **5.1** Trace replay for regression detection
- [ ] **5.2** Prompt version A/B testing via replay

---

## Key Files

| File | Role |
|------|------|
| `packages/telemetry/src/traced-provider.ts` | OTel wrapper for LLM providers |
| `packages/telemetry/src/langfuse-sink.ts` | Pipeline lifecycle sink |
| `packages/telemetry/src/composite-sink.ts` | Multi-sink forwarding |
| `packages/telemetry/src/otel-init.ts` | NodeSDK + LangfuseSpanProcessor |
| `docker/docker-compose.langfuse.yml` | Self-hosted Langfuse v3 stack |
| `docs/guides/langfuse-setup.md` | Setup, verification, troubleshooting |
| `docs/adrs/ADR-052-langfuse-observability.md` | Decision record |
