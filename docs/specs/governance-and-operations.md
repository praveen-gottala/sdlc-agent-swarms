# Governance, Operations, and Security

> Part of the [AgentForge PRD](./PRD.md). Covers HITL configuration, progressive trust,
> messaging integration, code sandbox, supported stacks, LLM providers, MCP layer,
> permissions, secret management, audit logging, and cost governance.

**13. Human-in-the-Loop Configuration**

**13.1 HITL Policy Levels**

  -------------------------------------------------------------------------------------------------------------------------------
  **Level**           **Behavior**                                             **Typical Use**
  ------------------- -------------------------------------------------------- --------------------------------------------------
  Full approval       Agent proposes, human must approve before any action     Regulated industries, production deploys, design

  Review + override   Agent acts, human can override within a time window      Code reviews, design iterations

  Notify only         Agent acts autonomously, human notified after the fact   Test generation, linting, doc updates

  Fully autonomous    Agent acts without notification. Audit log available.    CI builds, metrics collection
  -------------------------------------------------------------------------------------------------------------------------------

**13.2 Progressive Trust Model**

Agent autonomy can increase over time based on performance. If the code generation agent's PRs have been approved without changes for N consecutive PRs, the team can configure automatic escalation from full_approval to review_and_override. This is opt-in and fully configurable. Rejection resets consecutiveApprovals to 0. TrustEscalated event fires at threshold. Manual trust level override is available via POST /api/trust/:id/override.

**13.3 Escalation Policy**

When a human does not respond within the configured timeout (default: 60 minutes), the framework pauses all dependent tasks and sends escalation to the secondary channel. If escalation also times out, the project enters full pause with a stalled notification. The framework never auto-approves a gated action on timeout. HITLTimeout event is emitted for dashboard display.

**14. Messaging Integration and Task Management**

Slack and Telegram are the primary developer interfaces for Phase 1. The CLI serves as a universal fallback. The web dashboard is added in Phase 2.

**14.1 Messaging Abstraction Layer**

All messaging is abstracted behind a two-layer interface. Layer 1 (HITLChannel) defines the core contract: sendNotification, requestApproval, onDecision, updateStatus. Layer 2 (RichHITLChannel) adds optional capabilities: sendTaskBoard, sendCodePreview, startThread. Slack implements both layers. Telegram implements core plus partial rich. CLI implements core only. Dashboard implements both layers.

**14.2 Channel Routing**

Approval requests are sent to all configured channels. The first response from any channel wins. Status updates go to the primary channel only. Critical alerts go to all channels.

> *Updated per ADR-020: Automatic failover for status updates is deferred to Phase 2. Critical alerts and approval requests are unaffected.*

**14.3 Slack Integration**

Slack is the full-featured HITL channel using Block Kit for rich interactivity. The live task board is a pinned phase summary message that updates in place via chat.update every time a task status changes. It includes \[View Spec\], \[Pause All\], and \[View in GitHub\] buttons.

**14.4 Telegram Integration**

Telegram serves as the mobile-first notification and approval channel using inline keyboards for approval buttons.

**14.5 CLI Integration**

> agentforge status \# print task table
>
> agentforge status \--watch \# live-updating terminal output
>
> agentforge approve task_002
>
> agentforge abort task_003

**15. Code Sandbox Strategy**

Agent-generated code never executes on the developer's machine. GitHub Actions serves as the isolated sandbox environment for Phase 1.

**15.1 Sandbox Workflow**

-   Agent generates code and pushes to a feature branch.

-   Push triggers a GitHub Actions workflow that installs dependencies, runs build, runs tests.

-   If CI passes, the agent creates a PR with full context.

-   If CI fails, the CI agent captures logs, sends them to the coding agent with diagnostic context, and the coding agent fixes in the same branch.

-   Maximum 3 CI retry cycles per task before escalating to human.

**15.2 Kill Switch**

The agentforge abort command provides granular control over runaway agents. When abort is issued: the task status is set to aborting, the current LLM call completes, the agent runtime checks status and stops, the branch is preserved for inspection (unless \--cleanup is specified), the task status moves to aborted, the AgentAborted event is emitted with agentId, taskId, and reason, and all channels are notified.

**16. Supported Stack Matrix**

**16.1 Phase 1 Supported Stack**

  ----------------------------------------------------------------------------------------------
  **Layer**    **Supported**             **Details**
  ------------ ------------------------- -------------------------------------------------------
  Frontend     React                     TypeScript, Tailwind CSS, React Query, Zod validation

  Backend      Node.js                   Express or Fastify, TypeScript

  ORM          Prisma                    Type-safe database access, migration management

  Database     PostgreSQL                Primary relational database

  Testing      Jest + Playwright         Unit, integration, and e2e coverage

  Styling      Tailwind or CSS Modules   Design token integration
  ----------------------------------------------------------------------------------------------

**16.2 Prompt Template Registry**

Each supported stack has a directory of prompt templates and configuration that agents use to generate idiomatic, consistent code. Adding new stacks in future phases is an additive operation: a new directory with new prompts and templates.

**17. LLM Provider Abstraction**

The provider layer supports both request/response and streaming modes from day one.

**17.1 Provider Interface**

> LLMProvider:
>
> complete(prompt, options) -\> CompletionResult
>
> stream(prompt, options) -\> AsyncIterable\<StreamChunk\>
>
> StreamChunk:
>
> { type: \'token\', content: string, token_count: number }
>
> { type: \'tool_call\', name: string, args: object }
>
> { type: \'done\', total_tokens: number, cost_usd: number }

**17.2 Per-Agent Execution Mode**

Each agent contract specifies whether it uses streaming or request/response mode. Code generation agents use streaming for progress visibility. Lightweight agents use request/response for simplicity.

**18. MCP Integration Layer**

The Model Context Protocol (MCP) is AgentForge's primary integration standard. Agents never interact with raw MCP servers directly; they go through an adapter layer that provides authentication, rate limiting, error recovery, caching, and observability hooks.

  ----------------------------------------------------------------------------------------------
  **MCP Server**    **Purpose**                             **Used By**         **Status**
  ----------------- --------------------------------------- ------------------- ----------------
  Figma MCP         Design context, write-back              Design, Code gen    GA

  GitHub MCP        Repo operations, PRs, Actions           Code, CI/CD         GA

  Slack MCP         Notifications, approvals, task boards   All phases (HITL)   GA

  Notion MCP        Documentation, specs, wikis             Spec, Planning      GA

  Jira/Linear MCP   Task tracking, sprint management        Planning, Code      Community

  Database MCP      Schema read/write                       Code gen, Spec      Community
  ----------------------------------------------------------------------------------------------

> *Updated per ADR-018: MCP middleware observability at outermost position for full request/response tracing.*

**19. Security and Governance**

**19.1 Agent Permissions Model**

AgentForge implements a least-privilege model. Each agent is granted minimum permissions for its role, defined in the agent contract and enforced by governance middleware. Governance order: permission check → budget check → HITL enforcement.

> *Updated per ADR-004: Governance order formally defined as permission → budget → HITL.*

**19.2 Secret Management**

Phase 1 uses environment variables (AGENTFORGE_MCP\_{SERVER}\_{KEY}) with governance-enforced scoping. Agents never see raw secrets; auth middleware injects tokens. Scope enforcement blocks cross-agent access before any external call. Vault integration with time-limited tokens is Phase 2.

> *Updated per ADR-017: Environment variable provider with governance-enforced scoping for Phase 1.*

**19.3 Audit Logging**

**Required fields:** agent identity (agentId), action taken (action type and target), input context (inputContext), output produced (outputProduced), approving human (approvedBy), cost incurred (full CostRecord), timestamp, and git commit SHA (gitCommitSha). Fields that are not applicable to all action types are optional on the type but populated whenever applicable.

The audit trail is queryable by agent, action type, time range, outcome, and cost threshold. It is exportable in JSON and CSV formats for compliance. Pagination via limit + offset is supported.

> *Verified: All PRD 19.3 fields implemented and queryable as confirmed in P32 audit endpoint testing.*

**19.4 Cost Governance**

  ----------------------------------------------------------------------------------------------------------
  **Level**       **Scope**                                 **Behavior**
  --------------- ----------------------------------------- ------------------------------------------------
  Per-agent       Maximum tokens/cost per individual task   Prevents runaway loops via circuit breaker

  Per-phase       Maximum cost for an entire SDLC phase     Alerts at 80%, pauses at limit

  Per-project     Monthly or quarterly budget cap           Hard stop with human authorization to continue
  ----------------------------------------------------------------------------------------------------------

Cost aggregation is available at three tiers: monthly total, per-phase breakdown, and per-agent breakdown. All three tiers cross-validate to the same total. BudgetAlert events are emitted for the V3 Cost Dashboard.

**19.5 Generated Code Licensing**

Code generated by AgentForge agents is not covered by the AgentForge Apache 2.0 license and belongs entirely to the user.
