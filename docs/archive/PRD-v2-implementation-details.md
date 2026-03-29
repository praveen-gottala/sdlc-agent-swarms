# PRD-v2 Implementation Details Archive

## Archive Notice

This content was extracted from PRD-v2.md per ADR-038. Review and delete once
confirmed that all implementation details are covered by TypeScript interfaces.
Target deletion: 2026-04-12.

---

## Section 4.4 — API Contracts Between Layers (Original)

Within a single process, layers communicate via TypeScript interfaces. The governance layer is implemented as middleware that wraps every agent action, not as a separate service.

> Orchestrator Interface:
>
> startPhase(phase, config) -> void
>
> getStatus() -> ProjectState // includes active_agent_count
>
> pausePhase(phase) -> void
>
> approveGate(gateId, decision) -> void
>
> Agent Runtime Interface:
>
> executeAgent(agentContract, context) -> Result
>
> getAgentStatus(agentId) -> AgentState
>
> Governance Interface (middleware):
>
> checkPermission(agent, action) -> Allow | Deny
>
> enforceHITL(action) -> Proceed | Pause | Notify
>
> checkBudget(agent, estimatedCost) -> Allow | Deny
>
> MCP Client Interface:
>
> callTool(server, method, params) -> Result
>
> Event Bus Interface:
>
> emit(event) -> void // alias: publish()
>
> subscribe(eventType, handler) -> void
>
> history({ after?, type? }) -> Event[] // replay support
>
> *Updated per ADR-003: publish/emit alias on event bus. Updated per ADR-012: Bounded event history buffer with replay support.*

Every executeAgent call passes through checkPermission, checkBudget, and enforceHITL before the agent's LLM call fires. If any check fails, the action is blocked before spending tokens.

---

## Section 5.3 — Task State Fields (Original)

**All 14 required fields per task:** id, title, phase, agent, status, depends_on, spec_ref, branch, pr_number, cost_usd, tokens_used, attempts, max_attempts, hitl_status.

> *Verified: All 14 PRD Section 5.3 fields present on every task object as confirmed in P32 testing (Wave 7).*

---

## Section 10.1 — Agent Contract Definition (Original)

Every agent is defined by a 7-section YAML contract specifying what the agent can do, cannot do, and how it coordinates with humans and other agents. Agent contracts are stored in agentforge/agents.yaml.

**The 7 sections:** role, provider, execution, tools, permissions, hitl_policy, budget.

> *Updated per ADR-011: Agent contracts stored separately from project manifest.*
>
> *Updated per ADR-013: Context injection (spec sections, learnings, ADRs, conventions) is determined at runtime, not stored as static fields in the agent contract.*
>
> *Updated per ADR-010: 7-section agent contract structure formally defined.*

Runtime status is computed from task states: idle, executing, blocked, waiting_ci, or error. The GET /api/agents endpoint returns all agent contracts with computed runtime status.

---

## Section 27.1 — V3-Required Event Types Table (Original)

The following 13 events are required by the V3 Dashboard and have been verified as emittable through full pipeline simulation.

| Event Type | V3 Dashboard Dependency | Status |
|---|---|---|
| TaskStatusChanged | Pipeline View — task status updates, Kanban board | VERIFIED |
| AgentStarted | Agent Panel — agent activity indicators | VERIFIED |
| AgentCompleted | Agent Panel — completion status | VERIFIED |
| AgentFailed | Agent Panel — error display, retry buttons | VERIFIED |
| CIResult | CI/CD Panel — build status, logs link | VERIFIED |
| PRCreated | PR Panel — PR list, review queue | VERIFIED |
| PRMerged | PR Panel — merge status, branch cleanup | VERIFIED |
| HITLApproved | Approval Queue — approval decisions, audit trail | VERIFIED |
| HITLTimeout | Approval Queue — timeout alerts, escalation status | VERIFIED |
| BudgetAlert | Cost Dashboard — spending alerts, budget bars | VERIFIED |
| TrustEscalated | Trust Panel — trust level changes per agent | VERIFIED |
| SpecDriftDetected | Spec Panel — drift indicators, sync status | VERIFIED |
| AgentAborted | Agent Panel — abort status, reason display | VERIFIED |

---

## Section 27.2 — Event Bus Capabilities (Original)

- All 34 event types publishable and subscribable with type-safe narrowing
- Every event has: event_id (unique UUID), type, timestamp, source
- Event history buffer with bounded FIFO (default 1000 events)
- Replay from timestamp: bus.history({ after: timestamp }) returns all events after T
- Replay with type filter: bus.history({ type, after }) for targeted reconnect
- History returns immutable copies (mutations do not affect buffer)
- Strictly chronological ordering preserved in history

---

## Section 28 — Dashboard API Contract (Original)

### 28.1 Core Endpoints (10/10 Ready)

| Endpoint | Data Source | Key Details |
|---|---|---|
| GET /api/pipeline | agentforge.yaml + tasks.yaml | Phase statuses, progress %, costs, active phase ID. All 5 SDLC phases. |
| GET /api/tasks | agentforge.tasks.yaml | All 14 PRD fields per task. getTask by ID. TASK_NOT_FOUND for invalid IDs. |
| GET /api/approvals | tasks.yaml (filtered) | Filters by hitl_status = awaiting_approval. |
| GET /api/agents | agentforge/agents.yaml | 7-section contracts. Runtime status computed from task states. |
| GET /api/spec/:path | spec/ directory | readSpecs + readSpecFile. 404 on invalid path. |
| GET /api/costs | tasks.yaml (3-tier) | Monthly total, per-phase, per-agent. All tiers cross-validated. |
| GET /api/audit | audit-logger | Pagination, filter by agent/time/cost. JSON + CSV export. PRD 19.3 compliant. |
| GET /api/trust | progressive-trust manager | Per-agent: currentLevel, consecutiveApprovals, threshold. |
| POST /api/commands/abort | task-manager + event bus | Task to failed. AgentAborted event. Branch preserved. |
| POST /api/approvals/:gateId/decide | governance middleware | Full pipeline: permission → budget → HITL. Audit log updated. |

### 28.2 Additional Endpoints

| Endpoint | Data Source | Status |
|---|---|---|
| /api/learnings/:role (CRUD) | .agentforge/learnings/<role>.yaml | READY — Full CRUD verified |
| POST /api/trust/:id/override | progressive-trust + governance | READY — TrustEscalated event emitted |
| GET/PUT /api/preferences | .agentforge/dashboard-preferences.yaml | V3-NEW — To be created during V3 implementation |
| GET /api/agents/:id/traces | .agentforge/traces/<task_id>.json | V3-NEW — To be created during V3 implementation |
