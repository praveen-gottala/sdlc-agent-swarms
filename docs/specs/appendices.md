# PRD Appendices — DX, Stack, Milestones, Risks, References

> Part of the [AgentForge PRD](./PRD.md). Covers developer experience narrative,
> technical stack, milestones, success metrics, risks, and reference implementations.
>
> **Moved elsewhere:**
> - Failure modes (F1-F19) → [reference/failure-modes.md](../reference/failure-modes.md)
> - Event bus catalog → `packages/core/src/events/` (code is authoritative per ADR-038)
> - Dashboard API contract → [specs/dashboard.md](./dashboard.md)
> - ADR index → `docs/adrs/` directory (the files themselves are authoritative)
> - V2 readiness certification → [reference/v2-readiness-certification.md](../reference/v2-readiness-certification.md)

**21. Developer Experience Narrative**

**21.1 First Run**

The developer installs the CLI (npm install -g agentforge), runs agentforge init, and answers 5 questions. In under 3 minutes, the project is scaffolded, agents are registered, and channels are connected.

**21.2 Design Phase**

The developer describes the desired page in natural language. Within minutes, a Slack notification arrives: design is ready in Penpot. The developer opens Penpot, makes adjustments. AgentForge detects the edits, applies design system tokens, and sends another notification. The developer approves via a Slack button on their phone.

**21.3 Code Generation Phase**

After spec approval, the developer gets a Slack message: 6 tasks created. The live task board updates in real-time. One task needs a PR review. They tap Approve on Telegram. By the time they finish coffee, 4 of 6 tasks are done.

**21.4 Dashboard Monitoring (Phase 2)**

The developer opens the AgentForge web dashboard and sees the Pipeline View with all 5 SDLC phases. They click into the Code phase to see the Kanban board with task cards moving from pending through in_progress to done. The Cost Dashboard shows \$1.50 spent on the auth feature across 10 tasks. They drill into a task's Agent Reasoning Trace to understand why the backend coder chose a specific API pattern.

**22. Technical Stack**

**22.1 Core Framework**

  ----------------------------------------------------------------------------------------------------------------
  **Component**          **Technology**                            **Rationale**
  ---------------------- ----------------------------------------- -----------------------------------------------
  CLI                    Node.js (TypeScript, Commander.js)        Developer-facing interface, npm ecosystem

  Orchestration engine   TypeScript (custom DAG engine)            Stateful agents, persistence, HITL interrupts

  Event bus              In-memory (v1), Redis Streams (v2)        Lightweight event routing between agents

  State store            YAML files in git (v1), PostgreSQL (v2)   Version-controlled spec and task state

  Agent learnings        YAML files per role                       Persistent per-agent memory

  Design renderer        Playwright (headless Chromium)            Browser-accurate layout verification from DesignSpec
  ----------------------------------------------------------------------------------------------------------------

> *Updated per ADR-022: Orchestration engine implemented in TypeScript, not Python/LangGraph.*

> **Current versions:** See package.json files in each package.

**22.2 External Integrations**

  -------------------------------------------------------------------------------------------------
  **Integration**     **Protocol**                                **Required**
  ------------------- ------------------------------------------- ---------------------------------
  GitHub / GitLab     REST API + MCP + Webhooks                   Required (one)

  LLM providers       REST API (Claude, OpenAI, Gemini, Ollama)   Required (at least one)

  Playwright          Headless Chromium                            Required (design verification)

  Penpot              Plugin API + MCP + REST                            Optional (primary design tool)


  Slack               Socket Mode / Events API + Block Kit        Recommended (primary HITL)

  Telegram            Bot API + Inline Keyboards                  Recommended (secondary HITL)

  Observability       OpenTelemetry + Langfuse/OpenLIT            Recommended

  Task tracking       Jira/Linear/Asana via MCP                   Optional
  -------------------------------------------------------------------------------------------------

**23. Open-Source Strategy**

**23.1 License and Governance**

AgentForge is released under the Apache 2.0 license. Governance follows the BDFL model initially, transitioning to a Technical Steering Committee once the contributor community reaches 20+ active contributors.

**23.2 Repository Structure**

-   \@agentforge/core: Orchestration engine, event bus, agent runtime, governance layer

-   \@agentforge/cli: Command-line interface for project initialization and management

-   \@agentforge/agents-design: Design phase agents (Penpot adapter, browser adapter)

-   \@agentforge/agents-spec: Specification and planning agents

-   \@agentforge/agents-code: Code generation and review agents

-   \@agentforge/agents-cicd: CI/CD pipeline agents

-   \@agentforge/agents-observe: Observability and monitoring agents

-   \@agentforge/providers: LLM provider adapters

-   \@agentforge/channels: Messaging channel adapters (Slack, Telegram, CLI)

-   \@agentforge/stacks: Prompt template registries per supported stack

-   \@agentforge/dashboard: Web dashboard (Phase 2) --- React + TypeScript + Tailwind

**23.3 Contribution Model**

Third-party contributors can create: custom agents, custom MCP adapters, custom HITL policies, custom LLM provider adapters, and custom stack prompt templates.

**24. Milestones and Roadmap**

**24.1 Phase 1: Foundation (Months 1--3)**

**Milestone deliverable:** A developer can run agentforge init, describe a web app, collaborate with design agents in Figma, approve the spec, and get a working deployed React + Node.js application with CI/CD pipeline.

-   Core orchestration engine with event bus and state management (TypeScript)

-   Agent runtime with LLM provider abstraction (Claude + OpenAI + Gemini), streaming support

-   CLI: agentforge init, start, status, approve, abort, migrate, config, design

-   Penpot adapter (read + write via Plugin API)

-   Single supported stack: React + Node.js + Prisma + PostgreSQL

-   Prompt template registry for react-node-prisma stack

-   Slack integration (full interactive HITL with live task board)

-   Telegram integration (approvals + notifications)

-   CLI fallback for zero-config usage

-   GitHub Actions as code sandbox

-   Basic HITL: all four policy levels, configurable per phase

-   Per-module spec file splitting

-   Context resolution with spec sync agent

-   Agent learnings files (persistent per-role memory)

-   Schema versioning with migrate command

-   Failure handling for F1, F2, F3, F4, F5, F6, F10, F11

-   Cost governance (per-task, per-phase, per-project budgets)

-   Kill switch (abort command with branch preservation)

-   Progressive trust model (opt-in automatic HITL escalation)

**24.2 Phase 2: Multi-Agent + Dashboard (Months 4--6)**

**Milestone deliverable:** A team can run AgentForge with full agent coverage, configure per-phase HITL policies, monitor costs and quality in a web dashboard, and use React Native for mobile.

-   Web dashboard (React) with pipeline view, Kanban board, cost tracking, HITL approval UI

-   Living Spec Viewer with drift indicators, inline editing, and git commit semantics

-   Agent Reasoning Trace panel with execution timelines and LLM response inspection

-   Integrations Management surface for channels, MCP servers, LLM providers

-   Agent contract configuration modal with all 7 sections

-   Design phase visualization with Penpot thumbnails and iteration history

-   Emergency controls: Pause All / Abort All in Pipeline View and Kanban board header

-   Per-user authentication (JWT with GitHub OAuth) for dashboard audit trail attribution

-   Dashboard preferences and agent execution traces (V3-new data structures)

-   Multi-agent code generation (frontend + backend + tests in parallel)

-   React Native mobile support

-   Redis Streams event bus (replacing in-memory)

-   PostgreSQL state store (replacing YAML for large projects)

-   Advanced HITL policies (team-level trust profiles, per-developer overrides)

-   Observability integration (Langfuse/OpenLIT)

-   GitLab CI support

-   Accessibility built-in from Phase 2a (keyboard navigation, WCAG compliance)

**24.3 Phase 3: Community + Scale (Months 7--12)**

**Milestone deliverable:** An organization can run AgentForge across multiple projects with shared design systems, research agents, brownfield onboarding, and a marketplace of community-contributed agents.

-   Brownfield onboarding (agentforge onboard with starter spec generation)

-   Angular, Vue, and Flutter support via new stack prompt templates

-   Research and continuous improvement agents

-   Plugin marketplace for community-contributed agents

-   Advanced observability: drift detection, A/B testing

-   Multi-project support (organization-level orchestration)

-   Additional design surface adapters (Framer, code-first via Storybook)

-   Local model support (Ollama, vLLM)

**25. Success Metrics**

**25.1 Framework Adoption**

  ------------------------------------------------------------------------------------------
  **Metric**                **6-Month Target**   **12-Month Target**   **Measurement**
  ------------------------- -------------------- --------------------- ---------------------
  GitHub stars              2,000                10,000                GitHub API

  Monthly active projects   100                  1,000                 Telemetry (opt-in)

  Community contributors    20                   100                   GitHub contributors

  Published agent plugins   5                    50                    Plugin registry
  ------------------------------------------------------------------------------------------

**25.2 Quality Metrics**

  --------------------------------------------------------------------------------------------------------
  **Metric**                       **Target**                    **Measurement**
  -------------------------------- ----------------------------- -----------------------------------------
  Generated code test pass rate    \>85% on first generation     CI pipeline results

  Design-to-code fidelity          \>95% layout match            Browser-rendered DesignSpec vs running React app (computed layout comparison)

  Time from idea to deployed MVP   \<1 day for simple apps       Workflow timestamps

  Agent cost per feature           \<\$5 for standard features   Cost tracking (per-feature aggregation)

  HITL override rate               \<20% (agents improving)      Approval log analysis
  --------------------------------------------------------------------------------------------------------

**26. Risks and Mitigations**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Risk**                                             **Severity**   **Mitigation**
  ---------------------------------------------------- -------------- ------------------------------------------------------------------------------------------------
  LLM provider API changes break agent contracts       High           Provider adapter abstraction. Automated integration tests. Version pinning.

  Figma API limitations prevent full write-back        Medium         Design surface abstraction. Code-first fallback. Community plugin bridge.

  Runaway agent loops consume budget                   High           Per-task budget limits. Circuit breaker. Automatic pause + human notification.

  Generated code introduces security vulnerabilities   High           Mandatory security scan agent. SAST/DAST on all generated code. Human review for auth/payment.

  Community fragmentation (too many forks)             Medium         Strong plugin/extension architecture. Active community management.

  Context window limits on complex projects            Medium         Per-module spec splitting. RAG over codebase. Chunked task decomposition.

  Slack/Telegram bot complexity underestimated         High           Two-layer messaging abstraction. CLI fallback always available.

  Spec sync agent introduces incorrect updates         Medium         Significant changes require human acknowledgment. Full audit trail.

  YAML file watching fragile at scale (dashboard)      Medium         Known-temporary bridge for Phase 2a. PostgreSQL migration hard-depended by Phase 2c.

  Shared API key auth undermines audit trail           High           Per-user JWT with GitHub OAuth required for Phase 2a dashboard launch.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------

**27. Reference Implementations**

**31.1 Orchestration Frameworks**

-   LangGraph (github.com/langchain-ai/langgraph) --- Stateful multi-agent orchestration (reference only; not used per ADR-022)

-   CrewAI (github.com/crewAIInc/crewAI) --- Role-playing multi-agent collaboration

-   Microsoft Agent Framework --- Merged AutoGen + Semantic Kernel

-   Google Agent Dev Kit (github.com/google/adk-python) --- Google ecosystem integration

-   OpenAI Agents SDK --- Lightweight Python framework

**31.2 SDLC-Specific Tools**

-   GitHub Spec Kit --- Spec-driven development toolkit

-   OpenHands Software Agent SDK --- Composable production agent SDK

-   ADOS --- Auditable SDLC: ticket to spec to plan to PR to release

**31.3 Observability**

-   Langfuse --- Open-source LLM observability with trace viewing and cost tracking

-   OpenLIT --- OpenTelemetry-native LLM monitoring

-   AgentOps --- Agent monitoring with session replays

**31.4 Design Integration**

-   Penpot Plugin API --- Official plugin development documentation (doc.plugins.penpot.app)

-   Penpot MCP Server --- Official MCP server for AI-powered design workflows (github.com/penpot/penpot-mcp)

**31.5 Generative UI Frameworks**

AgentForge's DesignSpec JSON follows the same architectural pattern independently adopted by the following frameworks. DesignSpec operates at the layout-primitive level (flexbox dir/gap/padding), while these frameworks operate at the component-composition level. Both are valid — AgentForge designs from first principles; these frameworks assemble from existing catalogs.

-   json-render (github.com/vercel-labs/json-render) --- Vercel's Generative UI framework. Apache 2.0, 13K+ stars. Zod-defined component catalogs, LLM generates constrained JSON, renderers for React/Vue/Svelte/React Native. DesignSpec can export to json-render format.

-   A2UI (Google) --- Declarative JSON format for cross-platform agent UI. JSONL-based, framework-agnostic, flat component list with ID references. Security-first: declarative data, not executable code.

-   Open-JSON-UI (OpenAI) --- Open standardization of OpenAI's internal declarative Generative UI schema.

-   CopilotKit AG-UI --- Agent-to-UI protocol supporting A2UI, Open-JSON-UI, and MCP Apps for generative UI rendering.

**31.6 Research References**

-   EPAM Agentic Development Lifecycle (ADLC)

-   Microsoft AI-led SDLC with Azure and GitHub

-   ISO/IEC 5338:2023 --- AI system life cycle processes standard

-   Gartner: 33% of enterprise software will include agentic AI by 2028

*--- End of Document ---*
