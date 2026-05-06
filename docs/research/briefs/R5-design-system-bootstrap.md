# R5: Design System Bootstrapping Order

**Question:** In greenfield mode, what happens BEFORE the Clarifier? Specifically: how do design tokens, component catalogs, and brand specs get created if no project exists yet?

**Blocks:** M1 (Connect — threading Clarifier output into design pipeline)

## Architecture Context

CHIP is a four-stage vertical spine: Clarifier → Architect → Implementer → Reviewer.

The Clarifier is the first spine stage. In **bootstrap mode** (greenfield), it takes a raw idea or PRD and produces structured requirements. But the Clarifier's Context Retriever node loads design tokens and component catalogs IF they exist — it doesn't create them.

Currently, `agentforge init` (a CLI command) is the only thing that runs before the design pipeline. Init does:

1. Reads a PRD markdown file
2. Single LLM call → generates `pages.yaml`, `models.yaml`, `api.yaml`, `design-tokens.yaml`, `component-catalog.yaml`
3. Writes these YAML specs to `agentforge/spec/`

The Architect (not yet built) replaces init with a rigorous multi-node process. But the question remains: how do design tokens and catalogs get bootstrapped?

## Current Bootstrap Flow

```
User PRD → agentforge init → {pages, models, api, design-tokens, component-catalog}.yaml → Design Pipeline
```

## Known Gaps (from M0 analysis)

| What init wizard collects | Clarifier equivalent | Gap |
|---|---|---|
| Styling library (6 options, shadcn default) | Context Retriever loads generic base catalog | Missing |
| Stack (React/Node/PostgreSQL/Tailwind — hardcoded) | Not in ClarifierInput | Missing |
| Design tokens + brand | Loads tokens if they exist | Partial |

## Real Data: CashPulse Fixture

**What init produced** (`fixtures/personal-expense-tracker/agentforge/spec/design-tokens.yaml`):
- 10 primitive colors (blue-600, gray-900, emerald-500, etc.)
- 16 semantic tokens (surface, text, accent mappings)
- 6 typography roles (Page Title 24px/700, Body 14px/400, etc.)
- Spacing scale (4px base, multiples: 4,8,12,16,24,32,48)
- 4 elevation levels (card, elevated, modal, tooltip)

**What init produced** (`fixtures/personal-expense-tracker/agentforge/spec/component-catalog.yaml`):
- 25 components with anatomy, variants, states, token_bindings, library_mapping

**What the Clarifier received** (base catalog from `packages/core/src/catalogs/base-component-catalog.yaml`):
- Generic component catalog (not project-specific)

## Settled Decisions

- The Clarifier does WHAT (features, entities, screens). The Architect decides HOW (stack, components, tokens).
- Styling library choice is an Architect Node 2 (Options Explorer) axis, NOT a Clarifier concern.
- Design tokens are a Node 4 (Contract Designer) output, NOT a pre-Clarifier step.
- A base component catalog exists at `packages/core/src/catalogs/base-component-catalog.yaml` for bootstrap mode.

## Constraints

- The Clarifier must work WITHOUT design tokens or catalogs (bootstrap mode with generic base catalog).
- The design pipeline currently REQUIRES design tokens and catalogs (loaded from disk).
- In spine mode, the Architect produces tokens/catalogs AFTER the Clarifier, BEFORE the Implementer invokes the design stage.
- In standalone mode (CLI `design:page`), tokens/catalogs must already exist on disk.

## Desired Output

A research report answering:

1. **What is the recommended greenfield bootstrapping sequence?** (3-5 steps, concrete)
2. **Should there be a project setup step between "user writes PRD" and "Clarifier runs"?** If yes, what does it do? If no, how does the Clarifier work without tokens?
3. **How do Kiro, Spec Kit, and other reference architectures handle greenfield bootstrapping?** (2-3 concrete examples with their approach)
4. **What is the minimal "bootstrap bundle" the Architect needs to start?** (which artifacts, from where)
5. **Diagram: recommended bootstrap flow** for greenfield (from raw idea to first design pipeline run)
