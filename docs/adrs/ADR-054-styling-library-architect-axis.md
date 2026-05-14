# ADR-054: Styling Library as Architect Node 2 Axis

## Status

Accepted

## Context

CHIP's four-stage spine (Clarifier → Architect → Implementer → Reviewer) separates
WHAT (product requirements) from HOW (architecture decisions). The styling library
choice — which React component library a project uses — determines the component
catalog shape (anatomy, variants, states, token bindings, import paths). This choice
must be made before the Architect's Contract Designer (Node 4) can run its component
composition specialist.

Today, `agentforge init` handles this via a hardcoded selection from 6 presets
defined in `packages/cli/src/commands/component-library-presets.ts`:

```typescript
export type ComponentLibraryId = 'shadcn' | 'mui' | 'chakra' | 'antd' | 'radix' | 'mantine';
```

Each preset maps a library to a `ComponentLibraryPreset` containing `reactMappings`
(import paths, component names, variant/size props). The selected preset generates
`component-catalog.yaml`, which the design pipeline consumes.

Three questions required resolution:

1. **Where does the styling library decision live?** Clarifier (WHAT), Architect (HOW),
   or pre-pipeline config?
2. **How does brownfield differ from greenfield?**
3. **Should the catalog be library-agnostic?**

## Decision

### Styling library is an Architect Node 2 (Options Explorer) axis

The styling library is an architecture decision, not a product requirement. The
Clarifier produces WHAT the user wants (features, entities, screens). The Architect
decides HOW to build it (stack, libraries, patterns). Specifically:

- **Node 1 (Context & Constraints Assembler)** identifies "styling-library" as an
  open gap in the `ConstraintSet` for greenfield projects.
- **Node 2 (Options Explorer)** researches alternatives for the styling-library axis,
  producing an `OptionMemo` with tradeoffs and blast radius for each of the 6
  supported libraries.
- **Node 3 (Architecture & ADR Writer)** commits the choice and writes an ADR
  documenting the rationale. The choice populates `StackConfig.componentLibrary`.
- **Node 4 (Contract Designer)** component composition specialist reads the chosen
  library's preset to resolve the component catalog shape.

### Brownfield: detect from repo, default to existing

In brownfield mode, the styling library is already decided. The Change Classifier
(Node 0.5) or Context Assembler (Node 1) detects the existing library from the
repo (package.json dependencies, existing component-catalog.yaml, import patterns).
`defaultToExistingPattern = true` — deviation from the existing library requires
an explicit ADR justifying the switch.

### Greenfield: Node 2 explores, Node 3 commits

In greenfield mode, the styling library is one of potentially many open decision
axes (alongside data store, auth strategy, chart library, etc.). Node 2 researches
all open axes. Node 3 commits all decisions. The component catalog is generated
from the chosen preset after Node 3 commits.

### Stack remains single-stack-per-project

The tech stack (React/Node/PostgreSQL/Tailwind) is currently hardcoded in
`packages/cli/src/commands/init.ts`. This remains a single-stack-per-project model.
Multi-stack support (e.g., Vue alternative, Python backend) is future work requiring
its own ADR when the Architect stabilizes.

### Catalog remains library-specific

The 6 component library presets in `component-library-presets.ts` produce
library-specific catalogs (different import paths, component names, variant props).
A library-agnostic adapter layer is premature abstraction — the preset pattern is
simple, working, and covers all supported libraries. If a 7th library is added,
a new preset entry suffices.

## Consequences

- The Architect's typed contracts (`ConstraintSet`, `OptionsBundle`) must model
  "styling-library" as a gap axis. The `ArchitectureSpec.stackConfig` must include
  the chosen `ComponentLibraryId`.
- Node 4's component composition specialist depends on Node 3's styling library
  commitment. This is enforced by the sequential node execution order.
- The existing 6 presets in `component-library-presets.ts` are the source of truth
  for supported libraries. Adding a new library means adding a preset, not
  modifying the Architect's decision logic.
- The Clarifier does NOT ask about styling library. If a user mentions "I want to
  use Material UI," the Clarifier captures it as a constraint in the enriched
  requirement, and the Architect honors it (gap pre-resolved).
- `agentforge init` continues to serve as the quick-start path. The Architect
  replaces init as the production path when it stabilizes (M3+).

## References

- `packages/cli/src/commands/component-library-presets.ts` — `ComponentLibraryId` union, 6 presets
- `docs/research/briefs/R4-styling-stack-decision.md` — research brief (RESOLVED)
- `docs/research/architect-codebase-grounded-design.md` — codebase-grounded analysis
- `docs/vision.md` Layer 3 — Agent Taxonomy (Architect node structure)
- `docs/plans/active/chips-next-steps/execution-plan.md` — parent plan (Finding A)
