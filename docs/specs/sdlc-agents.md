# SDLC Agents, Spec Sync, and Onboarding

> Part of the [AgentForge PRD](./PRD.md). Covers spec sync lifecycle, application
> onboarding, agent taxonomy, agent contracts, and all five SDLC phase details
> (design, spec, code gen, CI/CD, observability, research).

**8. Context Resolution and Spec Sync**

The spec is the intent. Code is the implementation. When they diverge after human approval, code wins and the spec auto-syncs.

**8.1 Resolution Lifecycle**

1\. Spec is the source of truth during planning and task assignment. 2. Agent generates code from the spec. Code may deviate. 3. Human reviews the PR. If approved, the deviation is intentional. 4. Post-merge: a lightweight spec sync agent diffs the spec against merged code and updates the spec to match reality. 5. Spec is truth again for the next task.

**8.2 Drift Detection**

The spec sync agent flags significant deviations to the human rather than silently updating. New endpoints, changed data models, and removed fields require explicit human acknowledgment. Minor additions are auto-synced with a commit noting the change. The SpecDriftDetected event is emitted and consumed by the V3 dashboard Spec Panel for drift indicators and sync status display.

> *Updated per ADR-017: Spec sync uses structural comparison for drift detection.*

**8.3 Conflict Rule**

**Human always wins.** If a human edits the spec while an agent is also writing to it, the agent discards its changes and re-reads the human's version. File locking during agent writes prevents concurrent corruption, but human edits detected mid-agent-write take priority unconditionally. Human edit detection uses content hashing at the lock-manager level: the lock stores a SHA-256 hash of the file at acquisition time, and agents call checkHumanEdit() before committing writes.

> *Updated per ADR-006: Human edit detection uses content hashing in the lock manager, with git operations handled at the orchestration layer.*

**9. Application Onboarding**

Phase 1 supports greenfield onboarding only. Brownfield onboarding (existing applications) is deferred to Phase 3.

**9.1 Greenfield Onboarding**

Trigger: Developer runs agentforge init. The CLI wizard has a quick-start mode with opinionated defaults (5 questions, under 3 minutes) and an advanced mode for full customization.

> \$ agentforge init
>
> Welcome to AgentForge!
>
> Project name: TaskFlow
>
> Description: A project management tool for small teams
>
> GitHub org/repo: praveen/taskflow
>
> Primary HITL channel: Slack (#agentforge)
>
> Secondary channel: Telegram
>
> Using defaults: React + Node.js + PostgreSQL + Tailwind
>
> HITL: review_and_override (design/deploy: full_approval)
>
> Budget: \$2/task, \$25/phase, \$200/month
>
> Scaffolding project\... done
>
> AgentForge is ready. Run: agentforge start design
>
> *Updated per ADR-005: Init records channel preferences but does not establish live connections. Connection happens at runtime.*
>
> *Updated per ADR-019: The interactive wizard requires a TTY. A \--non-interactive flag for CI/automated environments is deferred to Phase 2.*

**9.2 Onboarding Steps**

-   Project scaffold: The orchestrator creates the project structure with Nx mono-repo, CI/CD config, design system seed, environment configs, and agentforge.yaml manifest.

-   Design workspace provisioning: The design orchestrator initializes the agentforge/designs/ directory for DesignSpec JSON outputs. The browser-rendered prototype is the primary design surface (see `vision.md` Layer 7). If Penpot is configured, an optional collaboration workspace is also created for human designers.

-   Agent registration: Each SDLC phase gets its agents registered in agentforge/agents.yaml with all 7 sections defined in Section 10.1.

-   Ready state: The framework enters design-loop state. Developer is notified via configured channels that agents are ready.

> *Updated per ADR-011: Agent contracts are stored in agentforge/agents.yaml, not embedded in agentforge.yaml.*

**9.3 Post-Init: AgentForge as Persistent Tooling**

> agentforge start \<phase\> \# begin a phase
>
> agentforge design \"desc\" \# describe a page in natural language
>
> agentforge status \# view all tasks and agent states
>
> agentforge approve \<task\> \# approve from CLI
>
> agentforge abort \<task\> \# stop agent, preserve branch
>
> agentforge abort \--all \# emergency stop everything
>
> agentforge migrate \# upgrade schema versions
>
> agentforge config \# view/edit configuration

**9.4 Brownfield Onboarding (Phase 3)**

Deferred to Phase 3. When implemented, it will start with a narrow claim: the analysis agent scans the repository and generates a starter spec that the developer will need to heavily edit.

**10. Agent Taxonomy**

AgentForge uses a four-stage sequential spine with specialist tools invoked by each stage (see `vision.md` Layer 3 — locked decision). Every agent has a defined role, permissions, input/output contract, and HITL policy.

**Spine stages (sequential, single writer per stage):**

  -------------------------------------------------------------------------------------------------
  **Stage**        **Role**                                                  **Default HITL**   **LLM Fit**
  ---------------- --------------------------------------------------------- ------------------ ----------------------------
  Clarifier        Reads input, runs clarification pipeline, emits enriched  Approval gate      `claude-opus-4-6` (reasoning)
                   requirement + assumption ledger

  Architect        Produces architecture spec, ADRs, task plan, screen       Review gate        `claude-opus-4-6` (reasoning)
                   designs (via Design specialist)

  Implementer      Single-threaded tool-loop; writes all code for a task     PR approval        `claude-sonnet-4-6` (balanced)
                   in sequence. Cross-task parallelism via git worktrees.

  Reviewer         Fresh-context diff review with deterministic gates        Merge gate         `claude-sonnet-4-6` (balanced)
                   first, LLM review second
  -------------------------------------------------------------------------------------------------

**Specialist tools (invoked by spine stages, not independent agents):**

  -----------------------------------------------------------------------------------------------------------
  **Specialist**            **Invoked by**              **Capability**                        **LLM Fit**
  ------------------------- --------------------------- ------------------------------------- -------------------------
  Design pipeline           Architect, Implementer      UX research, layout planning,         `claude-opus-4-6` (vision)
                                                        DesignSpec generation, evaluation

  Test generator            Implementer                 Emits failing tests before             `claude-sonnet-4-6` (pattern)
                                                        implementation

  Security scanner          Reviewer                    Semgrep/CodeQL + LLM triage            `claude-haiku-4-5` (speed)

  Research subagents        All stages                  Read-only codebase/docs exploration    `claude-haiku-4-5` (cost)

  Visual validator          Reviewer                    Playwright for UI verification         N/A (browser tool)

  Build/Deploy agents       Implementer (post-merge)    CI/CD monitoring, deploy, rollback     `claude-haiku-4-5` (speed)

  Documentation generator   Implementer                 API docs, user guides                  `claude-sonnet-4-6` (balanced)

  Observability agents      Post-deploy (Phase 5)       Metrics, drift detection, cost         `claude-haiku-4-5` (cost)
  -----------------------------------------------------------------------------------------------------------

  > *Previous taxonomy (five categories with 20+ peer agents) is superseded. See `vision.md` Layer 3 for rationale.*

**10.1 Agent Contract Definition**

Every agent is defined by a 7-section YAML contract specifying what the agent can do, cannot do, and how it coordinates with humans and other agents. Agent contracts are stored in agentforge/agents.yaml.

**The 7 sections:** role, provider, execution, tools, permissions, hitl_policy, budget.

> *Updated per ADR-011: Agent contracts stored separately from project manifest.*
>
> *Updated per ADR-013: Context injection (spec sections, learnings, ADRs, conventions) is determined at runtime, not stored as static fields in the agent contract.*
>
> *Updated per ADR-010: 7-section agent contract structure formally defined.*

Runtime status is computed from task states: idle, executing, blocked, waiting_ci, or error. The GET /api/agents endpoint returns all agent contracts with computed runtime status.

> **Agent contract schema:** See agentforge/agents.yaml for all registered agent contracts.

**11. SDLC Phase Details**

**11.1 Phase 1: Design Agents**

The design phase operates as a multi-agent pipeline that produces a DesignSpec JSON — a flexbox-based layout tree that serves as the single source of truth for both visual rendering and code generation.

**11.1.1 Design Pipeline**

-   User requests a page via natural language (CLI or messaging channel).

-   Research Agent: Analyzes the request against the spec, identifies data models, interaction patterns, and component library matches.

-   Planning Agent: Produces a component tree with layout rules (flexbox), design token bindings, responsive breakpoints, and component-to-library mappings. The Planning Agent's prompt includes **screenshot examples of well-structured reference UIs** that teach compositional patterns — how badges sit inside wrapper cells rather than spanning column widths, how popovers overlay content rather than flowing inline, how two-column layouts allocate fixed vs flexible widths. These examples guide structural decisions; the Planning Agent decides WHAT the layout should be.

-   Design Agent: Generates DesignSpec JSON — a flat node tree where each node specifies type, layout (dir, gap, align, justify, padding), typography, colors (via design tokens), and parent/child relationships. Catalog components (button-primary, badge-warning) are referenced by name and constrained by injecting valid catalog entries into the prompt — hallucinated references are silently fuzzy-matched to the nearest valid component, never rejected. The Design Agent's prompt includes **JSON syntax examples** that teach correct DesignSpec patterns — how to express flex rows with `justify: "space-between"`, how to reference design tokens by name (not hex), how to use `width: "fill"` for flexible containers. These examples guide translation accuracy; the Design Agent decides HOW to express the plan as JSON. The spec streams progressively, enabling real-time preview as nodes are generated.

-   Browser Renderer: Converts DesignSpec JSON to real shadcn/ui components via a Vite+React app, renders via Playwright (headless Chromium), produces pixel-perfect screenshot. The browser renders flexbox with 100% fidelity because the browser IS the flexbox standard.

-   Design Correction Pipeline: After browser render, the correction pipeline detects and fixes layout issues through DOM extraction, mechanical auto-fixes, interactive user feedback, and vision model assistance. See Section 11.1.2 for the full correction architecture.

-   User approves final screenshot via configured HITL channel (Slack/Telegram/CLI/Dashboard).

-   On approval: DesignPhaseComplete event emitted, DesignSpec JSON committed to agentforge/designs/\<screen\>.json.

> **Screen Types & Shared Chrome (completed):** The design pipeline now supports `screen_type` (page, modal, drawer, sheet) per screen, shared chrome artifacts (TopBar, NavigationTabs, Sidebar) generated once via a Chrome Pass and applied to all screens, and LayoutShell for splitting persistent chrome from per-screen content. See `docs/feature-plans/screen-types-plan-b.md` for implementation details.

**11.1.2 Design Correction Architecture**

The design correction pipeline operates after browser rendering and is implemented in three integration phases. Each phase is additive — later phases build on earlier phases without removing them.

**Phase A: Standalone Correction (after browser render, no changes to existing pipeline)**

After the browser renderer produces a screenshot, the correction pipeline runs independently:

1. DOM Extraction: Playwright extracts computed layout for every rendered element via `getBoundingClientRect()` and `getComputedStyle()`. Every element carries a `data-node` attribute mapping directly to a DesignSpec JSON node ID, enabling precise issue-to-node mapping with zero ambiguity.

2. Mechanical Auto-Fixes: Universal layout rules are checked against computed DOM data (not JSON data — CSS rendering behaviors are only visible after the browser computes layout). Zero LLM cost. Checks include: sibling bounding rects overlapping, child extending beyond parent boundary, node with content rendering at zero height/width, text content wider than element (`scrollWidth > clientWidth`), and badge/chip component computed width exceeding 2.5× its text content width. Detected issues produce structured `{nodeId, issue, suggestedFix}` tuples with exact node IDs. Fixes that are deterministic (reduce child width to fit parent, remove explicit width from oversized badge) are applied directly to the DesignSpec JSON. The patched JSON is re-rendered and scored — patches are only accepted if the issue count decreased (monotonic improvement guard).

3. Interactive User Preview: The browser render is served as an interactive preview where users can hover over elements to see highlight borders and node metadata (node ID, computed dimensions, component type). Users click elements to tag specific issues with natural language feedback (e.g., "this badge should be compact" or "this section needs more spacing"). This produces structured feedback: `[{nodeId: "budget-status-badge", feedback: "badge should be compact pill, not stretched"}]`.

4. Vision-Assisted Correction: User-tagged issues plus the browser screenshot plus DOM extraction data plus the DesignSpec JSON are sent together to a vision LLM. The screenshot provides spatial context (the vision model SEES how elements relate visually), the DOM data provides computed dimensions (precise numbers, not guesses), and the user tags provide intent (exactly what is wrong and why). The vision model returns JSON patches with exact node IDs and field-level fixes. Patches are applied, re-rendered, and presented to the user for approval or further tagging. Maximum 3 correction iterations, with monotonic improvement guard — each iteration must score higher than the previous best or is rejected.

**Why combined context outperforms any single signal:**

-   Screenshot alone: Vision model sees the issue but guesses which node ID to fix.
-   DOM data alone: Precise numbers but cannot detect aesthetic or compositional problems.
-   User tags alone: Exact node and intent but the LLM must imagine the visual context to produce a good fix.
-   All three together: Vision model sees the spatial relationships, DOM data gives exact measurements, user tags provide intent. The fix is precise, contextual, and aligned with what the user wants.

**Cost per correction cycle:** ~$0.06 per iteration (screenshot ~1,500 tokens + DOM layout ~3,000 tokens + DesignSpec JSON ~8,000 tokens + response ~1,500 tokens). Maximum $0.18 for 3 iterations per screen.

**Phase B: Integration with existing pipeline (keep self-correction)**

Phase B connects the standalone correction pipeline to the existing design workflow:

-   The existing Penpot self-evaluation loop (which improves DesignSpec JSON from ~32/100 to ~65/100) continues to run. It patches the JSON for structural issues it can detect.
-   After the Penpot loop produces its corrected JSON, the browser renderer takes over: renders with real shadcn components, runs DOM extraction, applies mechanical fixes, and presents the interactive preview for user feedback.
-   The pipeline becomes: LLM → JSON → Penpot self-correction (3 attempts) → corrected JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval.
-   Both correction stages operate on the same DesignSpec JSON — the Penpot loop improves it first, then the browser-based pipeline improves it further.

**Phase C: Remove self-correction, browser-only pipeline**

Once the browser-based correction pipeline is proven to match or exceed the Penpot self-correction quality:

-   The Penpot self-evaluation loop is removed from the critical path. Penpot remains available as an optional collaboration surface for human designers.
-   The pipeline simplifies to: LLM → JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval.
-   Expected quality improvement: the browser renders with 100% CSS fidelity (vs Penpot's ~60% fidelity), so the vision model evaluates real layout rather than Penpot approximations. Combined with better initial generation (few-shot examples for Planning and Design agents), the first-pass quality target is ~70/100 with corrections reaching ~85-90/100.

> **Implementation details:** See docs/design-correction-architecture.md for DOM extraction protocol, mechanical check implementations, interactive preview component specification, and vision model prompt templates.

**11.1.3 Design-to-Code Contract**

The DesignSpec JSON is the contract between design and code generation. The code generation agent reads the approved JSON directly to produce React components — it never reads from a design tool. This eliminates translation gaps between design approval and code output.

-   Layout nodes (container, section, header) → React \<div\> with Tailwind flex classes
-   Text nodes → React \<span\> with typography classes from design tokens
-   Catalog components (button-primary, badge-warning) → imported from the project's component library
-   Interactions → React event handlers (onClick, onHover)
-   Data bindings → React hooks and props

> **DesignSpec v2 (current):** The renderer uses a v2 schema that separates structure (WHAT — JSON node tree with layout, typography, color references) from rendering (HOW — CSS generation, token resolution, shadow/typography computation). See `packages/designspec-renderer/src/types/design-spec-v2.ts` for the authoritative schema.

**Interoperability:** DesignSpec can be exported to json-render format (Vercel's Generative UI framework) for teams that want to use json-render's multi-framework renderers (React, Vue, Svelte, React Native) or progressive streaming infrastructure. The export maps DesignSpec layout nodes to json-render element types and catalog references to json-render component entries. This is a one-way export — AgentForge's design pipeline generates DesignSpec natively; json-render is a downstream consumer option.

**11.1.4 Design Tool Integration (Optional)**

Penpot serve as optional collaboration surfaces where human designers can visually tweak approved designs. Changes sync back to DesignSpec JSON via a bidirectional adapter. Design tools are NOT in the verification path — the browser renderer is the source of truth for layout fidelity.

AgentForge defines a DesignToolAdapter interface: createWorkspace(), readDesign(), writeDesign(), getTokens(), onUserEdit(). Penpot is the primary adapter (CSS-native, free webhooks, W3C DTCG token support, MCP Server Support). Figma support removed.

> *Updated per ADR-015: Storybook adapter is Phase 2.*

**11.2 Phase 2: Specification and Planning Agents**

AgentForge adopts spec-driven development (SDD) as its core paradigm. The spec agent consumes finalized design output and produces: component specs, API specs (OpenAPI 3.1), data model specs, task decomposition, and Architecture Decision Records (ADRs). The estimation agent provides effort estimates based on complexity and historical data.

**11.3 Phase 3: Code Generation Agents**

**11.3.1 Multi-Agent Coding Architecture**

  --------------------------------------------------------------------------------------------------------------------
  **Agent**        **Responsibility**                                            **Output**
  ---------------- ------------------------------------------------------------- -------------------------------------
  Frontend coder   Generates UI components from DesignSpec JSON + design tokens   React components with TypeScript

  Backend coder    Generates API endpoints, business logic, data access layers   Node.js services, Prisma migrations

  Test writer      Generates unit, integration, and e2e tests from specs         Jest, Playwright test suites

  PR reviewer      Reviews generated code for quality, security, architecture    Review comments, requested changes

  Refactorer       Improves existing code without changing behavior              Refactored files with passing tests
  --------------------------------------------------------------------------------------------------------------------

**11.3.2 LLM Provider Routing**

  --------------------------------------------------------------------------------------------------
  **Task Type**               **Recommended Provider**                     **Rationale**
  --------------------------- -------------------------------------------- -------------------------
  Complex architecture        `claude-opus-4-6` or equivalent tier         Highest reasoning capability

  Standard component gen      `claude-sonnet-4-6` or equivalent tier       Good quality, lower cost

  Test generation             `claude-sonnet-4-6` or equivalent tier       High volume, pattern-based

  Code review                 `claude-haiku-4-5` or equivalent tier        Fast, cost-effective

  Boilerplate / scaffolding   Local model (Llama/Mistral)                  Zero API cost
  --------------------------------------------------------------------------------------------------

  > Model IDs reflect the latest Claude family. See `CLAUDE.md` for the canonical model ID list. Provider routing is configurable per-agent via the agent contract's `provider` section.

**11.3.3 Code Generation Workflow**

-   Orchestrator distributes decomposed tasks to coding agents based on task type.

-   Each agent receives: relevant spec section, DesignSpec JSON for the target screen (from agentforge/designs/), existing code context, architectural constraints, and agent learnings.

-   Agent generates code in a feature branch following project coding standards.

-   Code is pushed to GitHub. GitHub Actions sandbox runs build and tests.

-   If CI passes, PR is created. CIResult and PRCreated events are emitted.

-   PR reviewer agent performs initial review for quality, security, and architecture compliance.

-   Based on HITL config, PR either requires human approval, auto-merges with notification, or auto-merges silently. PRMerged event emitted on merge.

**11.3.4 Concurrency Model**

The Implementer is single-threaded within a task: it writes frontend, backend, tests, and migrations in sequence, not in parallel. This is a locked decision (see `vision.md` Layer 8). Within-task parallelism of frontend+backend+tests coders is a rejected pattern — it creates write-coupling conflicts and context fragmentation.

Cross-task parallelism is supported via git worktrees: independent tasks can execute concurrently in separate worktrees, each with its own single-threaded Implementer instance. The orchestrator schedules up to N concurrent tasks (configurable via max_concurrent_tasks, default 3). When a task is blocked waiting for CI results, the slot does not open; the next independent task is assigned to a new worktree up to the concurrency limit.

> *Updated per ADR-007: CI-waiting tasks do not release slots.*
> *Updated per vision Layer 8: Single-threaded implementer within a task. Cross-task parallelism via worktrees.*

**11.4 Phase 4: CI/CD Agents**

AgentForge does not replace existing CI/CD infrastructure. It layers agent intelligence on top of the team's existing pipeline.

-   Build agent: Monitors build failures, analyzes error logs, fixes known patterns automatically or creates tasks with diagnostic context.

-   Security scanner agent: Runs SAST/DAST scans on every PR. Assesses severity, generates fix suggestions, auto-fixes low-severity issues.

-   Deploy agent: Manages deployment to staging and production. Supports canary, blue-green, and rolling strategies. Always gated by human approval in production by default.

-   Rollback agent: Monitors post-deployment health metrics. Initiates automatic rollback if error rates spike, with root cause analysis.

**11.5 Phase 5: Observability Agents**

**11.5.1 Application Observability**

-   Performance monitoring: Tracks response times, error rates, resource utilization.

-   Error pattern detection: Clusters recurring errors, creates bug tickets with diagnostic context.

-   User behavior analysis: Tracks feature usage. Underused features flagged for design reconsideration.

**11.5.2 Agent Observability**

-   Cost tracking: Real-time dashboards showing token usage, API costs, wall-clock time per agent, per phase, per project. Three-tier aggregation: monthly total, per-phase, per-agent.

-   Quality scoring: Code generation scored on test pass rate, review comment density, production incident correlation.

-   Drift detection: Monitors agent behavior changes over time. SpecDriftDetected events alert when quality scores deviate.

**11.5.3 Production Observability Boundaries**

**Principle:** The proactive part is detection and diagnosis. The fix always goes through the governed pipeline. An agent autonomously pushing code to production to fix something it detected is how you get outages.

**11.5.4 Feedback-to-Design Loop**

When the observability layer detects a production issue, it can create a feedback event that triggers the design phase for the affected feature.

**12. Research and Continuous Improvement Agents (Phase 3)**

Research agents periodically analyze the deployed application and suggest improvements that feed back into the design phase. Adding research agents later is a new agent contract plus prompts, not an architecture change.

-   UX research agent: Crawls the deployed app, analyzes user flow patterns, identifies friction points.

-   Performance analyst: Runs Lighthouse audits, identifies bundle size issues, suggests code-splitting.

-   SEO auditor: Checks meta tags, structured data, page speed, mobile responsiveness.

-   Accessibility auditor: Validates WCAG compliance, identifies contrast issues, missing ARIA labels.

