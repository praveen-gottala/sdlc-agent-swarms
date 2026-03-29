> **EVALUATION STATUS: Pending Review**
> - **What it contains:** Complete UX agent architecture spec (5 agents, MCP stack, orchestration, design system enforcement)
> - **Why flagged:** Blueprint for future V3 work, not a description of what's currently implemented.
> - **Counter-argument:** Valuable design document for V3 planning. Moving to docs/plans/ makes it findable when V3 begins.
> - **Recommendation:** Move to docs/plans/ — it's a plan, not current architecture documentation.

# AgentForge — UX Agent Architecture Blueprint

**Complete Specification for V2 → V3 Dashboard Development**

Version 1.0 — March 18, 2026
Classification: Internal — AgentForge Core Team

> This blueprint synthesizes two independent research efforts — a Meta-Architect analysis grounded in the AgentForge PRD v2.0, and an industry-wide survey of multi-agent UX architectures, MCP server capabilities, and production benchmarks from 2025–2026 — into a single actionable specification for building AgentForge's V3 dashboard through its own agentic framework.

---

## 1. Executive Summary

AgentForge V3 will be built by AgentForge itself — a recursive, self-referential architecture where the framework's own specialized AI agents design, implement, review, and test the dashboard that monitors and manages multi-agent workflows. This document defines the complete UX agent architecture required to execute that vision.

The architecture deploys **five specialized UX agents** orchestrated in a hybrid sequential-parallel pipeline, connected to **three primary MCP servers** (Figma, Playwright, GitHub) plus **two auxiliary integrations** (community Figma write server, Playwright CLI). Each agent operates within a formal agent contract per PRD Section 10.1, governed by the existing V2 permissions model, budget controls, and configurable HITL policies.

This blueprint is grounded in two independent research efforts that reached convergent conclusions: specialized UX agents dramatically outperform generalist approaches (72% vs. 39–50% code-review pass rates), MCP-based tool integration creates closed-loop feedback cycles that no single tool can replicate, and the feedback loop architecture matters more than individual model selection.

> **Key decision**: AgentForge's V3 dashboard is both the product deliverable and the proof-of-concept for the platform's agentic capabilities. Every architectural choice must serve both purposes.

---

## 2. Strategic Context: V2 Foundation and V3 Objectives

### 2.1 V2 baseline constraints (non-negotiable)

The V3 UX agent architecture must build upon, not replace, the following V2 foundations:

- **Mono-repo with Nx**: TypeScript CLI + TypeScript orchestration engine (per ADR-022)
- **Living Spec as source of truth**: Split per-module YAML files under `agentforge/spec/` with file-level write locks
- **Agent contract model**: 7-section YAML contracts stored in `agentforge/agents.yaml` with 20+ configurable fields per agent
- **Event-driven coordination**: In-memory EventEmitter event bus (34 event types, 13 V3-required) with bounded history buffer
- **Least-privilege permissions**: Governance middleware enforces permission → budget → HITL ordering per ADR-004
- **Agent Learnings**: Per-role memory in `.agentforge/learnings/<role>.yaml`, injected into agent context at runtime
- **Messaging-first HITL**: Slack (primary), Telegram (secondary), CLI (fallback) — dashboard extends but does not replace
- **Phase 1 stack**: React + Node.js + PostgreSQL + Tailwind CSS

### 2.2 V3 feature requirements driving UX agent design

Per PRD Section 24.2 (Phase 2 milestones), the V3 dashboard must deliver:

| Module | PRD Reference | Complexity | Key UX Challenge |
|--------|---------------|------------|-------------------|
| Pipeline View | Sec 24.2 | High | Real-time WebSocket status across 5 SDLC phases |
| Kanban Board | Sec 24.2 | High | Dependency-aware task visualization with `depends_on` SVG overlays |
| Approval Center | Sec 24.2 | Medium | Inline code diffs with HITL decision capture |
| Living Spec Viewer | Sec 8.2 | High | Drift indicators, inline editing, git commit semantics |
| Agent Config Modal | Sec 10.1 | Medium | 7-section contract editor with all 20+ fields |
| Trace Viewer | Sec 5.6 | Very High | Timeline-based agent reasoning traces with LLM call inspection |
| Cost Dashboard | Sec 19.4 | Medium | Three-tier cost aggregation (monthly/phase/agent) |
| Integrations Manager | Sec 18 | Medium | MCP server status, channel health, provider routing |

### 2.3 Design language continuity: the UI Refresh rule

The UX agents must never deviate from the AgentForge design language established in V2 unless the V3 PRD explicitly calls for a "UI Refresh." The design system — encoded in Figma guidelines, component specifications, and Markdown interaction principles — is treated as a machine-readable artifact that all agents must consume and respect. This is enforced through the Review Agent's design-system compliance checks and the Figma MCP's token extraction capabilities.

---

## 3. The Five-Agent UX Squad

The architecture deploys five agents with distinct responsibilities, each operating under a formal agent contract per PRD Section 10.1. The agent count was determined by two factors: the need for clean separation of concerns (research output is qualitatively different from implementation specs, and testing requires self-healing capabilities distinct from code review), and the empirical evidence that specialized agents dramatically outperform generalists — Kombai's domain-specific frontend agent achieves 72% code-review pass rates versus 39–50% for general-purpose models on identical benchmarks.

### 3.1 Research Agent — Intent mapping and requirement discovery

| Contract Field | Value |
|----------------|-------|
| Agent ID | `ux_research` |
| Role | UX Research and Intent Mapping |
| Provider | `claude-opus-4-6` (complex reasoning required) |
| Execution mode | request/response |
| Permissions | READ: `spec/*`, `.agentforge/learnings/*`, design files — WRITE: `.agentforge/briefs/` |
| HITL policy | `notify_only` (research output reviewed at planning stage) |
| Budget | $1.50 per task, $15 per phase |

The Research Agent performs upstream discovery before any design or code work begins. Its responsibilities span four domains:

- **PRD intent extraction**: Analyzes the V3 PRD to extract goal states, guardrails, and acceptable implementation paths for each dashboard module. Uses Intent Mapping to define what success looks like before work starts.
- **V2 pattern analysis**: Reads existing V2 design tokens, component specs, and Agent Learnings to ensure new modules adhere to the established look and feel. Interacts with the Living Spec to identify necessary data models and component dependencies.
- **Competitive analysis and design inspiration**: Searches for best-in-class implementations of similar UI patterns (trace viewers, Kanban boards, pipeline visualizations) and synthesizes findings into actionable references.
- **WCAG compliance research**: Identifies accessibility requirements specific to each module, particularly for complex visualizations like the Trace Viewer and Kanban dependency overlays. WCAG 2.1 Level AA is the baseline legal requirement in 2026.

**Output**: A typed JSON design brief per module containing: requirement IDs mapped to PRD sections, design constraints, reference patterns, design token specifications, accessibility requirements, and data model dependencies.

### 3.2 Planning Agent — Specification and component decomposition

| Contract Field | Value |
|----------------|-------|
| Agent ID | `ux_planning` |
| Role | UX Planning and Component Specification |
| Provider | `claude-sonnet-4-6` (structured output, high throughput) |
| Execution mode | request/response |
| Permissions | READ: `spec/*`, `briefs/*`, design files — WRITE: `spec/components/`, `.agentforge/plans/` |
| HITL policy | `review_and_override` (specs require human validation) |
| Budget | $1.00 per task, $10 per phase |

The Planning Agent translates research briefs into implementation-ready specifications. This agent was split from the Research Agent because research output (qualitative analysis, pattern discovery) is fundamentally different from planning output (structured component trees, responsive breakpoint rules, token bindings).

- **Component decomposition**: Breaks each dashboard module into a component tree with props interfaces, state requirements, and data dependencies, consistent with the Living Spec component format (PRD Section 5.2).
- **Figma MCP integration**: Uses `get_variable_defs` to extract exact token values (colors, spacing, typography) and `get_code_connect_map` to map Figma components to existing codebase file paths, preventing component duplication.
- **Responsive breakpoint rules**: Defines behavior across standard breakpoints (mobile, tablet, desktop) with specific attention to the Kanban board and Trace Viewer, which have the highest responsive complexity.
- **Implementation staging**: Sequences each module's implementation following the four-stage pattern: Layout (structure/wireframe) → Theme (design system tokens) → Animation (micro-interactions, WebSocket updates) → Implementation (semantic markup, accessibility).

**Output**: Structured implementation plans written to `spec/components/<module>.yaml`, with component tree, token bindings, responsive rules, and the four-stage implementation sequence for each module.

### 3.3 Implementation Agent — Production-ready code generation

| Contract Field | Value |
|----------------|-------|
| Agent ID | `ux_implementation` |
| Role | Frontend Code Generation |
| Provider | `claude-sonnet-4-6` (code generation, streaming) |
| Execution mode | streaming (progress visibility via channels) |
| Permissions | READ: `spec/*`, `plans/*`, design files — WRITE: `src/dashboard/`, feature branches |
| HITL policy | `review_and_override` (generated code reviewed via PR) |
| Budget | $2.00 per task, $25 per phase |

The Implementation Agent generates production-ready React 19 + Tailwind CSS + ShadCN/UI code. It is the highest-budget agent because code generation consumes the most tokens and requires the most iterations.

The agent follows the **four-stage implementation pattern** identified in both research sources as producing significantly better output than single-shot generation:

1. **Layout stage**: Generate the component structure as an ASCII wireframe, validating spatial arrangement before writing any JSX. This catches layout issues before they become expensive to fix.
2. **Theme stage**: Apply design system tokens from Figma MCP (`get_variable_defs`). Map every color, spacing value, and typography scale to a token reference, never a hardcoded value. Enforce the V2 design language.
3. **Animation stage**: Add micro-interactions and real-time update logic. For V3, this is critical — the Trace Viewer streams reasoning traces via WebSocket, the Kanban board animates task transitions, and the Pipeline View shows live status changes.
4. **Implementation stage**: Generate semantic HTML with proper ARIA attributes, keyboard navigation, and screen reader compatibility. Output production-ready TypeScript with full type safety.

The Implementation Agent connects to Figma MCP's `get_design_context` tool for semantic access to designs — not screenshots, but structured variables, layout constraints, and component properties. When Code Connect mappings exist, the agent reuses existing components rather than generating new ones.

### 3.4 Review Agent — Parallel quality evaluation

| Contract Field | Value |
|----------------|-------|
| Agent ID | `ux_review` |
| Role | Multi-Dimensional UX Review |
| Provider | `claude-sonnet-4-6` (vision capabilities for screenshot comparison) |
| Execution mode | request/response (parallel sub-evaluations) |
| Permissions | READ: `spec/*`, `src/dashboard/*`, design files, rendered UI — WRITE: `.agentforge/reviews/` |
| HITL policy | `notify_only` (review results fed to Implementation Agent automatically) |
| Budget | $1.50 per task, $15 per phase |

The Review Agent operates as the "Evaluator" in the Worker-Evaluator architecture, running **three parallel sub-evaluations** that execute simultaneously and merge into a prioritized issue list:

- **Accessibility audit**: Validates WCAG 2.1 Level AA compliance including color contrast ratios, semantic HTML structure, ARIA label completeness, keyboard navigation paths, and screen reader compatibility. Uses Playwright MCP's accessibility tree mode (2–5KB per page, no vision tokens required).
- **Design system compliance**: Validates token usage against Figma MCP's extracted variables, checks component adherence to the design system library, validates spacing rules, and ensures consistent agent branding (colored badges, icons) across views.
- **Visual fidelity check**: Uses Playwright MCP's vision mode to capture screenshots at each responsive breakpoint, then compares against Figma specifications using Claude's vision capabilities. Inspects computed CSS properties (flex-grow, rendered widths, z-index) to catch issues that screenshot comparison alone misses.

The parallel execution pattern follows Google ADK's ParallelAgent primitive: each sub-evaluator writes to unique state keys (preventing race conditions), then a synthesis step aggregates findings into a prioritized action list sorted by severity.

**Output**: A structured review report in `.agentforge/reviews/<task_id>.json` with issue severity (critical/major/minor), specific fix instructions, and requirement-ID traceability linking each issue to its PRD source.

### 3.5 Testing Agent — Self-healing validation

| Contract Field | Value |
|----------------|-------|
| Agent ID | `ux_testing` |
| Role | Automated UI Testing and Visual Regression |
| Provider | `claude-sonnet-4-6` (test generation and self-healing) |
| Execution mode | request/response |
| Permissions | READ: `spec/*`, `src/dashboard/*`, rendered UI — WRITE: `tests/dashboard/`, `.agentforge/test-results/` |
| HITL policy | `notify_only` (test results are informational) |
| Budget | $1.00 per task, $10 per phase |

The Testing Agent was separated from the Review Agent because the self-healing test pattern requires specialized capabilities that would overburden a review-focused agent. It follows Playwright's own three-stage test chain:

1. **Planner**: Explores the rendered dashboard via Playwright MCP, generating a test plan that covers user flows, edge cases, and responsive breakpoints.
2. **Generator**: Transforms the plan into Playwright test files with assertions for visual appearance, interaction behavior, accessibility, and real-time update correctness.
3. **Healer**: When tests fail, the agent automatically analyzes the failure using browser snapshots, identifies the root cause, and either fixes the test (if the implementation is correct but the test is stale) or feeds actionable fix instructions back to the Implementation Agent.

For token efficiency, the Testing Agent uses **Playwright CLI** (not MCP) for regression test suites — a 4x token reduction (27K vs. 114K tokens per task). Playwright MCP is reserved for exploratory testing and the initial feedback loop where rich introspection matters.

---

## 4. Orchestration Architecture

### 4.1 Pipeline topology

The five agents are orchestrated in a **hybrid sequential-parallel pipeline** that mirrors the natural dependencies in design engineering work. The main flow is sequential (you cannot implement what hasn't been planned), but the Review stage executes its three sub-evaluations in parallel, and the feedback loop creates iterative cycles.

> **Pipeline**: Research → Planning → Implementation → Review (parallel: accessibility + design compliance + visual fidelity) → Testing → Deploy. Feedback edges: Review → Implementation (fix issues), Testing → Review (re-evaluate after fixes).

Each agent publishes structured outputs via the event bus (PRD Section 7.1) that serve as typed inputs for downstream agents. This follows MetaGPT's SOP-driven structured handoff pattern, which significantly reduces hallucination at agent boundaries.

### 4.2 Event integration with V2 event bus

The UX agent pipeline introduces six new event types that extend the existing 34-event catalog:

| Event Type | Emitted By | Consumed By | Payload |
|------------|-----------|-------------|---------|
| `DesignBriefCompleted` | Research Agent | Planning Agent | `brief_id`, `module_id`, `requirement_ids[]` |
| `ComponentSpecReady` | Planning Agent | Implementation Agent | `spec_ref`, `component_tree`, `token_bindings` |
| `ImplementationDraftReady` | Implementation Agent | Review Agent, Testing Agent | `task_id`, `branch`, `component_paths[]` |
| `UXReviewCompleted` | Review Agent | Implementation Agent (if issues), Testing Agent | `review_id`, `issue_count`, `severity_summary` |
| `UXTestSuiteCompleted` | Testing Agent | Orchestrator | `test_run_id`, `pass_count`, `fail_count`, `healed_count` |
| `UXModuleDeployed` | Orchestrator | Observability Agents | `module_id`, `deployment_id`, `figma_context_ref` |

These events follow the established pattern: unique `event_id` (UUID), type discriminator, timestamp, and source. They are compatible with the bounded FIFO history buffer (default 1000 events) and support replay via `bus.history({ type, after })`.

### 4.3 Iterative refinement loop and convergence criteria

The quality-assurance loop runs as: **Implement → Render (Playwright) → Measure (computed CSS + accessibility tree) → Compare (against Figma specs via MCP) → Review (parallel agents) → Fix (Implementation Agent) → Re-render**. Each cycle is bounded:

- **Maximum iterations**: 5 per component (configurable in agent contract)
- **Early-exit condition**: Diff between implementation and specification falls below threshold (≤2% pixel deviation AND zero critical accessibility violations AND zero design-token mismatches)
- **Graceful escalation**: If 5 iterations exhaust without convergence, the system flags the conflict to the human supervisor via HITL channels with a diagnostic summary and suggests a UX compromise
- **Cost cap**: Per-task budget limits (PRD Section 5.1) enforce automatic termination before runaway loops consume excessive tokens

### 4.4 Dynamic Agent Pooling and resource management

The recursive development process consumes significant computational resources. To manage costs and prevent runaway loops:

- **Dynamic Agent Pooling**: Only activate agents needed at a given time. The Research and Planning agents are idle during Implementation-Review-Testing cycles. The Testing Agent is only spawned after Implementation produces output.
- **Task caching**: Reuse successful prompt patterns to reduce redundant LLM calls. If the Implementation Agent successfully generated a similar component in a previous task, its Agent Learnings file includes the patterns that worked.
- **Token optimization**: Use Playwright CLI (27K tokens/task) instead of MCP (114K tokens/task) for regression testing. Use Figma MCP's `get_metadata` for sparse overview before selective `get_design_context` on individual sub-nodes.

### 4.5 Capacity estimation for UX agent squad

| Agent | Est. RPM | Est. TPM | Budget/Module | Notes |
|-------|----------|----------|---------------|-------|
| Research | 2–4 | 15K–25K | $3–$5 | One-time per module; heaviest on initial analysis |
| Planning | 3–6 | 20K–40K | $4–$8 | Figma MCP calls add latency but reduce follow-up costs |
| Implementation | 8–15 | 60K–120K | $12–$20 | Highest budget; 4-stage pattern + iteration cycles |
| Review (3 parallel) | 6–12 | 30K–60K | $6–$10 | Parallel execution reduces wall-clock time by ~60% |
| Testing | 4–8 | 20K–40K | $4–$8 | CLI mode for regression cuts tokens by 4x |

**Estimated total per V3 module**: $29–$51, well within the PRD's per-phase budget of $25 (which may need upward adjustment for UX-heavy phases). Recommended override: set `per_phase_max_usd` to $60 for the UX squad.

---

## 5. MCP Integration Stack

The UX agent architecture requires three primary MCP servers and two auxiliary tools, all accessed through AgentForge's MCP adapter layer (PRD Section 18) which provides authentication, rate limiting, error recovery, caching, and observability hooks.

### 5.1 Figma MCP Server — The design source of truth

Figma's MCP server became generally available at Schema 2025 and received a major upgrade in February–March 2026 with the Code-to-Canvas bidirectional sync capability. It exposes 12 tools via two connection methods.

| Connection | URL | Plan Requirement | Rate Limits |
|-----------|-----|-----------------|-------------|
| Remote server | `https://mcp.figma.com/mcp` | All plans (free included) | 6/mo (Starter), 200/day (Pro), 600/day (Enterprise) |
| Desktop server | `http://127.0.0.1:3845/mcp` | Dev or Full seat on paid plan | Same as remote |

**Critical tools used by UX agents:**

- **`get_design_context`**: Returns structured React + Tailwind code representation of Figma frames including component hierarchies, Auto Layout data, variables, and styles. Used by Planning and Implementation Agents. Warning: single calls on complex frames can produce 351K+ tokens.
- **`get_variable_defs`**: Extracts color, spacing, and typography tokens with actual code syntax. Used by Planning Agent for token binding and Review Agent for compliance validation.
- **`get_code_connect_map`**: Maps Figma components to codebase file paths. Critical for preventing component duplication — without these mappings, the Implementation Agent will create new components instead of reusing existing ones.
- **`get_metadata`**: Provides sparse XML overview of large files. Used as the mandatory first call before `get_design_context` to manage context window overflow.
- **`get_screenshot`**: Returns visual reference of Figma frames. Used by Review Agent for visual fidelity comparison.
- **`generate_figma_design` (Code-to-Canvas)**: Captures live UI and converts to editable Figma layers. Enables the feedback loop where developers build, designers iterate on actual implementation.

> **Rate limit mitigation**: AgentForge's MCP adapter layer caches Figma responses aggressively. Token data and component maps change infrequently and can be cached for hours. Design context for unchanged frames is cached for minutes. The adapter tracks call counts against plan limits and pauses agent work before hitting limits.

### 5.2 Community Figma MCP servers (auxiliary)

The official Figma MCP server is read-focused for design data. Two community servers fill critical gaps:

- **Framelink (GLips/Figma-Context-MCP)**: Optimizes Figma API responses to minimize context window usage. Recommended for all `get_design_context` calls when token efficiency matters more than having the absolute latest Figma features.
- **TalkToFigma (grab/cursor-talk-to-figma-mcp)**: Provides full bidirectional read/write via a WebSocket bridge — creating shapes, updating text, adjusting layouts programmatically. Required for the Designer sub-flow where the Research Agent's findings need to be materialized as Figma prototypes.

### 5.3 Playwright MCP Server — Visual feedback and browser automation

Microsoft's Playwright MCP server (27K+ GitHub stars) is the standard mechanism for giving AI agents browser access. GitHub Copilot's Coding Agent ships with it built-in by default as of July 2025.

| Mode | Output | Token Cost | Use Case |
|------|--------|-----------|----------|
| Snapshot (default) | Accessibility tree (structured text) | 2–5KB/page | Iterative feedback loop, accessibility audits |
| Vision (`--caps=vision`) | Screenshots (base64 images) | 100KB+/page | Visual fidelity checks, milestone screenshots |

The server exposes 25 tools covering navigation, interaction (click, type, scroll, drag), screenshot capture, JavaScript evaluation, console monitoring, and network request inspection.

**Dual-mode strategy for AgentForge:**

- **Playwright MCP** for the iterative design-implementation loop: rich DOM introspection, computed CSS measurement, accessibility tree analysis. Used during the Implement → Review → Fix cycle where each iteration needs detailed feedback.
- **Playwright CLI (`@playwright/cli`)** for automated regression testing: 4x token reduction (27K vs. 114K per task). Snapshots saved to disk files rather than injected into LLM context. Used by the Testing Agent for suite execution.

### 5.4 GitHub MCP Server — Code management and CI integration

Handles PR creation, issue tracking, code commit workflows, and CI pipeline monitoring. Integrates with AgentForge's existing GitHub Actions sandbox (PRD Section 15). The Implementation Agent pushes to feature branches, the Build Agent monitors CI, and successful builds trigger PR creation with Figma context links and spec references.

---

## 6. The Closed-Loop Feedback Architecture

The defining characteristic of this architecture is the closed feedback loop between design intent and implementation reality. No single tool provides this; it emerges from the combination of Figma MCP (what the design should be), the Implementation Agent (what the code produces), and Playwright MCP (what the browser actually renders).

### 6.1 Design-to-code parity loop

For each dashboard component, the loop executes as follows:

1. **Figma MCP extracts design intent**: `get_design_context` returns the component's structure, tokens, and layout constraints as structured data.
2. **Implementation Agent generates code**: Following the 4-stage pattern, producing React + Tailwind + ShadCN/UI components.
3. **Playwright MCP renders and measures**: The component is rendered in a headless browser. Playwright's snapshot mode returns the accessibility tree; vision mode captures screenshots at each breakpoint.
4. **Review Agent compares**: The rendered output is compared against the Figma specification on three dimensions — accessibility, design tokens, and visual fidelity.
5. **Delta triggers fix or approve**: If discrepancies exceed thresholds, the Implementation Agent receives structured fix instructions. If within tolerance, the component moves to Testing.

### 6.2 Code-to-design feedback (bidirectional)

The March 2026 Code-to-Canvas feature enables the reverse flow. When the dashboard's functional logic changes (e.g., a new API field is added to the AgentForge backend), the framework pushes the rendered UI back to Figma as editable layers via `generate_figma_design`. This allows designers to iterate on the actual implementation rather than outdated mockups, maintaining Figma as a living design surface.

### 6.3 Production feedback-to-design loop

Once deployed, Observability Agents (PRD Section 11.5) monitor the dashboard's performance and user behavior. If a production issue is detected — such as performance degradation in the Kanban board when rendering 50+ tasks — the observability layer emits a feedback event that triggers the Research Agent for the affected module. This creates a continuous improvement cycle where the dashboard evolves based on real-world usage data.

---

## 7. Design System Enforcement for V3 Extensibility

The architecture treats the design system as a **first-class data source**, not an afterthought. This is the foundation that makes V3 dashboard extensibility possible without pipeline restructuring.

### 7.1 Machine-readable design system artifacts

- **`design-system-rules.md`**: Generated using Figma MCP's `create_design_system_rules` tool. Documents token definitions, component libraries, style hierarchies, and naming conventions in LLM-optimized format.
- **Component usage guidelines**: Markdown files specifying when to use each component, accessibility requirements, token mappings, and validation rules. Stored alongside the Living Spec.
- **Bidirectional Design Token Sync**: Figma variables for colors, spacing, and typography remain synchronized with the dashboard's CSS configuration. Changes in either direction propagate automatically, preventing design debt.

### 7.2 Requirement-ID traceability

Every UI component generated by the Implementation Agent must be tagged with its corresponding requirement ID from the PRD. This creates a bidirectional link between documentation and implementation, facilitating audits and regression testing. The Review Agent validates these tags, ensuring no unauthorized features or scope creep are introduced by autonomous agents. This is a critical governance control for the recursive self-building model.

---

## 8. Quality Controls and Governance Constraints

### 8.1 WCAG 2.1 Level AA compliance

WCAG compliance is a baseline legal requirement in 2026, not optional. The Review Agent's accessibility sub-evaluator validates: color contrast ratios (4.5:1 for normal text, 3:1 for large text), focus indicators on all interactive elements, keyboard navigation completeness, ARIA labels on dynamic content (particularly critical for the Trace Viewer's streaming updates), and proper heading hierarchy across all dashboard views.

### 8.2 Technical feasibility feedback

If a design requirement is technically unfeasible for the current framework, the architecture implements **Graceful Escalation**: the Research or Planning Agent flags the conflict, suggests a UX compromise, and notifies the human supervisor via HITL channels. Examples: if real-time streaming of high-frequency agent logs causes excessive browser latency, the agents might suggest a throttle pattern or paginated view. The human always makes the final call.

### 8.3 Agent decoherence prevention

The hybrid Supervisor + Worker-Evaluator orchestration pattern mitigates "Agent Decoherence" — where isolated agents diverge in their understanding of global state. Prevention mechanisms include: the Living Spec serves as shared ground truth readable by all agents, the event bus provides full audit trail of every agent action, the Review Agent's synthesis step catches inconsistencies before they propagate, and Agent Learnings accumulate team-specific patterns (e.g., preferred component naming, custom hooks) that maintain stylistic coherence.

---

## 9. Implementation Roadmap

The roadmap follows a phased approach that builds agent capability incrementally while delivering dashboard functionality at each stage.

### 9.1 Phase 1: Foundation (Weeks 1–2)

- Establish Figma V2/V3 workspaces and initialize bidirectional design token sync
- Register the five UX agent contracts in `agentforge/agents.yaml` with all 7 sections
- Configure MCP adapter layer for Figma (remote + Framelink), Playwright, and GitHub servers
- Generate `design-system-rules.md` from existing V2 Figma file
- Implement the six new event types in the event bus catalog
- Set up per-phase budget overrides ($60 for UX phases)

### 9.2 Phase 2: Core modules (Weeks 3–6)

- Build Approval Center and Pipeline View first (highest HITL impact, moderate complexity)
- Execute full Research → Planning → Implementation → Review → Testing pipeline for each module
- Validate the iterative refinement loop converges within 5 iterations per component
- Establish visual regression baseline screenshots for all completed modules

### 9.3 Phase 3: Complex modules (Weeks 7–10)

- Build Trace Viewer (highest complexity: streaming WebSocket data, timeline visualization, LLM call inspection)
- Build dependency-aware Kanban Board (SVG overlay rendering, drag-and-drop, real-time status updates)
- Build Living Spec Viewer (drift indicators, inline editing, git commit semantics)
- Add Agent Configuration Modal (7-section contract editor with validation)

### 9.4 Phase 4: Polish and observability (Weeks 11–12)

- Build Cost Dashboard and Integrations Manager (moderate complexity, data-heavy)
- Enable production feedback-to-design loop via Observability Agents
- Conduct full WCAG audit across all modules using Review Agent's accessibility sub-evaluator
- Performance testing: validate Kanban with 50+ tasks, Trace Viewer with 1000+ events, Pipeline View with concurrent agent execution
- Document all Agent Learnings accumulated during the build for future UX module development

---

## 10. Extended Tool Ecosystem

Beyond the three primary MCP servers, several tools fill critical gaps in the end-to-end UX pipeline:

### 10.1 Browser automation alternatives

- **Stagehand (Browserbase)**: Offers three atomic primitives (`act`, `extract`, `observe`) with 44% speed improvement in v3 and native CDP integration. Useful for complex interaction testing beyond Playwright's snapshot mode.
- **Vercel agent-browser**: Achieves 93% context savings vs. Playwright MCP through a "Snapshot + Refs" workflow. Uniquely supports real Mobile Safari in iOS Simulator for authentic mobile viewport testing.

### 10.2 Design-to-code reference implementations

These tools inform the Implementation Agent's patterns but are not direct dependencies:

- **v0 (Vercel)**: React + TypeScript + Tailwind + ShadCN generation from text or screenshots. Validates our framework-opinionated stack choice.
- **bolt.new (StackBlitz)**: Full Node.js in-browser via WebContainers. Reference for real-time preview patterns.
- **Screenshot-to-Code (53K+ GitHub stars)**: Open-source reference for vision-based code generation pipelines.

---

## 11. Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Code-review pass rate | ≥70% (matching Kombai benchmark) | PRs approved without changes / total PRs |
| Design-to-code parity | ≤2% pixel deviation at all breakpoints | Playwright screenshot diff against Figma spec |
| WCAG compliance | Zero critical violations | Review Agent accessibility sub-evaluator |
| Iteration convergence | ≤5 cycles per component | Event bus `ImplementationDraftReady` count per task |
| Token efficiency | <50K tokens/component average | Cost governance aggregation per task |
| E2E module delivery | <$51 per module | Per-phase cost tracking |
| Test self-healing rate | ≥60% of failing tests auto-repaired | Testing Agent `healed_count` / `fail_count` |

---

## 12. Conclusion

This blueprint represents the convergence of two independent research efforts into a single actionable specification. The five-agent architecture with three MCP integrations is not theoretical — it is built on production benchmarks (72% pass rates for specialized agents), proven orchestration patterns (MetaGPT, CrewAI, Google ADK), and the actual technical capabilities of tools available in March 2026.

The recursive self-building approach — AgentForge building its own dashboard through its own agentic framework — serves as both the most efficient path to V3 delivery and the most compelling proof-of-concept for the platform's capabilities. Every component built, every iteration cycle completed, and every design-code parity check passed generates Agent Learnings that make the entire framework more capable for every future user.

The V2 foundation is certified ready (710 tests, 0 failures, 13/13 V3-required events verified). The MCP ecosystem has matured to support bidirectional design-code workflows. The research evidence overwhelmingly supports agent specialization. The path forward is clear: register the five agent contracts, connect the three MCP servers, and let the framework build itself.

---

*— End of Blueprint —*
*AgentForge UX Agent Architecture Blueprint v1.0*
