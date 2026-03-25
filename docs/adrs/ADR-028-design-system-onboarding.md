# ADR-028: Design System Onboarding

## Date
2026-03-21

## Status
Accepted

## PRD Reference
Section 9.1 — Project Initialization:
> "agentforge init scaffolds a new project with opinionated defaults."

Section 11 — Design Phase Agents:
> Agents operate within design tokens and brand constraints.

## Context

`agentforge init` scaffolds projects with an empty `tailwind.config.ts` and a bare
`@tailwind base;` CSS file. No project-specific design tokens, brand direction,
typography, color palette, or spacing scale are captured. Downstream UX agents use
hardcoded defaults from `packages/agents-ux/src/prompts/ux-design-system.md`,
making every project look identical regardless of purpose.

## Decision

1. **New types in core**: `DesignTokensSpec` and `BrandSpec` interfaces in
   `packages/core/src/types/design-system.ts` define the project's visual identity.

2. **YAML read/write utilities**: `packages/core/src/state/design-system-reader.ts`
   provides `loadDesignTokens`, `loadBrandSpec`, `saveDesignTokens`, `saveBrandSpec`,
   `toDesignTokens`, `validateDesignTokens`, `validateBrandSpec`. Returns sensible
   defaults when spec files are missing (backward compatible).

3. **Extended `agentforge init`**: Three hardcoded archetype presets (Warm & Inviting,
   Clean & Professional, Bold & Modern) are offered during the wizard. The chosen
   archetype generates `design-tokens.yaml`, `brand.yaml`, `tailwind.config.ts`, and
   `global.css` with the correct fonts and colors.

4. **`agentforge design-system` CLI**: Three subcommands — `show`, `update`, `validate`
   — for inspecting, changing, and validating project design tokens.

5. **Agent wiring**: `buildDesignSystemContextFromSpec()` constructs `DesignSystemContext`
   from the structured YAML specs. `design-collaborate` CLI attempts to load project
   tokens first, falls back to hardcoded markdown prompt.

## What We Chose NOT to Do and Why

- **Did not split DesignSurface into DesignReader/DesignWriter** — TalkToFigma bridge
  already works around MCP write limitations; splitting would disrupt agents-design
  AND agents-ux for moderate value.

- **Did not add FigmaMakeFileLinked as a new event** — FigmaDesignReady already carries
  fileId/pageId/nodeIds and serves this purpose.

- **Did not add LangGraph visual_verify_phase yet** — TypeScript infrastructure first,
  Python orchestration is a follow-up task.

## Downstream Impact

- All UX agents now read project-specific tokens when available.
- Visual verification layer (future session) will use DesignTokensSpec for
  project-specific assertions.
- Projects without design-tokens.yaml continue to work — graceful fallback to defaults.

## PRD Update Required

- Section 9.1 should specify `design-tokens.yaml` and `brand.yaml` in init scaffold.
- Section 11 should specify agents read project tokens.
