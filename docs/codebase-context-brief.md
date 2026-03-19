# AgentForge Codebase Context Brief

**Purpose**: This document gives Claude Code the ground truth about the existing implementation so it can produce a plan that builds on what exists rather than reinventing it. Read this alongside the UX Agent Architecture Blueprint v1.0 and the PRD v2.0.

---

## 1. Repository structure

```
sdlc-agent-swarms/
├── CLAUDE.md                          # Development rules (MUST READ FIRST)
├── agentforge.yaml                    # Project manifest (Phase 1 stack: React+Node+PG+Tailwind)
├── agentforge.tasks.yaml              # Task state file (currently empty)
├── agentforge/
│   ├── agents.yaml                    # 7 registered agent contracts (V2 SDLC agents)
│   └── spec/                          # Living Spec (pages.yaml, api.yaml, models.yaml, project.yaml)
├── docs/
│   ├── PRD-v2.md                      # Product Requirements Document v2.0 Final
│   ├── architecture.md                # Layer diagram and design principles
│   ├── agent-contracts.md             # Contract specification reference
│   ├── adrs/                          # 20 Architecture Decision Records (ADR-002 through ADR-020)
│   └── lessons-learned.md             # Repo-local memory for Claude Code
├── packages/
│   ├── core/                          # @agentforge/core — zero external deps (yaml, eventemitter3)
│   ├── governance/                    # @agentforge/governance — depends on core
│   ├── providers/                     # @agentforge/providers — LLM provider adapters
│   ├── channels/                      # @agentforge/channels — Slack, Telegram, CLI
│   ├── cli/                           # @agentforge/cli — Commander.js CLI
│   ├── agents-design/                 # @agentforge/agents-design — 4 design phase agents
│   ├── agents-spec/                   # @agentforge/agents-spec — spec + task decomposition
│   ├── agents-code/                   # @agentforge/agents-code — codegen + tests + reviewer
│   ├── agents-cicd/                   # @agentforge/agents-cicd — build, security, deploy
│   ├── stacks/                        # Prompt template registries per stack
│   ├── e2e-test/                      # End-to-end test harness
│   └── integration-tests/             # Integration test suite
├── services/
│   └── engine/                        # Orchestration engine (NOTE: Python+LangGraph per CLAUDE.md)
├── nx.json                            # Nx workspace config (@nx/js/typescript plugin)
├── tsconfig.base.json                 # Base TypeScript config (strict: true)
└── package.json                       # Root package (React 18, Next 14, Express 4, Prisma 5)
```

**Key insight**: There is NO `packages/dashboard/` yet. The V3 dashboard is completely greenfield. It needs to be created as a new Nx package.

---

## 2. Package dependency graph

```
core (zero deps) ← governance ← providers ← channels ← cli
                 ↖ agents-design
                 ↖ agents-spec
                 ↖ agents-code
                 ↖ agents-cicd
```

The new `packages/agents-ux/` and `packages/dashboard/` will follow this same pattern:
- `agents-ux` depends on: core, governance, providers (same as all agent packages)
- `dashboard` depends on: core (for types/events), plus React/Tailwind/ShadCN as its own deps

---

## 3. Existing agent contract pattern (FOLLOW THIS EXACTLY)

Every agent in the codebase follows a 4-part pattern. Here is the canonical example from `packages/agents-design/src/ux-researcher/ux-researcher.ts`:

### Part 1: Contract constant
```typescript
export const UX_RESEARCHER_CONTRACT: AgentContract = {
  role: 'ux_researcher',
  description: 'Analyzes page descriptions and produces UX layout suggestions',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 20000 },
  tools: [],
  permissions: ['read_spec', 'read_design'],
  denied: [],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 20000, max_cost_per_task_usd: 0.5 },
  on_complete: 'UXResearchComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};
```

### Part 2: Work function (typed via AgentWorkFn<TInput, TOutput>)
```typescript
export const uxResearcherWork: AgentWorkFn<UXResearcherInput, UXResearcherOutput> = async (
  input, provider, learnings, context
) => {
  // 1. Read existing specs for context
  // 2. Build prompt (system + user message + learnings)
  // 3. Call LLM via provider.complete()
  // 4. Parse output into typed result
  return Ok(parsedOutput);
};
```

### Part 3: Execute function (wraps runAgent)
```typescript
export const executeUXResearcher = async (
  contract: AgentContract, context: AgentContext, input: UXResearcherInput
): Promise<Result<unknown>> => {
  return runAgent(contract, context, input, 'read_design', `page:${input.pageId}`,
    `UX research for page: ${input.description}`, uxResearcherWork);
};
```

### Part 4: Register function (subscribes to event bus)
```typescript
export const registerUXResearcher = (
  eventBus: EventBus, context: AgentContext, contract: AgentContract = UX_RESEARCHER_CONTRACT
): void => {
  eventBus.subscribe('PageRequested', (event) => {
    void executeUXResearcher(contract, context, {
      pageId: event.pageId, taskId: event.taskId, description: event.description
    });
  });
};
```

### Export pattern (via index.ts barrel)
```typescript
export type { UXResearcherInput, UXResearcherOutput } from './ux-researcher/ux-researcher.js';
export { UX_RESEARCHER_CONTRACT, uxResearcherWork, executeUXResearcher, registerUXResearcher }
  from './ux-researcher/ux-researcher.js';
```

**EVERY new UX agent must follow this exact pattern.**

---

## 4. Current agents.yaml (7 V2 agents registered)

```yaml
version: "1.0"
agents:
  - role: ux_researcher          # design phase
  - role: wireframer             # design phase
  - role: spec_writer            # spec phase
  - role: task_decomposer        # spec phase
  - role: code_generator         # code phase
  - role: test_writer            # code phase
  - role: code_reviewer          # code phase
```

The 5 new UX squad agents need to be ADDED here, not replace these. Use a new category value — the AgentContract type supports: `'design' | 'spec' | 'code' | 'cicd' | 'observe' | 'research'`. The UX squad agents should use `'design'` category since they're design-phase agents.

---

## 5. Event bus — existing 32 event types

The event bus is in `packages/core/src/events/event-bus.ts`. It's an in-memory EventEmitter with:
- `publish(event)` / `emit(event)` — auto-generates event_id if absent
- `subscribe(eventType, handler)` — type-safe narrowing via discriminated union
- `history({ type?, after? })` — bounded FIFO buffer (default 1000)

All 32 events are defined in `packages/core/src/events/domain-events.ts` as a discriminated union (`DomainEvent`). Every event extends `BaseDomainEventFields`:
```typescript
interface BaseDomainEventFields {
  readonly event_id: string;   // auto-generated UUID
  readonly source: string;     // e.g. "agent:ux_researcher", "orchestrator"
  readonly timestamp: number;  // Unix epoch ms
}
```

**To add the 6 new UX squad events**, add new interfaces to `domain-events.ts` and add them to the `DomainEvent` union type. Follow the exact pattern of existing events.

---

## 6. MCP client — existing adapter layer

The MCP client is in `packages/core/src/mcp/mcp-client.ts`. Interface:
```typescript
interface MCPClient {
  callTool(server: string, method: string, params: Record<string, unknown>): Promise<Result<unknown>>;
  listTools(server: string): Promise<Result<readonly ToolDefinition[]>>;
  isAvailable(server: string): Promise<boolean>;
}
```

All calls go through a middleware pipeline: governance → auth → rateLimit → cache → retry → observability (per ADR-018). The FigmaAdapter already wraps this for design operations via the `DesignSurface` interface.

**For the UX squad**: The existing FigmaAdapter + MCPClient are sufficient. New Figma MCP tools (get_variable_defs, get_code_connect_map, generate_figma_design) are just new method names passed to `callTool('figma', 'method_name', params)`. No new adapter classes needed — just new tool method calls within agent work functions.

---

## 7. Governance — the middleware chain

Governance is middleware, not a service. Order is enforced per ADR-004:
1. `checkPermission(contract, action)` → Allow | Deny
2. `checkBudget(agent, estimatedCost)` → Allow | Deny  
3. `enforceHITL(action)` → Proceed | Pause | Notify

The `AgentActionType` enum in governance types defines valid permission strings:
```typescript
type AgentActionType =
  | 'read_spec' | 'write_spec' | 'read_design' | 'write_design'
  | 'read_code' | 'write_code' | 'read_design_system' | 'create_branch'
  | 'create_pr' | 'merge_pr' | 'trigger_ci' | 'read_ci_logs'
  | 'deploy_staging' | 'deploy_production' | 'send_notification' | 'write_tasks';
```

**For the UX squad**: New permission types may be needed (e.g., `'write_review'`, `'write_test'`, `'read_rendered_ui'`). Add them to the `AgentActionType` union.

---

## 8. Design surface interface

The `DesignSurface` interface in `packages/agents-design/src/design-surface.ts` abstracts design tool operations:
```typescript
interface DesignSurface {
  createWorkspace(projectName: string): Promise<Result<string>>;
  readDesign(pageId: string): Promise<Result<DesignContext>>;
  writeDesign(spec: DesignSpec): Promise<Result<void>>;
  getTokens(): Promise<Result<DesignTokens>>;
  onUserEdit(callback: (change: DesignChange) => void): void;
  lockForAgent(agentId: string): Result<void>;
  unlockForAgent(agentId: string): Result<void>;
}
```

The FigmaAdapter implements this using MCP calls. The UX squad agents can use this same interface — they don't need to know about the underlying MCP transport.

---

## 9. Code conventions (from CLAUDE.md)

- Strict TypeScript (`strict: true`, no `any`)
- Functional style, avoid classes except where interfaces demand it
- All public APIs must have JSDoc comments
- Every module exports via `index.ts` barrel file
- Error handling: Result pattern (never throw) — `Ok(value)` or `Err(error)`
- File naming: kebab-case for files, PascalCase for types/interfaces
- Test files go next to source files (`foo.ts` → `foo.test.ts`)
- Tests must exercise real server/API codepath, not internal functions directly
- PRD deviations documented as ADRs in `docs/adrs/`
- After every task, document what didn't work in lessons-learned.md

---

## 10. Testing infrastructure

- Jest + ts-jest for all packages
- Tests colocated with source files
- Commands: `nx test core`, `nx test agents-design`, `nx run-many -t test`
- Integration tests in `packages/integration-tests/`
- E2E tests in `packages/e2e-test/`
- 710 tests passing, 0 failures at V2 certification

---

## 11. What needs to be created (scope for Claude Code)

### New packages
1. `packages/agents-ux/` — The 5 UX squad agents (research, planning, implementation, review, testing)
2. `packages/dashboard/` — React 19 + Tailwind + ShadCN/UI web dashboard

### New files in existing packages
3. `packages/core/src/events/domain-events.ts` — Add 6 new event types to the DomainEvent union
4. `packages/governance/src/types.ts` — Add new AgentActionType values if needed
5. `agentforge/agents.yaml` — Add 5 new agent entries

### New documentation
6. `docs/adrs/ADR-023-ux-squad-architecture.md` — Documents the 5-agent UX squad design decision
7. `docs/adrs/ADR-024-dashboard-greenfield.md` — Documents the dashboard tech choices

---

## 12. Budget configuration note

The current `agentforge.yaml` sets `per_phase_max_usd: 25`. The blueprint recommends overriding this to $60 for UX phases. This is a YAML config change, not a code change:
```yaml
budget:
  per_task_max_usd: 2.00
  per_phase_max_usd: 60.00  # Override for UX squad
  monthly_max_usd: 200.00
  alert_threshold: 0.8
```
