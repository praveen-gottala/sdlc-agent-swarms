# CHIP Architecture

## System Overview

AgentForge is a multi-agent framework that orchestrates the full software development lifecycle (SDLC) — from design through deployment — using coordinated AI agents governed by human-in-the-loop (HITL) policies, budget controls, and permission boundaries.

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLI Layer (TypeScript / Commander.js)                               │
│  packages/cli                                                        │
│  Commands: init, start, status, approve, abort, migrate, config,     │
│            design                                                    │
├──────────────────────────────────────────────────────────────────────┤
│  Orchestration Layer — @langchain/langgraph (TypeScript)             │
│  Target: packages/core + @langchain/langgraph (see ADR-043)         │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │  Design   │ │   Spec   │ │   Code   │ │   CICD   │ │  Observe  │ │
│  │  Phase    │ │  Phase   │ │   Gen    │ │  Phase   │ │  Phase    │ │
│  │  Graph    │ │  Graph   │ │  Graph   │ │  Graph   │ │  Graph    │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
│  StateGraph topology, typed Zod state channels, HITL interrupt      │
│  nodes, MemorySaver/PostgresSaver checkpointing, concurrency        │
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
│  Event Bus (telemetry plane only — NOT coordination substrate)        │
│  In-memory EventEmitter (v1) / Redis Streams (v2)                    │
│  31 typed domain events, flat payloads (ADR-002)                     │
│  Coordination uses typed LangGraph channels (ADR-043, vision L2)     │
├──────────────────────────────────────────────────────────────────────┤
│  State Store                                                         │
│  YAML files in git (v1) / PostgreSQL (v2)                            │
│  agentforge.yaml  — project manifest & configuration                 │
│  agentforge.tasks.yaml — task entries with status, cost, deps        │
│  spec/*.yaml — living spec (components, api, models)                 │
│  .agentforge/learnings.yaml — agent observations                     │
│  .agentforge/audit.jsonl — immutable audit trail                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
agentforge/
├── packages/
│   ├── core/                  # Types, event bus, state management, agent runtime,
│   │                          # MCP client, config loader, spec sync, lock manager
│   ├── governance/            # Middleware: permission, budget, HITL, audit
│   ├── providers/             # LLM adapters (Claude, OpenAI), cost tables
│   ├── channels/              # HITL channels (Slack, Telegram, CLI), channel router
│   ├── cli/                   # Commander.js CLI (8 commands)
│   ├── agents-design/         # Design agent (UX research, wireframe, visual)
│   ├── agents-spec/           # Spec writer (components, API, models)
│   ├── agents-code/           # Code generator (frontend, backend, tests)
│   ├── agents-cicd/           # CI/CD agent (lint, security, build fix, deploy)
│   ├── agents-observe/        # Observability agent (logs, metrics, health)
│   ├── integration-tests/     # End-to-end tests against real server endpoints
│   ├── e2e-test/              # E2E test harness
│   └── stacks/
│       └── react-node-prisma/ # Scaffold template for generated projects
├── services/
│   └── engine/                # DEPRECATED — Python LangGraph prototype (stub agents only)
│                              # Scheduled for deletion per ADR-043. Do not extend.
└── docs/
    ├── PRD-v2.md              # Product requirements (source of truth)
    ├── architecture.md        # This file
    └── adrs/                  # Architecture Decision Records
```

## Package Dependency Graph

```
core (zero external deps beyond yaml, eventemitter3)
  ├── governance (depends on core)
  ├── providers (depends on core)
  ├── channels (depends on core)
  ├── agents-design (depends on core, governance, providers)
  ├── agents-spec (depends on core, governance, providers)
  ├── agents-code (depends on core, governance, providers)
  ├── agents-cicd (depends on core, governance, providers)
  ├── agents-observe (depends on core, governance, providers)
  └── cli (depends on core, governance, providers, channels)
```

Build order: `core` → `governance`, `providers` (parallel) → `channels` → `agents-*` (parallel) → `cli`

## API Contracts Between Layers

### Orchestrator Interface (@langchain/langgraph TypeScript — ADR-043)

```typescript
interface Orchestrator {
  startPhase(phase: SDLCPhase, config: PhaseConfig): Promise<Result<void>>;
  getStatus(): Promise<ProjectState>;
  pausePhase(phase: SDLCPhase): Promise<Result<void>>;
  resumePhase(phase: SDLCPhase): Promise<Result<void>>;
  approveGate(gateId: string, decision: HITLDecision): Promise<Result<void>>;
}

type SDLCPhase = 'design' | 'spec' | 'code' | 'cicd' | 'observe';

interface PhaseConfig {
  agents: AgentContract[];
  hitlPolicy: HITLPolicy;
  budget: BudgetConfig;
  concurrency: number;
}
```

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
  events: DomainEvent[];     // events to emit
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

### Event Bus Interface (packages/core)

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

## Typical Workflow: Feature from Design to Deploy

The following walkthrough traces a single feature — e.g., "add a user settings page" — through the entire AgentForge pipeline.

### 1. Project Initialization

```
$ agentforge init
```

Interactive wizard creates `agentforge.yaml` (project manifest), configures stack, channels, budget limits, and HITL policies. The project is now ready for agent orchestration.

### 2. Design Phase

```
$ agentforge design "user settings page with profile editing and notification preferences"
```

```
                         ┌──────────────┐
                         │ PageRequested│
                         │    event     │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  UX Research │ Agent analyzes requirements,
                         │    Agent     │ produces recommendations
                         └──────┬───────┘
                                │ UXResearchComplete event
                         ┌──────▼───────┐
                         │  Wireframe   │ Agent generates wireframe
                         │    Agent     │ layout from recommendations
                         └──────┬───────┘
                                │ WireframeComplete event
                     ┌──────────▼──────────┐
                     │   HITL Gate:        │ Human reviews wireframe
                     │   human_review      │ via Slack / Telegram / CLI
                     └──────────┬──────────┘
                       ┌────────┼────────┐
                       │        │        │
                  approved  changes   rejected
                       │    requested    │
                       │        │        └──→ abort
                       │        └──→ back to Wireframe Agent
                       │
                ┌──────▼───────┐
                │Visual Design │ Agent applies design tokens,
                │    Agent     │ produces final visual design
                └──────┬───────┘
                       │ VisualDesignComplete event
                ┌──────▼───────┐
                │Design Review │ Automated review for
                │    Agent     │ consistency & accessibility
                └──────┬───────┘
                       │ DesignReviewComplete event
            ┌──────────▼──────────┐
            │   HITL Gate:        │ Final human approval
            │   human_approve     │
            └──────────┬──────────┘
                       │ approved
                       │
                DesignPhaseComplete event
                → spec/*.yaml updated with design refs
```

### 3. Spec Phase

```
$ agentforge start spec
```

```
    DesignPhaseComplete event triggers spec phase
                       │
                ┌──────▼───────┐
                │  Spec Writer │ Reads design output, generates:
                │    Agent     │   spec/components.yaml
                │              │   spec/api.yaml
                │              │   spec/models.yaml
                └──────┬───────┘
                       │ SpecComplete event
                ┌──────▼───────┐
                │ Task Planner │ Decomposes spec into tasks
                │              │ with dependency graph
                └──────┬───────┘
                       │ TasksCreated event
                       │ → agentforge.tasks.yaml populated
```

### 4. Code Generation Phase

```
$ agentforge start code
```

```
    TasksCreated event triggers code phase
    Task resolver identifies runnable tasks (deps satisfied)
                       │
         ┌─────────────┼─────────────┐  (concurrent execution
         │             │             │   up to max_concurrent_agents)
  ┌──────▼──────┐┌────▼────┐┌──────▼──────┐
  │  Frontend   ││ Backend ││   Test      │  Each agent:
  │  Coder      ││ Coder   ││  Writer     │  1. Reads spec from spec/*.yaml
  │  Agent      ││ Agent   ││  Agent      │  2. Generates code on feature branch
  └──────┬──────┘└────┬────┘└──────┬──────┘  3. Emits CodeGenComplete / TestsComplete
         │            │            │
         └─────────┬──┘            │
                   │               │
         ┌─────────▼───────────────▼─┐
         │  For each completed task: │
         │  1. Push to feature branch│
         │  2. CI triggered          │
         │  3. CIResult event        │
         └─────────┬─────────────────┘
                   │
            ┌──────▼──────┐
            │ CI Passed?  │
            └──────┬──────┘
              yes  │  no → coding agent retries (max 3 attempts)
                   │
            ┌──────▼──────┐
            │  PR Created │ PRCreated event
            └──────┬──────┘
                   │
            ┌──────▼──────┐
            │  Reviewer   │ Code review agent
            │  Agent      │
            └──────┬──────┘
                   │ ReviewComplete event
        ┌──────────▼──────────┐
        │   HITL Gate:        │ Human reviews PR
        │   approval_request  │
        └──────────┬──────────┘
              approved → PRMerged event
```

### 5. CI/CD Phase

```
$ agentforge start cicd
```

```
    PRMerged events trigger CI/CD phase
                       │
         ┌─────────────┼─────────────┐
         │             │             │
  ┌──────▼──────┐┌────▼────┐┌──────▼───────┐
  │    Lint     ││Security ││    Build     │
  │   Check     ││  Scan   ││   & Test     │
  └──────┬──────┘└────┬────┘└──────┬───────┘
         │            │            │
         │    SecurityScanComplete │
         │            │            │
         └─────────┬──┘────────────┘
                   │
            ┌──────▼──────┐
            │ All passed? │
            └──────┬──────┘
              yes  │  no → BuildFixComplete (auto-fix agent, max retries)
                   │
            ┌──────▼──────────┐
            │ Deploy Staging  │ DeployComplete event
            └──────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   HITL Gate:        │ Human approves prod deploy
        │   deploy_approval   │
        └──────────┬──────────┘
                   │
            ┌──────▼──────────┐
            │Deploy Production│ DeployComplete event
            └─────────────────┘
```

### 6. Observe Phase

```
$ agentforge start observe
```

Post-deployment monitoring: the observe agent watches logs, metrics, and health endpoints, emitting alerts if anomalies are detected. Spec drift detection compares live behavior against the Living Spec.

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

All public APIs use the Result pattern — never throw. See `docs/architecture/error-handling.md`.

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: AgentForgeError };

interface AgentForgeError {
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
| [ADR-002](adrs/ADR-002-event-payload-structure.md) | Flat event payloads (no nested `payload` field) |
| [ADR-003](adrs/ADR-003-event-bus-method-naming.md) | Both `publish()` and `emit()` on event bus |
| [ADR-004](adrs/ADR-004-governance-middleware-ordering.md) | Governance ordering: permission → budget → HITL (budget before HITL) |
| [ADR-022](adrs/ADR-022-typescript-only-orchestration-engine.md) | TypeScript-only orchestration (Phase 1). Superseded by ADR-043. |
| [ADR-043](adrs/ADR-043-typescript-only-orchestration.md) | Deprecate Python engine, commit to @langchain/langgraph (TypeScript) |
