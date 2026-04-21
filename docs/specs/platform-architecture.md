# Platform Architecture

> Part of the [AgentForge PRD](./PRD.md). Covers framework architecture, data model,
> schema versioning, and agent communication protocol.

**4. Framework Architecture**

AgentForge is structured as a layered architecture with clear separation of concerns. Each layer is independently replaceable and extensible.

**4.1 Architecture Layers**

  ---------------------------------------------------------------------------------------------------------------------------
  **Layer**       **Responsibility**                                               **Key Technologies**
  --------------- ---------------------------------------------------------------- ------------------------------------------
  Orchestration   Supervisor agent, workflow engine, state management, event bus   TypeScript (custom DAG engine)

  Agent Runtime   Agent lifecycle, memory, tool access, LLM routing, streaming     MCP protocol, provider adapters

  Integration     Adapters for external tools (Figma, GitHub, Slack, Telegram)     MCP servers, REST/GraphQL adapters

  Governance      HITL gates, approval workflows, audit logging, cost controls     Middleware pattern, policy-as-code, RBAC

  Observability   Tracing, metrics, eval, drift detection                          OpenTelemetry, Langfuse/OpenLIT adapters
  ---------------------------------------------------------------------------------------------------------------------------

> *Updated per ADR-022: Orchestration engine implemented in TypeScript, not Python/LangGraph. All behavioral requirements met.*

**4.2 Core Design Principles**

-   Spec-as-source-of-truth: Every application generates a living specification (YAML) that evolves with the project. All agents read from and write to this spec. It is version-controlled alongside code. Post human-approval, code becomes truth and the spec auto-syncs to match.

-   Agent isolation: Each agent operates in a sandboxed context with explicit permissions. A design agent cannot push to production. A CI/CD agent cannot modify design files. Permissions are defined in the agent contract and enforced by the governance middleware.

-   Event-driven coordination: Agents communicate through an event bus, not direct calls. When the design agent completes a page, it emits a DesignComplete event. The spec agent subscribes and begins work. No agent ever calls another agent directly.

-   Fail-safe defaults: Every destructive action (merge, deploy, delete) requires explicit human approval by default. Teams opt into autonomy, not out of safety.

-   Cost-aware execution: Every agent call tracks token usage, API cost, and wall-clock time. Budget limits are enforced at three levels: per-agent, per-phase, and per-project. Runaway loops are automatically terminated via circuit breakers. The CostRecord type carries inputTokens, outputTokens, and wallClockMs fields (optional for backward compatibility).

-   Browser-as-truth for design: Design specifications use CSS flexbox semantics. Verification renders specs in a real browser engine (Playwright) rather than relying on design tool interpretation or vision model evaluation. The browser is the standard — not an approximation of it.

-   Catalog-constrained generation: LLMs generate UI by referencing components from a declared catalog injected into the prompt, with structural output guaranteed by the LLM provider's `responseSchema`. Hallucinated references that slip through are silently corrected via fuzzy-match to the nearest valid component — zero retries, zero wasted LLM calls. This guardrailing pattern (shared by Vercel's json-render, Google's A2UI, and OpenAI's Open-JSON-UI) ensures generated interfaces are predictable, safe, and consistent with the project's design system.

> *Updated per ADR-008: Token and timing fields on CostRecord are optional for backward compatibility; providers should populate them.*

**4.3 Process Architecture**

For Phase 1, the entire framework runs as a single Node.js process invoked via the CLI. All orchestration, agent runtime, governance, and event bus logic runs in-process in TypeScript.

> agentforge CLI (TypeScript / Commander.js)
>
> \|\-- in-process \--\> \@agentforge/core (TypeScript)
>
> \|\-- Orchestrator (runAgent + governance middleware)
>
> \|\-- Agent Runtime (provider routing, sandboxing, budget)
>
> \|\-- Event Bus (in-memory EventEmitter for v1, Redis Streams later)
>
> \|\-- MCP Client layer (Figma, GitHub, Slack, Telegram)
>
> \|\-- Governance engine (middleware, not a separate service)
>
> *Updated per ADR-022: Implementation is TypeScript-only, no Python process, no REST/gRPC bridge. All orchestration runs in-process.*

**4.4 API Contracts Between Layers**

Within a single process, layers communicate via TypeScript interfaces. The governance layer is implemented as middleware that wraps every agent action, not as a separate service.

> Orchestrator Interface:
>
> startPhase(phase, config) -\> void
>
> getStatus() -\> ProjectState // Note: active_agent_count exists in Python engine only (services/engine/), not in active TypeScript workflow
>
> pausePhase(phase) -\> void
>
> approveGate(gateId, decision) -\> void
>
> Agent Runtime Interface:
>
> executeAgent(agentContract, context) -\> Result
>
> getAgentStatus(agentId) -\> AgentState
>
> Governance Interface (middleware):
>
> checkPermission(agent, action) -\> Allow \| Deny
>
> enforceHITL(action) -\> Proceed \| Pause \| Notify
>
> checkBudget(agent, estimatedCost) -\> Allow \| Deny
>
> MCP Client Interface:
>
> callTool(server, method, params) -\> Result
>
> Event Bus Interface:
>
> emit(event) -\> void // alias: publish()
>
> subscribe(eventType, handler) -\> void
>
> history({ after?, type? }) -\> Event\[\] // replay support
>
> *Updated per ADR-003: publish/emit alias on event bus. Updated per ADR-012: Bounded event history buffer with replay support.*

Every executeAgent call passes through checkPermission, checkBudget, and enforceHITL before the agent's LLM call fires. If any check fails, the action is blocked before spending tokens.

> **Authoritative contracts:** See TypeScript interfaces in packages/core/src/types/ for complete field definitions.

**5. Data Model**

AgentForge has five core data structures. All are YAML or JSON, version-controlled, and live in the repository. Every agent action that changes the spec or creates a task is a git commit, providing a full audit trail.

**5.1 Project Manifest (agentforge.yaml)**

The configuration file that describes how AgentForge manages the project. Lives in the repository root. Created during agentforge init.

> version: \"1.0\"
>
> project:
>
> name: \"my-saas-app\"
>
> id: \"proj_abc123\"
>
> platforms: \[\"web\"\]
>
> stack:
>
> frontend: \"react\"
>
> backend: \"node\"
>
> database: \"postgresql\"
>
> styling: \"tailwind\"
>
> repo:
>
> provider: \"github\"
>
> org: \"org-name\"
>
> name: \"my-saas-app\"
>
> agents:
>
> providers:
>
> default: \"claude-sonnet-4-6\"
>
> overrides:
>
> architecture: \"claude-opus-4-6\"
>
> code_review: \"claude-haiku-4-5\"
>
> sandbox:
>
> type: \"github_actions\"
>
> timeout_minutes: 15
>
> max_retries: 3
>
> orchestration:
>
> max_concurrent_agents: 3
>
> ci_wait_strategy: \"spawn_next\"
>
> hitl:
>
> default: \"review_and_override\"
>
> overrides:
>
> design: \"full_approval\"
>
> production_deploy: \"full_approval\"
>
> test_generation: \"notify_only\"
>
> channels:
>
> \- type: \"slack\" \| capabilities: \"full\" \| priority: 1
>
> \- type: \"telegram\" \| capabilities: \"approvals\" \| priority: 2
>
> \- type: \"cli\" \| capabilities: \"basic\" \| priority: 3
>
> routing:
>
> approval_requests: \"all\"
>
> status_updates: \"primary\"
>
> critical_alerts: \"all\"
>
> budget:
>
> per_task_max_usd: 2.00
>
> per_phase_max_usd: 25.00
>
> monthly_max_usd: 200.00
>
> alert_threshold: 0.8

**5.2 Living Spec (Split Per-Module)**

The project specification is the source of truth for what the application is. It is split into per-module files to enable parallel agent execution without merge conflicts.

> agentforge/
>
> spec/
>
> project.yaml \# app metadata, global config, ADRs
>
> pages.yaml \# page list with routes, status
>
> components/
>
> dashboard.yaml \# components for dashboard page
>
> settings.yaml \# components for settings page
>
> api.yaml \# all endpoint definitions
>
> models.yaml \# all data model definitions

Each component spec file defines the components for a single page, including props interfaces, state requirements, data dependencies, and behavioral requirements. Agents acquire a write lock on the specific file they are modifying. Read locks are never required.

**5.3 Task State (agentforge.tasks.yaml)**

The task tracker, managed by the orchestrator. This is the source of truth for what agents are doing, what is pending, and what is blocked. This same state powers the Slack/Telegram live task board and the web dashboard.

> **Authoritative field list:** See TaskEntry interface in packages/core/src/types/. Current implementation has 16 fields (evolved beyond original 14).

**5.4 Agent Learnings (Per-Role Memory)**

Each agent role accumulates observations over time in a learnings file. These observations are injected into the agent's context alongside the spec, enabling agents to improve with use. Learnings are stored in .agentforge/learnings/\<role\>.yaml and are fully CRUD-accessible via the /api/learnings/:role endpoint.

**5.5 Dashboard Preferences (V3 New)**

User preferences for the V3 dashboard layout, theme, and display settings. Stored in .agentforge/dashboard-preferences.yaml. Accessible via GET/PUT /api/preferences. This is a V3-new data structure not present in the Phase 1 implementation.

**5.6 Agent Execution Traces (V3 New)**

Step-by-step execution traces for agent debugging and transparency. Stored in .agentforge/traces/\<task_id\>.json. Accessible via GET /api/agents/:id/traces. Each trace includes a timeline of LLM calls, tool invocations, decisions, and diff-between-attempts views. This is a V3-new data structure enabling the Agent Reasoning Trace panel in the dashboard.

**5.7 DesignSpec (Per-Screen Design Specification)**

The visual specification for each screen, bridging the design and code generation phases. Stored in agentforge/designs/\<screen\>.json. Contains a flat node map representing a flexbox layout tree, where each node specifies type, layout properties (dir, gap, align, justify, padding), dimensions, design token references, and parent/child relationships.

This approach aligns with the industry-wide convergence on JSON intermediate representations for AI-generated UI. Vercel's json-render, Google's A2UI, and OpenAI's Open-JSON-UI all independently arrived at the same pattern: LLM generates constrained JSON → framework renders it to platform-specific components. AgentForge's DesignSpec operates one layer deeper — where these frameworks compose pre-built components, DesignSpec defines the layout primitives themselves, enabling fully custom designs rather than assemblies of existing UI kits.

The DesignSpec supports three extension sections beyond layout:

-   interactions: Click/hover triggers mapped to actions (show, hide, navigate, toggle) for prototype rendering.

-   dataBindings: Field-to-data-source mappings for auto-population in prototypes and code generation.

-   mockData: Sample data used by the prototype renderer to demonstrate realistic data flow.

Component references in the DesignSpec(e.g., `catalog: "button-primary"`) are constrained by injecting the available catalog entries into the prompt alongside responseSchema for structural validation. Hallucinated references that slip through are silently corrected via fuzzy-match to the nearest valid component — zero retries, zero wasted LLM calls. This follows the same guardrailing pattern used by json-render and A2UI.

This is the contract between the design agent and the code generation agent — the code generator reads this JSON directly to produce React components. The browser renderer reads it to produce pixel-perfect verification screenshots. The DesignSpec can also be exported to json-render format for teams that want to use Vercel's rendering ecosystem.

> **Authoritative schema:** See DesignSpecV2 interface in packages/agents-ux/src/types/ or packages/designspec-renderer/src/types/.

**6. Schema Versioning**

Every YAML file includes a version field. The agentforge migrate command reads file versions, applies pending transforms, and updates files. Even if v1.0 to v1.1 has zero migrations, the infrastructure exists from day one. Migration functions transform one schema version to the next. New fields get sensible defaults. Removed fields are archived. The migration runner is idempotent.

> agentforge migrate \# applies pending migrations
>
> agentforge migrate \--dry \# shows changes without applying

**7. Agent Communication Protocol**

Agents do not communicate with each other directly. All coordination flows through the event bus and shared spec files. This is a deliberate architectural decision.

**7.1 Inter-Phase Communication**

When an agent completes its work, it emits an event to the event bus with a pointer to the updated spec file. Downstream agents subscribe to that event type, read the updated spec, and begin their work. The orchestrator manages sequencing and dependency resolution.

**7.2 Intra-Phase Communication**

For agents within the same phase running in parallel, coordination happens through the task dependency graph and shared spec files. If the backend agent needs something the frontend agent produced, the dependency is declared in the task graph.

**7.3 Why Not Direct Agent-to-Agent Messaging**

Direct messaging between agents creates a debugging nightmare. With event bus plus shared files, every interaction is logged, version-controlled, and inspectable. If agent B produces wrong output, you can trace back to the exact spec version it read and the exact event that triggered it.

