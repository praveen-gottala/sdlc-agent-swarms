# How to test failure modes

> See also: [Failure Modes Reference](../reference/failure-modes.md) | [Error Handling Architecture](../architecture/error-handling.md)

CHIP defines 15 failure modes (F1-F15) in `docs/reference/failure-modes.md`. This guide explains how to reproduce the ones that are testable today, so you can verify recovery behavior before hitting them in production.

## Prerequisites

- Initialized project (`agentforge init`)
- For provider failure tests: `ANTHROPIC_API_KEY` set (or use `--mock`)
- For budget tests: `agentforge.yaml` with budget configuration

## Testable failure modes

### F1: LLM malformed output

Trigger the design pipeline with a mock provider that returns invalid JSON to verify the pipeline rejects it and retries.

```bash
# Use --mock to avoid real LLM calls, then manually corrupt the cached artifact
agentforge design:page home --mock --project-dir ./my-app

# Corrupt the planning spec to simulate malformed LLM output
echo '{"invalid": true}' > .agentforge/previews/home/artifacts/planning-spec.json

# Re-run from design stage — pipeline should detect invalid input
agentforge design:page home --stage design --project-dir ./my-app
```

**What to verify:** The pipeline returns an `Err` with code `LLM_MALFORMED_OUTPUT` rather than silently proceeding with garbage data.

**Code path:** `Result` pattern in `packages/core/src/types/result.ts` defines `ErrorCode` including `LLM_MALFORMED_OUTPUT`. The `parseLLMResponse()` function in `packages/cli/src/commands/generate-design-options.ts` validates LLM output structure.

### F2: LLM rate limit / API outage

Simulate a rate-limited provider by setting an invalid API key, which returns 401 (similar error path to 429/5xx).

```bash
# Set an invalid key to trigger provider errors
ANTHROPIC_API_KEY=sk-invalid agentforge design:page home --project-dir ./my-app
```

**What to verify:** The pipeline returns an `Err` with code `LLM_RATE_LIMIT` or `LLM_API_ERROR` and does not crash with an unhandled exception.

**Code path:** Provider error handling in `packages/providers/src/claude-provider.ts`. Retry logic in `packages/core/src/mcp/mcp-middleware.ts` (line 273, `LLM_RATE_LIMIT` detection).

### F3: Budget exceeded

The design pipeline's evaluator enforces a quality threshold that functions as a budget gate — designs below the threshold trigger correction retries with bounded iteration.

```bash
# Set a low evaluation threshold to test the correction loop boundary
agentforge design:page home --evaluate --evaluate-threshold 95 --project-dir ./my-app
```

**What to verify:** The pipeline either loops until the threshold is met or exits after the maximum correction iterations. Budget error code `BUDGET_EXCEEDED_TASK` is defined in `packages/core/src/types/result.ts`.

**Unit test path:** `packages/core/src/agent-runtime/agent-runtime-lifecycle-p11.test.ts` (line 287) tests `BUDGET_EXCEEDED_TASK` error handling.

### F11: Agent stuck in loop

The circuit breaker interface (`packages/core/src/agent-runtime/agent-runtime-lifecycle-p11.test.ts`, line 506) defines the contract: >5 LLM calls without state change triggers `AGENT_LOOP_DETECTED`.

```bash
# Unit test for circuit breaker behavior
cd packages/core && npx jest agent-runtime-lifecycle --testNamePattern="CircuitBreaker"
```

**What to verify:** The circuit breaker interface validates that `recordCall`, `isLooping`, `reset`, and `getState` methods exist. The `AbortSignal` test (line 543) verifies agents abort when the signal fires.

## Not yet testable

The following failure modes reference pipelines or integrations that are not yet implemented:

| Mode | Why not testable | Depends on |
|------|-----------------|------------|
| F4: HITL approval timeout | Timer-based escalation not yet wired into LangGraph interrupts | LangGraph interrupt timeout handling |
| F5: Git merge conflict | Implementation agent not yet built | `packages/agents-code/` (planned) |
| F6: CI pipeline fails | CI agent not yet built | `packages/agents-cicd/` (planned) |
| F7: Figma MCP unavailable | Design pipeline uses browser/Penpot, not Figma | Figma integration |
| F10: Slack/Telegram failure | Messaging integration not yet built | `packages/channels/` (planned) |
| F12: Concurrent spec edits | Lock manager exists but no concurrent agent scenarios | Multi-agent execution |

## Using mock providers for safe testing

The `createMockLLMProvider()` function (`packages/cli/src/mock-llm-outputs/index.ts`) returns a provider that responds with deterministic, pre-recorded outputs. Use it to test pipeline behavior without making LLM calls:

```bash
# All design commands accept --mock
agentforge design:page home --mock
agentforge design-system update --mock
```

Mock providers are useful for testing the pipeline's structural behavior (stage sequencing, caching, artifact writing) but cannot test LLM-specific failure modes like malformed output or context overflow.

## Verify

After testing a failure mode:

1. Check the exit code: failed pipelines should set `process.exitCode = 1`
2. Check the error output: `Err` results should include `code`, `message`, and `recoverable` fields
3. Verify no unhandled exceptions: the pipeline should never crash with a stack trace for expected failure modes

## What's next

- [Error Handling Architecture](../architecture/error-handling.md) — Result pattern and error types
- [Failure Modes Reference](../reference/failure-modes.md) — full F1-F15 catalog
- [Design Generation Guide](design-generation.md) — pipeline stages and troubleshooting
