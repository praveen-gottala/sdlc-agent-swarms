# CHIP: Dependency Upgrade & Agent SDK Assessment

**Date:** 2026-04-08
**Status:** Planned (not yet implemented)

## Context

AgentForge is a TypeScript monorepo (Nx) for multi-agent SDLC orchestration. The project has accumulated version drift across several key dependencies, and the question of whether to adopt Anthropic's Agent SDK needs evaluation given AgentForge's existing custom orchestration infrastructure.

---

## Part 1: Software Version Upgrades

### Tier 1 -- Critical (Do This Week)

| # | Package | Current | Action | Why |
|---|---------|---------|--------|-----|
| 1 | `@anthropic-ai/sdk` in `tools/mechanical-validation` | `^0.39.0` | Upgrade to `^0.80.0` (match providers) | 41 minor versions behind; missing `output_config`, security patches |
| 2 | `chalk` in `packages/cli` | Declared `^5.4.1`, resolves to `4.1.2` | Investigate with `npm ls chalk`; fix hoisting conflict | Silent API mismatch -- v4 vs v5 are different (v5 is ESM-only) |
| 3 | `yaml` in `packages/cli` | `^2.7.0` | Bump to `^2.8.2` (match core/root) | Version floor mismatch across monorepo |
| 4 | Node.js in CI | `20` | Upgrade to `22` LTS; create `.nvmrc` | Node 20 EOL is April 2026 (this month) |

**Files:**
- `tools/mechanical-validation/package.json`
- `packages/cli/package.json`
- `.github/workflows/ci.yml`, `.github/workflows/agentforge-ci.yml`
- New: `.nvmrc` (content: `22`)

### Tier 2 -- Recommended (Next 2-4 Weeks)

| # | Package | Current | Target | Notes |
|---|---------|---------|--------|-------|
| 5 | `@anthropic-ai/sdk` | `^0.80.0` | Latest stable | Single integration point: `packages/providers/src/claude/claude-provider.ts`. Check for 1.0 breaking changes in types (`Anthropic.TextBlock`, `Anthropic.ToolUseBlock`, etc.) |
| 6 | `@anthropic-ai/vertex-sdk` | `^0.14.4` | Latest stable | Upgrade in tandem with main SDK. May reduce the `as unknown as Anthropic` cast |
| 7 | ESLint config | `.eslintrc.json` (legacy) | `eslint.config.js` (flat config) | ESLint 9 defaults to flat config; ESLint 10 will drop legacy support |
| 8 | `jest-environment-jsdom` | `^30.3.0` in dashboard | Reconcile with `jest` `^29.7.0` | Major version mismatch between jest (29) and jsdom env (30) |

### Tier 3 -- Nice-to-Have (Next 1-3 Months)

| # | Package | Current | Target | Notes |
|---|---------|---------|--------|-------|
| 9 | Next.js | `^14.2` | `^15.x` | Requires React 19 upgrade simultaneously. Main breaking change: async request APIs |
| 10 | React | `^18.3` | `^19.x` | Bundle with Next.js 15. Dashboard package only |
| 11 | Prisma | `^5.22` | `^6.x` | Review migration guide for schema/client API changes |
| 12 | Tailwind CSS | `^3.4` | v4 | Major rewrite (CSS-based config). Defer unless rebuilding dashboard UI |

### No Action Needed

- **openai** (`^4.77.0`): Already resolves to `4.104.0` within the `^4` range
- **typescript** (`^5.6.0`): Resolves to `5.9.3`. Floor is fine
- **nx** (`^22.6.0`): Recent enough. Run `nx migrate latest` periodically
- **commander** (`^12.1.0`): Stable, no urgent upgrade
- **express** (`^4.21`): Minimal usage in the project

---

## Part 2: Anthropic Agent SDK -- Should We Adopt It?

### Recommendation: NO

AgentForge should **not** adopt the Anthropic Agent SDK (`@anthropic-ai/agent-sdk`). Here's why:

### What the Agent SDK Provides
- Automatic agentic loop (tool_use -> execute -> feed back -> next LLM call)
- Built-in guardrails (input/output validation)
- Pre-built agent patterns (single agent, handoff, orchestrator-worker)
- MCP integration
- Tracing/observability

### Why It Conflicts with CHIP's Architecture

**1. Governance middleware cannot wrap internal SDK calls.**
AgentForge's governance pipeline (permission -> budget -> HITL -> audit, per ADR-004) must wrap **every** LLM call and **every** tool call. The Agent SDK's agentic loop encapsulates these internally with no hook points to insert per-call governance.

**2. Budget enforcement requires mid-stream abort.**
AgentForge enforces budgets in real-time during streaming (`controller.abort()` when budget exceeds 80%). The SDK's internal loop doesn't expose per-turn streaming for budget enforcement.

**3. AgentForge is multi-provider.**
The Agent SDK is Anthropic-only. AgentForge routes to Claude, OpenAI, or Ollama based on agent contracts via `ProviderRegistry`. Adopting the SDK would create two parallel execution paths.

**4. MCP middleware chain would be bypassed.**
AgentForge's MCP client has 6 middleware layers (observability -> governance -> auth -> rate-limit -> cache -> retry). The SDK's built-in MCP client would bypass all of these.

### What CHIP Already Has vs. Agent SDK

| Capability | AgentForge | Agent SDK |
|------------|-----------|-----------|
| Agentic loop | Manual per-agent (gap) | Automatic (strength) |
| Governance | Deep: permission, budget, HITL, audit | Basic guardrails |
| Provider support | Claude, OpenAI, Ollama | Claude only |
| Cost tracking | Real-time per-token, budget alerts/abort | Basic token counting |
| MCP integration | 6-layer middleware chain | Built-in, simpler |
| HITL | Multi-channel (Slack, Telegram, CLI) | Not included |
| Agent definition | Declarative YAML contracts | Code-based |
| Error handling | Result<T> pattern, typed codes, retry strategies | Try/catch |
| Event system | 31 typed domain events | Not included |

### Better Alternative: Build a Generic Agentic Loop

Instead of the SDK, build a reusable agentic loop utility in `@agentforge/core/agent-runtime/`:

```
while (finishReason === 'tool_use'):
  1. Extract tool calls from LLM response
  2. For each: run through MCP middleware (governance, auth, rate-limit, cache, retry)
  3. Collect tool results
  4. Build next message with tool results
  5. Call LLM again (through provider abstraction, with budget enforcement)
  6. Check abort signal + governance gate
```

This preserves all existing infrastructure while eliminating the manual tool_use handling gap. **Estimated effort: 2-3 days** vs. weeks of refactoring to adopt the Agent SDK.

### When to Reconsider
- If Anthropic releases standalone utilities (token counting, structured output helpers) that can be adopted individually
- If a future Agent SDK version exposes middleware hooks for governance/budget injection
- If AgentForge drops multi-provider support and goes Claude-only

---

## Verification Plan

1. **Tier 1 fixes**: Run `nx run-many -t typecheck && nx run-many -t test` after each change
2. **SDK upgrades**: Run provider integration tests; manually test `agentforge design` pipeline end-to-end
3. **Node 22**: Run full CI pipeline on Node 22 before merging
4. **Generic agentic loop**: Unit test with mock provider; integration test with real tool calls through MCP middleware
