# Observability — Handoff Answer Key

## Turn 2: Answers

1. **`docs/active-plan/observability/execution-plan.md`**. Phase 1 (core integration) **COMPLETE**, Phase 2 (complete LLM coverage) **2.1-2.3 COMPLETE**, **2.4 pending** (cleanup promptTraces). Phase 3 (prompt versioning) **NOT STARTED**. Phase 4 (extended tracing) **NOT STARTED**. Phase 5 (evaluation) **NOT STARTED, deferred**. Cite: `docs/active-plan/observability/execution-plan.md` → Progress Checklist.

2. **`packages/telemetry/`**. Four modules: **`otel-init.ts`** (NodeSDK + LangfuseSpanProcessor), **`traced-provider.ts`** (LLMProvider OTel wrapper), **`langfuse-sink.ts`** (PipelineTelemetrySink implementation), **`composite-sink.ts`** (multi-sink forwarding). Cite: `docs/active-plan/observability/execution-plan.md` → Key Files; `packages/telemetry/src/index.ts`.

3. Wraps any **`LLMProvider`**. Creates an OTel span with **`asType: 'generation'`** for every `complete()` call. Captures: **system prompt, user message** (input), **response content, toolCalls, finishReason** (output), **usageDetails** (input/output/total/cacheRead/cacheWrite tokens), **costDetails** (input/output/total USD), **model name**, **modelParameters** (temperature, maxTokens). Returns provider unchanged when Langfuse not configured. Cite: `packages/telemetry/src/traced-provider.ts`.

4. Widening the sink interface would **couple it to Langfuse's needs** and require updates for each new trace type. Instead, **OTel at provider level** was chosen — `TracedProvider` wraps `provider.complete()` so **every LLM call everywhere is auto-traced** without per-stage wiring. No sink interface changes needed. Cite: `docs/adrs/ADR-046-langfuse-observability.md` → Decision §2.

5. **`design:page`**, **`design:page:all`**, **`design:generate`**, **`generate-design-options`**, **Dashboard design route**. Cite: `docs/guides/langfuse-setup.md` → Traced Commands table.

6. ```bash
npx langfuse-cli api traces list --limit 5 --server http://localhost:3001 --json \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); \
    console.log('Traces:', d.body.meta.totalItems); \
    d.body.data.forEach(t => console.log(' ', t.name, '|', t.timestamp, \
      '| input:', Object.keys(t.input||{}).join(',') || 'none', \
      '| output:', Object.keys(t.output||{}).join(',') || 'none'));"
```
Cite: `docs/guides/langfuse-setup.md` → "Verify traces programmatically".

7. **Graceful degradation — no break, no warning, silent no-op.** `initLangfuseTracing()` is a no-op, `createTracedProvider()` returns the **unwrapped provider unchanged**, `createLangfuseSink()` returns **null**, CompositeSink falls back to CLI/dashboard sink only. **Zero behavior change.** Cite: `docs/guides/langfuse-setup.md` → Graceful Degradation; `packages/telemetry/src/otel-init.ts`; `packages/telemetry/src/traced-provider.ts`.

8. Claude API returns **400** for `additionalProperties: { oneOf: [...] }` — only `additionalProperties: false` is supported. Replaced with **`Array<{ key: string; value: T }>`** pattern in the JSON Schema, plus **`normalizeComponentTree()`** to convert back to a map after parsing. Cite: `docs/lessons-learned.md` → "Claude API Rejects `additionalProperties: object`"; `packages/agents-ux/src/ux-planning/ux-planning.ts`.

9. **No.** Claude API rejects `additionalProperties` as a type schema. Only `additionalProperties: false` is supported. Use `Array<{ key: string; value: string }>` instead. Cite: `docs/lessons-learned-rules.md` → "Claude API Rejects `additionalProperties: object`".

10. **Phase 2.4: Cleanup `promptTraces`** — remove the redundant in-memory trace mechanism. Files: `packages/core/src/agent-runtime/types.ts` (delete `recordPromptTrace`, `recordPromptTraceResponse`, remove `promptTraces` from `AgentContext`), `packages/agents-ux/src/design-pipeline/types.ts` (remove from `NodeContext`, `DesignPhaseState`), `packages/agents-ux/src/design-pipeline/pipeline.ts`, `browser-design-work.ts`, `ux-research.ts`, `ux-planning.ts`, `nodes.ts`. Cite: `docs/active-plan/observability/execution-plan.md` → Phase 2 checklist.

11. **Blind subagent test.** Spawn an Explore agent with NO context from the current conversation and ask it to accomplish a task using only the project's own files. If it can't find what it needs, docs have gaps — fix before declaring done. Cite: `CLAUDE.md` → Documentation → "Blind Subagent Test (MANDATORY)"; `docs/lessons-learned-rules.md` → "Blind Subagent Test for Documentation".

12. **`CLAUDE.md`** (auto-loaded, contains pointer to setup guide) → **`docs/guides/langfuse-setup.md`** (setup, verification, troubleshooting, traced commands) → **`docs/adrs/ADR-046-langfuse-observability.md`** (architectural rationale). Optionally: `docs/active-plan/observability/execution-plan.md` for progress tracking. Cite: `CLAUDE.md` → Tech Stack → Observability line.
