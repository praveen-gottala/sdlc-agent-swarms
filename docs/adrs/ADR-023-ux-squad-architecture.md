# ADR-023: UX Dashboard Squad Architecture

## Date
2026-03-19

## Status
Accepted

## PRD Reference
Section 4.6 — V3 Dashboard:
> "Real-time dashboard for monitoring agent activity, approving HITL gates, and
> viewing reasoning traces."

Section 6 — Agent Roles:
> Agents are specialized by role and operate within a specific SDLC phase.

## Decision
Implement the V3 UX Dashboard development capability as a squad of 5 specialized
agents, all operating in the `design` SDLC phase. The agents are:

1. **ux_dashboard_research** — Qualitative research: analyzes user personas,
   pain points, competitor dashboards, and accessibility requirements. Produces
   a structured design brief.

2. **ux_dashboard_planning** — Structural planning: decomposes the design brief
   into a component tree with responsive rules, prop contracts, and dependency
   ordering. Produces a component specification.

3. **ux_dashboard_implementation** — Code generation: implements the component
   spec through a 4-stage pipeline (layout → theme → animation → final). Produces
   generated files with implementation metadata.

4. **ux_dashboard_review** — Quality review: evaluates the implementation across
   parallel sub-evaluations (accessibility, responsiveness, performance, design
   consistency). Produces scored review issues with fix suggestions.

5. **ux_dashboard_testing** — Test generation and self-healing: generates
   component tests, integration tests, and visual regression tests. Includes a
   Phase 1 simulated self-healing pipeline that detects and patches brittle
   selectors, timing issues, and layout shifts.

## Why 5 Agents, Not 3

The initial design considered 3 agents (research+planning, implementation,
review+testing). The split to 5 was driven by:

- **Planning split from Research**: Research is qualitative (personas, pain
  points, competitor analysis) while planning is structural (component trees,
  prop contracts, dependency graphs). Combining them produced unfocused prompts
  that degraded both outputs. Separating them allows the research agent to use
  `claude-opus-4` for deeper analysis while planning uses `claude-sonnet-4` for
  structured decomposition.

- **Testing split from Review**: The self-healing testing pipeline (detect flaky
  test → classify root cause → generate patch → verify) is complex enough to
  warrant its own agent. Review focuses on scoring and categorizing issues;
  testing focuses on executable test generation and maintenance. Combining them
  exceeded reasonable prompt complexity for a single agent invocation.

## Why All Agents Use the 'design' Phase

All 5 agents operate in the `design` SDLC phase because they collectively
produce the UX design artifact — from research through validated implementation.
The UX squad's "implementation" is design-phase implementation (component code
generation from specs), not the `code` phase which handles backend/business
logic. This matches the PRD's phase model where design produces UI artifacts.

## Key Patterns

### 4-Stage Implementation Pipeline
The implementation agent processes work in 4 stages:
1. **Layout** — Structural HTML/component hierarchy
2. **Theme** — Design tokens, colors, typography
3. **Animation** — Transitions, micro-interactions
4. **Implementation** — Final code assembly with all layers

Each stage builds on the previous, allowing the LLM to focus on one concern at
a time. The `ImplementationStage` enum tracks progress.

### Parallel Review Sub-Evaluations
The review agent evaluates across 4 dimensions simultaneously:
- Accessibility (WCAG compliance, ARIA, keyboard navigation)
- Responsiveness (breakpoint coverage, touch targets)
- Performance (bundle size, render performance)
- Design consistency (token usage, spacing, typography)

Each dimension produces independent `ReviewIssue` entries with severity scores.

### Self-Healing Testing (Phase 1 Simulated)
The testing agent includes a self-healing pipeline that:
1. Detects test failures from brittle selectors, timing issues, or layout shifts
2. Classifies the root cause
3. Generates a patch
4. Verifies the patch resolves the failure

In Phase 1, this pipeline is simulated (no actual browser execution) but the
full data structures and classification logic are implemented, ready for Phase 2
integration with a real test runner.

## Provider Selection

| Agent | Provider | Rationale |
|---|---|---|
| ux_dashboard_research | claude-opus-4 | Deep qualitative analysis benefits from strongest reasoning |
| ux_dashboard_planning | claude-sonnet-4 | Structured decomposition; good balance of speed and quality |
| ux_dashboard_implementation | claude-sonnet-4 | Code generation; Sonnet excels at structured output |
| ux_dashboard_review | claude-sonnet-4 | Scoring and categorization; speed matters for feedback loops |
| ux_dashboard_testing | claude-sonnet-4 | Test generation; structured output with moderate reasoning |

## Budget Recommendation
UX squad phases involve 5 sequential agent invocations with substantial prompts.
Recommend setting `per_phase_max_usd` override to $60 for UX design phases
(default is typically lower for phases with fewer agents).

## Domain Events
The UX squad introduces 7 domain events to the event bus:

| Event | Emitted By | Consumed By |
|---|---|---|
| DashboardModuleRequested | Orchestrator | ux_dashboard_research |
| DesignBriefCompleted | ux_dashboard_research | ux_dashboard_planning |
| ComponentSpecReady | ux_dashboard_planning | ux_dashboard_implementation |
| ImplementationDraftReady | ux_dashboard_implementation | ux_dashboard_review |
| UXReviewCompleted | ux_dashboard_review | ux_dashboard_testing |
| UXTestSuiteCompleted | ux_dashboard_testing | Orchestrator |
| UXModuleDeployed | Orchestrator | Dashboard / external consumers |

These events are defined in `@agentforge/core` event bus with typed payloads
(see ADR for event registry completeness requirement in CLAUDE.md).

## Downstream Impact
- **agents.yaml**: 5 new entries appended (total 12 agents)
- **@agentforge/core**: 7 new events added to event registry
- **V3 Dashboard**: The UX squad agents will eventually build the dashboard
  they are designed to support (bootstrapping pattern)
