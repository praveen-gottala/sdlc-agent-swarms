# R6: Spec-Driven Development Methodology

**Question:** How specific do Architect contracts need to be for independent Implementer agents to produce compatible code? What is the minimum viable contract that prevents drift without over-constraining?

**Blocks:** M3 (Architect Core — Nodes 1-5 + shared module extraction)

## Architecture Context

CHIP's spine separates planning (Architect) from execution (Implementer). The Architect produces a `ContractBundle` — typed schemas that the Implementer consumes. The question is granularity:

- **Too vague:** "Build an expense API" → agents produce incompatible interfaces
- **Too specific:** Full pseudocode with line-by-line instructions → Architect does the Implementer's job
- **Right level:** Contracts specify WHAT (interfaces, schemas, behaviors) but not HOW (implementation patterns, variable names, internal structure)

## The Contract Bundle (what the Architect produces)

```typescript
interface ContractBundle {
  architectureSpec: ArchitectureSpec;        // system overview, components, integrations
  adrs: ADR[];                               // one per load-bearing decision
  dataModel?: {                              // concrete column types, indexes
    entities: Array<{
      name: string;
      fields: Array<{ name: string; type: string; nullable: boolean; }>;
      indexes: string[];
      constraints: string[];
    }>;
    migrations: string[];                    // migration SQL or ORM
  };
  apiContracts?: OpenAPISpec;                // OpenAPI 3.1 fragments
  componentComposition?: {                   // component hierarchy
    screens: Array<{
      id: string;
      components: ComponentTreeNode[];       // name, props, children, navigateTo
      tokenBindings: Record<string, string>; // component.property → token path
    }>;
  };
  screenSpecs?: ScreenPlan[];                // screen-level specs
  designSystemDiff?: DesignSystemDiff;       // token additions/modifications
  taskPlan: TaskPlan;                        // DAG with file ownership
  assumptionLedger: AssumptionLedger;        // all decisions with evidence
}
```

## The Compatibility Problem

When T3 (Expense API) and T4 (Budget API) run in parallel, they must produce compatible code:
- Same error handling patterns
- Same response envelope shapes
- Same authentication middleware usage
- Compatible database transaction patterns

The contracts specify the API shapes (OpenAPI) and data model. But implementation patterns (error handling, middleware, logging) are NOT in the contracts. Options:

1. **Add implementation patterns to ArchitectureSpec** (e.g., "all endpoints use Result pattern, errors return `{ error: string, code: number }`)
2. **Let the first task establish patterns, subsequent tasks follow** (git merge provides context)
3. **Include "style guide" in the ContractBundle** — coding conventions document

## Real Data: What CHIP Already Specifies

The Clarifier produces acceptance criteria in EARS format (real CashPulse output):
```
feat-001: Budget Summary Dashboard
  AC-1: "When the user navigates to the Dashboard, the system shall display the budget summary card with current month's total spent, budget limit, and remaining amount"
  AC-2: "When total spent exceeds 80% of budget, the system shall display an 'amber' warning badge"
```

The question: does the Architect need to translate these into more specific contracts (e.g., "GET /api/budgets/current returns `{ spent: number, limit: number, remaining: number, status: 'on-track' | 'warning' | 'over' }`") or is the EARS criterion sufficient for the Implementer?

## Relevant Schemas (verbatim from codebase)

```typescript
// ScreenPlan — already exists, specifies screen-level contracts
export const ScreenPlanSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  screenType: z.enum(['page', 'modal', 'drawer', 'sheet']),
  route: z.string(),
  components: z.array(z.string()),
  dataBindings: z.array(z.object({
    field: z.string(),
    source: z.string(),
    transform: z.string().optional(),
  })),
  navigationTargets: z.array(z.object({
    target: z.string(),
    trigger: z.string(),
  })),
});

// FeatureNode — EARS acceptance criteria from Clarifier
export const FeatureNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    condition: z.string(),
    behavior: z.string(),
    formatted: z.string(),
  })),
  priority: z.enum(['must-have', 'should-have', 'could-have', 'wont-have']),
  dependencies: z.array(z.string()),
  status: z.enum(['planned', 'in-progress', 'implemented', 'verified']),
});
```

## Settled Decisions

- Architect produces typed contracts (Zod schemas). Not prose, not pseudocode.
- Every artifact crossing an agent boundary has a Zod schema (vision Layer 2).
- The Reviewer validates implementation against contracts (Pass 2: LLM review with ArchitectureSpec as context).
- EARS acceptance criteria format is settled (from Clarifier).
- OpenAPI 3.1 for API contracts is settled.

## External Reference Architectures

- **MetaGPT (arXiv 2308.00352):** SOPs materialize as typed handoffs. Architect emits system interface design + sequence flow diagram. The handoff schema is what reduces "hallucinated chatter."
- **GitHub Spec Kit:** Three phases — research → contracts → tasks. `contracts/` directory contains `data-model.md`, API specs, component specs. Agents receive contracts, not prose.
- **Kiro (AWS):** Three files — `requirements.md` (EARS format), `design.md` (architecture), `tasks.md` (implementation steps). Design doc is the contract layer.
- **Spec Kit Agents (arXiv 2604.05278):** "Context blindness" failure — agents produce internally coherent code incompatible with the repo. Fix: read-only context-grounding hooks that expose existing patterns to the agent.
- **Walden Yan, "Don't Build Multi-Agents" (June 2025):** Principle 2: "Actions carry implicit decisions, and conflicting decisions carry bad results." Contracts make decisions explicit.

## Desired Output

A research report answering:

1. **What is the minimum viable contract for independent Implementer agents?** (which artifact types are essential vs nice-to-have)
2. **How should contracts handle implementation patterns?** (error handling, middleware, logging — should these be in the contract or left to the Implementer?)
3. **What is the right contract granularity for each artifact type?** (data model: column-level? API: endpoint-level? Components: prop-level?)
4. **How do MetaGPT, Spec Kit, and Kiro scope their contracts?** (concrete examples of what's included vs excluded)
5. **What contract elements prevent the "context blindness" failure mode?** (from Spec Kit Agents arXiv paper)
6. **Should contracts include negative constraints?** ("do NOT use X pattern" alongside "use Y pattern")
