# ADR-026: E2E Proof Run — Cost Dashboard Module

## Date
2026-03-19

## Status
Accepted

## Context
The UX Dashboard squad (ADR-023) defined 5 agents for the design phase pipeline:
research, planning, implementation, review, and testing. Before proceeding with
real dashboard scaffold work, we needed to validate that the full 5-stage pipeline
runs end-to-end with real LLM calls, produces structurally correct output at each
stage, and that each stage's output feeds correctly into the next.

This ADR documents the results of the E2E proof run (Prompt 8.7) against the
Cost Dashboard module — the first module targeted by the UX squad.

## Proof Run Configuration

| Parameter | Value |
|---|---|
| Module | cost-dashboard |
| Research provider | claude-opus-4-6 |
| Planning/Impl/Review/Testing provider | claude-sonnet-4-6 |
| MCP client | Mock (returns Ok for all tool calls) |
| Governance | Mock (always proceed) |
| FileSystem | Mock (empty — no existing specs) |

## Results

All 5 stages passed. Total wall-clock time: ~202s. Estimated API cost: ~$0.07.

### Stage 1: Research
- **Status**: PASS
- **Time**: ~45s
- **Output**: Design brief with requirement IDs, design constraints, accessibility
  requirements, and data model dependencies.
- **Key metrics**: 6 requirements mapped, 6+ design constraints, 5+ accessibility
  requirements, data model dependencies include CostRecord and related types.
- **Provider**: claude-opus-4-6 (deep qualitative analysis)

### Stage 2: Planning
- **Status**: PASS
- **Time**: ~55s
- **Output**: Component specification with component tree, token bindings,
  responsive rules, and 4 implementation stages.
- **Key metrics**: 3+ component tree nodes, 5+ token bindings, 2+ responsive
  rules, all 4 stages present (layout, theme, animation, implementation).
- **Provider**: claude-sonnet-4-6

### Stage 3: Implementation (layout stage)
- **Status**: PASS
- **Time**: ~50s
- **Output**: Generated React/Tailwind component files for the layout stage.
- **Key metrics**: 1+ files generated, React imports present, Tailwind className
  usage confirmed, aria-* accessibility attributes present in output.
- **Provider**: claude-sonnet-4-6
- **Cost**: Tracked via totalCostUsd on implementation output.

### Stage 4: Review (mock MCP)
- **Status**: PASS
- **Time**: ~25s
- **Output**: Review with issues array, accessibility/design-system/visual-fidelity
  pass flags, and overall pass flag.
- **Key metrics**: Review issues generated, boolean pass flags for all 4 dimensions.
- **Note**: Ran with mock MCP — the review agent produced best-effort LLM output
  without actual Playwright/browser validation. Visual fidelity checks are
  simulated.

### Stage 5: Testing (mock MCP)
- **Status**: PASS
- **Time**: ~27s
- **Output**: Test file paths, pass/fail/healed counts.
- **Key metrics**: 1+ test files generated, pass/fail/healed counts tracked.
- **Note**: Ran with mock MCP — test execution and self-healing are simulated.
  The self-healing pipeline data structures are fully implemented but no actual
  browser execution occurred.

## Issues Found During Proof Run

### 1. maxTokens Truncation
The Claude provider's `generateText` method required explicit `maxTokens` to
avoid truncated JSON responses. Each agent work function sets an appropriate
`maxTokens` value (4096–8192) to ensure complete structured output.

### 2. MODEL_ALIASES Resolution
The `createClaudeProvider` factory initially did not resolve model aliases
(e.g., `claude-sonnet-4-6` to the full model ID). This was fixed in the provider
layer to map convenience names to full Anthropic model IDs.

### 3. Jest Module Mapper
The integration test required Jest `moduleNameMapper` configuration to resolve
`@agentforge/*` package imports correctly. The `jest.config.cjs` for
`agents-ux` was updated to map all workspace packages.

## Recommendations

### 1. Real Playwright MCP for Review/Testing
The review and testing agents currently run with mock MCP. For production use,
integrate a real Playwright MCP server to enable:
- Actual browser-based visual regression testing
- Real accessibility audits (axe-core via Playwright)
- Screenshot comparison for visual fidelity checks

### 2. Planning Detail Enhancement
The planning agent's component tree could benefit from deeper decomposition —
currently produces a relatively flat tree. Consider multi-pass planning or
explicit depth requirements in the prompt.

### 3. Wireframe Preview Gate
Add an optional wireframe preview gate between planning and implementation.
This would render the component tree as a low-fidelity wireframe for human
review before committing to code generation (supports HITL pattern from PRD).

### 4. Cost Monitoring
Only the implementation stage currently tracks `totalCostUsd`. Extend cost
tracking to all 5 stages for accurate per-pipeline cost reporting. This is
essential for the budget governance features described in the PRD.

## Decision
The E2E proof validates that the 5-agent UX pipeline architecture (ADR-023)
works end-to-end with real LLM calls. All stages produce structurally correct
output and the pipeline completes in ~3.5 minutes at minimal cost (~$0.07).

**Proceed with**:
1. Real dashboard scaffold implementation using this pipeline
2. Playwright MCP integration for review/testing stages
3. Cost tracking expansion to all stages
