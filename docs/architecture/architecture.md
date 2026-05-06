# CHIP System Architecture

## System Overview

CHIP orchestrates SDLC work through a four-stage sequential spine (Clarifier → Architect → Implementer → Reviewer), where each stage owns a typed artifact and hands off through Zod-typed LangGraph channels. Specialists (research, design, test, security, visual, docs) are invoked as tools by spine stages, never as parallel writers. Governance wraps every agent execution as middleware, and human-in-the-loop gates sit at stage boundaries.

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLI Layer (TypeScript / Commander.js)                               │
│  packages/cli                                                        │
│  Commands: init, start, status, approve, abort, migrate, config,     │
│            design, design-system, doctor, setup, eval                │
├──────────────────────────────────────────────────────────────────────┤
│  Spine — @langchain/langgraph (TypeScript)                           │
│  Sequential stages, typed Zod state channels, HITL interrupt nodes,  │
│  MemorySaver/PostgresSaver checkpointing                             │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Clarifier  │→ │ Architect  │→ │ Implementer  │→ │  Reviewer  │  │
│  │ (built)    │  │ (planned)  │  │  (planned)   │  │ (planned)  │  │
│  └────────────┘  └────────────┘  └──────────────┘  └────────────┘  │
│       ↑               ↑               ↑                ↑            │
│  Specialists: research, design, test, security, visual, docs        │
│  (invoked as tools by spine stages — never as parallel writers)      │
├───────────────┬──────────────────────┬───────────────────────────────┤
│ Agent Runtime │  Governance Layer    │  Integration Layer            │
│ packages/core │  packages/governance │  packages/channels            │
│ packages/     │  (MIDDLEWARE)        │  packages/providers           │
│ agents-*      │                      │                               │
│               │  1. Permission check │  HITL Channels:               │
│ Agent         │  2. Budget tracking  │    Slack (Block Kit)          │
│ lifecycle,    │  3. HITL enforcement │    Telegram (Bot API)         │
│ context       │  4. Audit logging    │    CLI (terminal fallback)    │
│ injection,    │                      │                               │
│ learnings,    │  See ADR-004 for     │  LLM Providers:               │
│ spec sync     │  ordering rationale  │    Claude (Anthropic)         │
│               │                      │    OpenAI (GPT)               │
│               │                      │                               │
│               │                      │  MCP Client (with middleware  │
│               │                      │  stack: auth, rate limit,     │
│               │                      │  cache, retry, observability) │
├───────────────┴──────────────────────┴───────────────────────────────┤
│  Event Bus (telemetry plane only — NOT coordination substrate)       │
│  In-memory EventEmitter (v1) / Redis Streams (v2)                    │
│  31 typed domain events, flat payloads (ADR-002)                     │
│  Coordination uses typed LangGraph channels (ADR-043, vision L2)     │
├──────────────────────────────────────────────────────────────────────┤
│  State Store                                                         │
│  YAML files in git (artifacts) / Postgres checkpointer (run state)   │
│  agentforge.yaml  — project manifest & configuration                 │
│  agentforge.tasks.yaml — task entries with status, cost, deps        │
│  spec/*.yaml — living spec (components, api, models)                 │
│  .agentforge/learnings.yaml — agent observations                     │
│  .agentforge/audit.jsonl — immutable audit trail                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
chip/
├── packages/
│   ├── core/                  # Types, event bus (telemetry), state management, agent runtime,
│   │                          # MCP client, config loader, spec sync, LLM wrapper
│   ├── governance/            # Middleware: permission, budget, HITL, audit
│   ├── providers/             # LLM adapters (Claude, OpenAI), cost tables
│   ├── channels/              # HITL channels (Slack, Telegram, CLI), channel router
│   ├── cli/                   # Commander.js CLI
│   ├── telemetry/             # OpenTelemetry + Langfuse observability (ADR-046)
│   ├── retrieval/             # Tree-sitter + voyage-code-3 + Qdrant + Cohere Rerank
│   ├── eval/                  # Evaluation framework for agent quality
│   ├── agents-clarifier/      # Clarifier spine stage (9-node LangGraph StateGraph)
│   ├── agents-design/         # Design agent (UX research, wireframe, visual)
│   ├── agents-ux/             # Design pipeline orchestration + DesignPhaseState
│   ├── agents-spec/           # Spec writer (components, API, models)
│   ├── agents-code/           # Code generator
│   ├── agents-cicd/           # CI/CD agent (lint, security, build fix, deploy)
│   ├── designspec-renderer/   # Browser-based design spec renderer (Vite + React)
│   ├── dashboard/             # Next.js dashboard UI (port 3000)
│   ├── integration-tests/     # End-to-end tests against real server endpoints
│   ├── e2e-test/              # E2E test harness
│   └── stacks/
│       └── react-node-prisma/ # Scaffold template for generated projects
├── services/
│   └── engine/                # DEPRECATED — Python LangGraph prototype (stub agents only)
│                              # Scheduled for deletion per ADR-043. Do not extend.
└── docs/
    ├── specs/PRD.md           # Product requirements (source of truth for product)
    ├── vision.md              # Architectural vision (source of truth for architecture)
    ├── architecture/          # Architecture docs (this file, spine, error handling)
    ├── concepts/              # Concept pages (agent taxonomy, clarifier, coordination)
    └── adrs/                  # Architecture Decision Records
```

## Package Dependency Graph

```
core (yaml, zod, eventemitter3 [telemetry only], @langchain/core,
      @langchain/langgraph-checkpoint, @langchain/langgraph-checkpoint-postgres)
  ├── governance (depends on core)
  ├── providers (depends on core)
  ├── channels (depends on core)
  ├── telemetry (depends on core; peers: agents-ux, providers — ADR-046)
  ├── retrieval (depends on core, voyageai, cohere-ai, @qdrant/js-client-rest, web-tree-sitter)
  ├── agents-design (depends on core, governance, providers)
  ├── agents-spec (depends on core, governance, providers)
  ├── agents-code (depends on core, governance, providers)
  ├── agents-cicd (depends on core, governance, providers)
  ├── agents-ux (depends on core, governance, providers)
  ├── agents-clarifier (depends on core, providers, retrieval, telemetry,
  │                      @langchain/langgraph, @langchain/core, zod)
  ├── designspec-renderer (depends on core — type-only devDependency, zero runtime deps)
  ├── eval (depends on core, providers, agents-clarifier, yaml, zod)
  ├── dashboard (Next.js — imports core, agents-ux, designspec-renderer, providers)
  └── cli (depends on core, governance, providers, channels, telemetry, eval)
```

Build order: `core` → `governance`, `providers`, `telemetry`, `retrieval` (parallel) → `channels` → `agents-*`, `designspec-renderer`, `eval` (parallel) → `cli`, `dashboard`

## API Contracts Between Layers

### Spine Stage Interface (@langchain/langgraph)

Each spine stage is a LangGraph `StateGraph` with Zod-typed state channels. Stages communicate through typed channel handoffs, not events.

```typescript
// Each stage defines its own StateGraph with typed annotation
const ClarifierAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  questions: Annotation<Question[]>({ reducer: (a, b) => [...a, ...b] }),
  answers: Annotation<Record<string, string>>,
  prdDraft: Annotation<string>,
  iteration: Annotation<number>,
  // ... stage-specific channels
});

// Stages use interrupt nodes for HITL gates
// Three structural gates at stage boundaries:
// 1. Clarification gate — after Clarifier produces questions
// 2. Design/API approval gate — after Architect produces spec
// 3. Code merge gate — after Reviewer approves changes

// Run state persisted via Postgres checkpointer (MemorySaver for dev)
```

See [CHIP's Spine Implementation](spine-implementation.md) for per-stage node sequences, context handoffs, and HITL mechanics.

### Agent Runtime Interface (packages/core)

```typescript
interface AgentRuntime {
  executeAgent(contract: AgentContract, context: AgentContext): Promise<Result<AgentOutput>>;
  getAgentStatus(agentId: string): AgentState;
  abortAgent(agentId: string): Promise<Result<void>>;
}

interface AgentContext {
  specRef: string;           // path to relevant spec file
  taskId: string;            // current task ID
  learnings: Learning[];     // accumulated agent learnings
  designContext?: DesignRef; // design context if applicable
  codeContext?: string[];    // relevant file paths
}

interface AgentOutput {
  files: FileChange[];       // created/modified files
  events: DomainEvent[];     // events to emit (telemetry)
  cost: CostRecord;          // tokens + USD spent
  learnings?: Learning[];    // new observations to record
}

type AgentState = 'idle' | 'executing' | 'waiting_ci' | 'waiting_hitl' | 'aborting' | 'done' | 'failed';
```

### Governance Interface (packages/governance — MIDDLEWARE)

```typescript
// Governance wraps every agent execution. It is NOT a separate service.
// It is middleware that intercepts before and after agent calls.
// Ordering rationale documented in ADR-004.

interface GovernanceMiddleware {
  checkPermission(agent: AgentContract, action: AgentAction): Result<void>;
  checkBudget(agent: AgentContract, estimated: CostEstimate): Result<void>;
  enforceHITL(action: AgentAction, policy: HITLPolicy): Promise<HITLResult>;
  recordAudit(entry: AuditEntry): void;
}

type HITLResult =
  | { status: 'proceed' }
  | { status: 'pause'; gateId: string; channels: MessageRef[] }
  | { status: 'notify'; channels: MessageRef[] }
  | { status: 'denied'; reason: string };

// Execution pipeline (ADR-004):
// 1. checkPermission(agent, action) → deny-list → allow-list → deny
// 2. checkBudget(agent, estimate)   → per-task, per-phase, per-month limits
// 3. enforceHITL(action, policy)    → may create gate, route to channels, pause
// 4. Agent executes                 → only if all checks pass
// 5. recordAudit(entry)             → immutable JSON lines, fire-and-forget
//
// Budget runs before HITL because HITL creates external workflows
// (Slack messages, Telegram callbacks). Budget check is O(1) in-memory.
// This prevents orphaned approval requests when budget would deny anyway.
```

### Telemetry Events (packages/core)

!!! note "Telemetry plane only"

    Events are for observability, audit, and dashboard updates. Coordination between spine stages uses typed LangGraph channels — see [vision.md Layer 2](../vision.md) and ADR-043.

```typescript
interface EventBus {
  publish(event: DomainEventInput): void;
  emit(event: DomainEventInput): void;  // alias for publish (ADR-003)
  subscribe<T>(eventType: T, handler: (event: DomainEvent) => void): void;
  unsubscribe<T>(eventType: T, handler: (event: DomainEvent) => void): void;
  clear(): void;
  history(filter?: EventFilter): DomainEvent[];
}
```

**Event Registry (31 domain events, flat payloads per ADR-002):**

| Category | Events |
|----------|--------|
| Agent Lifecycle | `AgentStarted`, `AgentCompleted`, `AgentFailed`, `AgentAborted` |
| Task Management | `TaskStatusChanged`, `TasksCreated` |
| Design Phase | `PageRequested`, `UXResearchComplete`, `WireframeComplete`, `WireframeApproved`, `VisualDesignComplete`, `DesignReviewComplete`, `DesignPhaseComplete` |
| Spec Phase | `SpecComplete` |
| Code Phase | `CodeGenComplete`, `TestsComplete`, `PRCreated`, `ReviewComplete`, `PRMerged` |
| CI/CD Phase | `CIResult`, `CIFailed`, `SecurityScanComplete`, `BuildFixComplete`, `DeployComplete`, `DeployFailed` |
| Spec Sync | `SpecLockAcquired`, `SpecLockReleased`, `SpecDriftDetected` |
| Governance & HITL | `HITLApprovalRequested`, `HITLApprovalReceived`, `HITLApproved`, `HITLTimeout`, `BudgetAlert`, `TrustEscalated` |

### MCP Client Interface (packages/core)

```typescript
interface MCPClient {
  callTool(server: string, method: string, params: Record<string, unknown>): Promise<Result<unknown>>;
  listTools(server: string): Promise<ToolDefinition[]>;
  isAvailable(server: string): Promise<boolean>;
}

// Middleware stack (applied in order on every MCP call):
// 1. Governance check  — permission validation, blocks before any external call
// 2. Authentication    — token injection from secret manager
// 3. Rate limiting     — token bucket per server, queues excess requests
// 4. Cache check       — returns cached response for idempotent reads
// 5. Retry wrapper     — exponential backoff (1s, 2s, 4s, 8s, 16s; max 5)
//    └── Actual MCP server call
// 6. Cache store       — stores response for reads (TTL: 5 min)
// 7. Observability     — trace ID, latency, logged to audit
```

### HITL Channel Interface (packages/channels)

Three structural HITL gates sit at spine stage boundaries (see [vision.md Layer 10](../vision.md)):

1. **Clarification gate** — after Clarifier produces questions, human answers before proceeding
2. **Design/API approval gate** — after Architect produces architecture spec, human approves before implementation
3. **Code merge gate** — after Reviewer validates changes, human approves merge

```typescript
interface HITLChannel {
  readonly type: ChannelType;       // 'slack' | 'telegram' | 'cli'
  readonly priority: number;
  readonly capabilities: 'full' | 'approvals' | 'basic';

  sendNotification(message: string, severity: 'info' | 'warning' | 'critical'): Promise<Result<ChannelMessageRef>>;
  requestApproval(task: TaskSummary, context: ApprovalContext): Promise<Result<ChannelMessageRef>>;
  onDecision(callback: (taskId: string, decision: HITLDecision, feedback?: string) => void): void;
  updateStatus(ref: ChannelMessageRef, status: TaskStatus): Promise<Result<void>>;
  isAvailable(): Promise<boolean>;
}

// RichHITLChannel extends with: task boards, code previews, threads
// Channel router supports 'all' vs 'primary' routing, first-response-wins for approvals
```

## Typical Workflow: Feature Through the Spine

A feature — e.g., "add a user settings page" — flows through the four-stage spine. Each stage produces a typed artifact and hands off through Zod-typed LangGraph channels.

### Stage 1: Clarifier (built)

The Clarifier takes a natural-language requirement and runs a 9-node LangGraph StateGraph: gap detection, question generation, critic review, answer integration, and PRD drafting. It produces an enriched requirement and assumption ledger. The human answers clarifying questions at HITL gate 1 (LangGraph interrupt) before the pipeline proceeds.

See [Clarifier Pipeline](../concepts/clarifier-pipeline.md) for node-level detail.

### Stage 2: Architect

!!! note "Planned"

    The Architect stage is designed but not yet implemented. See [vision.md Layer 7](../vision.md) for the target design.

The Architect reads the enriched requirement from Stage 1 and produces an architecture spec, ADRs, and a task plan with dependency graph. The human approves the architecture at HITL gate 2 before implementation begins.

### Stage 3: Implementer

!!! note "Planned"

    The Implementer stage is designed but not yet implemented. See [vision.md Layer 8](../vision.md) for the target design.

The Implementer executes tasks from the Architect's plan in sequence — one task at a time, single-threaded per artifact. It reads spec, generates code, runs tests, and pushes to a feature branch. Task-level parallelism uses git worktrees, not concurrent agents writing to the same files.

### Stage 4: Reviewer

!!! note "Planned"

    The Reviewer stage is designed but not yet implemented. See [vision.md Layer 9](../vision.md) for the target design.

The Reviewer performs a fresh-context diff review: deterministic gates first (type check, lint, test pass), then LLM review for logic, security, and spec compliance. The human approves the merge at HITL gate 3.

See [CHIP's Spine Implementation](spine-implementation.md) for per-stage internals, context handoffs, and HITL gate mechanics.

## Cross-Cutting Concerns

### Governance Pipeline (every agent execution)

```
Agent task ready to execute
  │
  ├─→ 1. checkPermission(agent, action)
  │      deny-list checked first (overrides allow)
  │      allow-list checked (supports wildcards)
  │      → PERMISSION_DENIED if neither matches
  │
  ├─→ 2. checkBudget(agent, estimate)
  │      per-task limit (from agent contract)
  │      per-phase limit (from agentforge.yaml)
  │      monthly limit (from agentforge.yaml)
  │      → BUDGET_EXCEEDED_TASK / PHASE / MONTHLY
  │      → BudgetAlert event at threshold (e.g., 80%)
  │
  ├─→ 3. enforceHITL(action, policy)
  │      Policy levels: full_approval → review_and_override → notify_only → fully_autonomous
  │      Routes to channels via channel router
  │      May pause execution and wait for human decision
  │      Supports trust escalation (consecutive approvals → lower HITL level)
  │
  ├─→ 4. Agent executes (only if all checks pass)
  │
  └─→ 5. recordAudit(entry)
         Immutable JSON lines: agent, action, outcome, cost, decision, approver
```

### Error Handling

All public APIs use the Result pattern — never throw. See [Error Handling](error-handling.md).

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: ChipError };

interface ChipError {
  code: string;              // e.g., 'PERMISSION_DENIED', 'BUDGET_EXCEEDED_TASK'
  message: string;
  context?: Record<string, unknown>;
  recoverable: boolean;
  agentId?: string;
  taskId?: string;
}
```

## Architecture Decision Records

| ADR | Decision |
|-----|----------|
| [ADR-002](../adrs/ADR-002-event-payload-structure.md) | Flat event payloads (no nested `payload` field) |
| [ADR-003](../adrs/ADR-003-event-bus-method-naming.md) | Both `publish()` and `emit()` on event bus |
| [ADR-004](../adrs/ADR-004-governance-middleware-ordering.md) | Governance ordering: permission → budget → HITL |
| [ADR-022](../adrs/ADR-022-typescript-only-orchestration-engine.md) | TypeScript-only orchestration (Phase 1). Superseded by ADR-043 |
| [ADR-043](../adrs/ADR-043-typescript-only-orchestration.md) | Deprecate Python engine, commit to @langchain/langgraph (TypeScript) |
| [ADR-044](../adrs/ADR-044-design-phase-state-in-agents-ux.md) | DesignPhaseState lives in agents-ux, not core |
| [ADR-045](../adrs/ADR-045-evaluator-deferred-to-phase-2.md) | evaluatorNode returns undefined in Phase 1 |
| [ADR-046](../adrs/ADR-046-langfuse-observability.md) | Langfuse observability — Phase 7 pull-forward |
| [ADR-047](../adrs/ADR-047-browser-default-design-tool.md) | Browser as default design tool |
| [ADR-048](../adrs/ADR-048-feedback-loop-strategy.md) | Feedback loop strategy |
| [ADR-049](../adrs/ADR-049-stage-7-dashboard-deferral.md) | Stage 7 dashboard deferral |
| [ADR-050](../adrs/ADR-050-runs-page-vision-deviations.md) | Runs page — deferred vision Layer 14 decisions |
| [ADR-051](../adrs/ADR-051-backstage-developer-portal.md) | Backstage developer portal |

For the complete list, see the [ADR index](../_generated/adr-index.md).

## Related

- [The Spine Pattern](spine-pattern.md) — why single-writer sequential
- [CHIP's Spine Implementation](spine-implementation.md) — per-stage node sequences and context handoffs
- [Architecture at a Glance](vision-overview.md) — layer summary
- [Agent Taxonomy](../concepts/agent-taxonomy.md) — spine + specialist roles
- [Clarifier Pipeline](../concepts/clarifier-pipeline.md) — first stage detail
- [Error Handling](error-handling.md) — Result pattern and error codes
