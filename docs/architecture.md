# AgentForge Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  CLI Layer (TypeScript / Commander.js)                       │
│  packages/cli                                                │
│  Commands: init, start, status, approve, abort, migrate, design │
├─────────────────────────────────────────────────────────────┤
│  Orchestration Layer                                         │
│  services/engine (Python / LangGraph)                        │
│  Workflow graphs per SDLC phase, state persistence,          │
│  task dependency resolution, phase transitions                │
├───────────────┬─────────────────────┬───────────────────────┤
│ Agent Runtime │  Governance Layer   │  Integration Layer     │
│ packages/     │  packages/governance│  packages/channels     │
│ agents-*      │  (MIDDLEWARE)       │  packages/providers    │
│               │                     │                        │
│ Agent         │  Permission check   │  MCP clients           │
│ lifecycle,    │  HITL enforcement   │  Slack Block Kit       │
│ context       │  Budget tracking    │  Telegram Bot API      │
│ injection,    │  Audit logging      │  CLI fallback          │
│ learnings     │  Circuit breakers   │  LLM adapters          │
├───────────────┴─────────────────────┴───────────────────────┤
│  Event Bus (in-memory v1, Redis Streams v2)                  │
├─────────────────────────────────────────────────────────────┤
│  State Store                                                 │
│  YAML files in git (v1) / PostgreSQL (v2)                    │
│  agentforge.yaml | spec/*.yaml | agentforge.tasks.yaml       │
└─────────────────────────────────────────────────────────────┘
```

## API Contracts Between Layers

### Orchestrator Interface (services/engine -> packages/core)

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
  designContext?: DesignRef; // Figma context if applicable
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

interface GovernanceMiddleware {
  checkPermission(agent: AgentContract, action: AgentAction): Result<void>;
  enforceHITL(action: AgentAction, policy: HITLPolicy): Promise<HITLResult>;
  checkBudget(agent: AgentContract, estimated: CostEstimate): Result<void>;
  recordAudit(entry: AuditEntry): void;
}

type HITLResult =
  | { status: 'proceed' }
  | { status: 'pause'; gateId: string; channels: MessageRef[] }
  | { status: 'notify'; channels: MessageRef[] }
  | { status: 'denied'; reason: string };

// Execution flow:
// 1. checkPermission(agent, action) -> if Deny, block immediately
// 2. checkBudget(agent, estimate) -> if Deny, block immediately
// 3. enforceHITL(action, policy) -> may pause and wait for approval
// 4. agent executes (only if all checks pass)
// 5. recordAudit(entry)
```

### Event Bus Interface (packages/core)

```typescript
interface EventBus {
  emit(event: DomainEvent): void;
  subscribe(eventType: string, handler: EventHandler): Unsubscribe;
  history(filter?: EventFilter): DomainEvent[];
}

interface DomainEvent {
  type: string;              // e.g., 'DesignPhaseComplete'
  source: string;            // agent ID that emitted
  timestamp: Date;
  payload: Record<string, unknown>;
  specRef?: string;          // affected spec file
  taskId?: string;           // related task
}

// Key events (canonical registry — all domain events with payload types):
//
// Design Phase:
// PageRequested        { description: string, pageId: string }
// UXResearchComplete   { pageId: string, recommendations: string[] }
// WireframeComplete    { pageId: string, designRef: string }
// WireframeApproved    { pageId: string, designRef: string, feedback?: string }
// VisualDesignComplete { pageId: string, designRef: string, tokensApplied: string[] }
// DesignReviewComplete { pageId: string, passed: boolean, findings: ReviewFinding[] }
// DesignPhaseComplete  { specRef: string }
//
// Spec Phase:
// SpecComplete         { specRef: string, componentsCount: number, endpointsCount: number, modelsCount: number }
// TasksCreated         { taskCount: number, taskIds: string[] }
//
// Code Generation Phase:
// CodeGenComplete      { taskId: string, branch: string, filesChanged: number }
// TestsComplete        { taskId: string, branch: string, testCount: number }
// PRCreated            { taskId: string, prNumber: number, branch: string }
// PRMerged             { taskId: string, prNumber: number, branch: string }
// ReviewComplete       { taskId: string, prNumber: number, decision: 'approved' | 'changes_requested' }
// SecurityScanComplete { prNumber: number, findingsCount: number, criticalCount: number, passed: boolean }
//
// CI/CD Phase:
// CIResult             { taskId: string, passed: boolean, logs?: string, duration: number }
// CIFailed             { taskId: string, runId: string, logs: string }
// BuildFixComplete     { taskId: string, fixApplied: boolean }
// DeployComplete       { environment: 'staging' | 'production', version: string }
// DeployFailed         { environment: string, reason: string }
//
// Spec Sync:
// SpecDriftDetected    { specRef: string, deviationType: 'minor' | 'significant', description: string }
//
// Governance & HITL:
// HITLApproved         { gateId: string, decision: HITLDecision, feedback?: string, source: string }
// HITLTimeout          { gateId: string, escalatedTo: string }
// BudgetAlert          { level: 'task' | 'phase' | 'project', current: number, limit: number }
// TrustEscalated       { agentRole: string, previousLevel: HITLLevel, newLevel: HITLLevel, consecutiveApprovals: number }
//
// Agent Lifecycle:
// AgentAborted         { agentId: string, taskId: string, reason: string }
```

### MCP Client Interface (packages/core)

```typescript
interface MCPClient {
  callTool(server: string, method: string, params: Record<string, unknown>): Promise<Result<unknown>>;
  listTools(server: string): Promise<ToolDefinition[]>;
  isAvailable(server: string): Promise<boolean>;
}

// Adapter pattern: agents never call MCP directly.
// They go through the adapter which adds middleware in this exact order:
//
// 1. Governance check (permission validation — blocks before any external call)
// 2. Authentication (token injection from secret manager)
// 3. Rate limiting (token bucket per server, queues excess requests)
// 4. Cache check (returns cached response for idempotent reads; skipped for writes)
// 5. Retry wrapper (exponential backoff: 1s, 2s, 4s, 8s, 16s; max 5 retries)
//    └── Actual MCP server call happens here
// 6. Cache store (stores response for idempotent reads; TTL: 5 min)
// 7. Observability (trace ID, latency, success/failure logged to audit)
//
// If governance denies: returns immediately, no external call made.
// If auth missing: passes through for servers that don't require it; errors for those that do.
// If rate limited: request is queued, not rejected.
// If all retries fail: returns MCP_UNAVAILABLE error.
```

## Communication Flow

```
Agent A finishes task
  -> Agent Runtime emits event via Event Bus
  -> Orchestrator receives event
  -> Orchestrator checks task dependency graph
  -> Orchestrator identifies next runnable tasks
  -> For each next task:
     -> Governance: checkPermission
     -> Governance: checkBudget
     -> Governance: enforceHITL (may pause here)
     -> Agent Runtime: executeAgent with fresh context
     -> Agent reads spec files, generates output
     -> Output pushed to git branch
     -> CI triggered (GitHub Actions sandbox)
     -> CI result event emitted
     -> If passed: PR created, reviewer agent triggered
     -> If failed: coding agent retries (max 3)
```

## Python-TypeScript Event Bridge

The orchestration engine (Python/LangGraph) and the agent packages (TypeScript) both need to emit and subscribe to events on the shared event bus. In Phase 1, they run as separate processes on the same machine.

```
Phase 1 Bridge: File-based event transport
  - Shared event file: .agentforge/events.jsonl
  - TypeScript event bus adapter watches the file for new lines (fs.watch + tail)
  - Python engine appends events as JSON lines and polls for incoming events
  - Each line: { type, source, timestamp, payload, specRef?, taskId? }
  - File is append-only during a phase run, truncated on phase start
  - Delivery guarantee: at-least-once (both sides track last-read offset)

Phase 2 replacement: Redis Streams
  - Both Python and TypeScript become native Redis consumers
  - Same DomainEvent schema, different transport
  - The event bridge adapter in packages/core is swappable without changing agent code
```

## Package Dependency Graph

```
core (zero deps)
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

Build order: core -> governance, providers (parallel) -> channels -> agents-* (parallel) -> cli
