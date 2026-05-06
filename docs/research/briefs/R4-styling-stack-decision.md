# R4: Styling Library & Stack Decision

**Question:** Where in the pipeline does the styling library (shadcn, Mantine, MUI, etc.) and tech stack (React/Vue, Node/Python, Postgres/SQLite) get decided? Is this a Clarifier concern, an Architect concern, or a pre-pipeline configuration?

**Blocks:** M2 (Architect Foundation — typed contracts + Critic)

## Architecture Context

CHIP's four-stage spine: Clarifier → Architect → Implementer → Reviewer.

The Clarifier produces WHAT (features, entities, screens). The Architect produces HOW (architecture decisions, contracts, task plan). The Implementer writes code. The key question: where does "which component library" and "which tech stack" live?

Currently, `agentforge init` hardcodes the stack: React, Node, PostgreSQL, Tailwind. The styling library is selected from 6 presets (shadcn default) in `component-library-presets.ts`. This choice determines the component catalog shape — different libraries have different component inventories.

## The Architect Node Structure (settled)

```
Node 0.5: Change Classifier (brownfield only)
Node 1: Context & Constraints Assembler
Node 2: Options Explorer          ← tech/styling decisions researched here
Node 3: Architecture & ADR Writer ← tech/styling decisions committed here
Node 4: Contract Designer (5 sequential specialists)
Node 5: Task Planner
Node 6: Architect Critic
```

Node 2 researches open decision axes. Node 3 commits decisions and writes ADRs. A styling library choice is a "load-bearing pick" that gets an ADR.

## Real Data: How Init Handles It Today

From `packages/cli/src/commands/init.ts`:
- Stack: hardcoded React/Node/PostgreSQL/Tailwind (line ~120)
- Component library: 6 presets in `component-library-presets.ts` (shadcn, Mantine, MUI, Radix, Headless, Custom)
- Each preset maps library → component catalog shape (anatomy, variants, states, token_bindings)
- The selected preset generates `component-catalog.yaml` which the design pipeline consumes

## Relevant Schema

```typescript
// ConstraintSet — Node 1 output (to be created)
{
  hard: Constraint[],    // e.g., "WCAG-AA", "mobile-first"
  soft: Constraint[],    // e.g., "card-based-dashboard", "tab-navigation"
  gaps: Gap[],           // e.g., "styling-library", "data-store", "auth-strategy"
  mode: 'greenfield' | 'brownfield',
}

// OptionsBundle — Node 2 output (to be created)
{
  options: OptionMemo[],  // one per gap axis
}
// where OptionMemo has: axis, alternatives[], tradeoffs[], blastRadius, references[]
```

## Settled Decisions

- Styling library is NOT a Clarifier concern — the Clarifier does product requirements, not tech decisions.
- Styling library IS an Architect Node 2 axis — one of potentially many open decisions.
- In brownfield, the styling library is already decided (detected from repo). `defaultToExistingPattern = true`.
- The component catalog shape depends on the library choice — this makes styling library a Node 2 decision that must resolve BEFORE Node 4's component composition specialist runs.

## Constraints

- Node 4 (Contract Designer) specialists run sequentially. The component composition specialist needs the component catalog, which depends on the styling library choice.
- Node 2 (Options Explorer) researches all open axes in parallel — styling library is one axis among potentially many.
- Node 3 (ADR Writer) commits all decisions — deviation from existing patterns requires an explicit ADR.
- The component catalog must exist by the time the Implementer invokes the design pipeline.

## Desired Output

A research report answering:

1. **Should styling library be an Architect Node 2 axis?** Or should it be a pre-Architect configuration (like a steering file)?
2. **How do Kiro and Spec Kit handle tech stack decisions?** (Kiro has `tech.md` steering file; Spec Kit has Phase 1 contracts/)
3. **When the Architect picks a styling library, what artifacts change?** (component catalog shape, token format, import paths, Tailwind vs CSS-in-JS)
4. **Should CHIP support multiple tech stacks simultaneously?** Or commit to one stack per project?
5. **What is the interaction between styling library choice and component catalog?** Can the catalog be library-agnostic with a rendering adapter?
