# ADR-016: Code Connect Mapping is Manual in Phase 1

## Date
2026-03-18

## Status
Accepted

## PRD Reference
PRD v2.0 Section 11.1.2: "Code Connect maps Figma component IDs to actual codebase component paths."

## What the Implementation Does
The visual designer agent outputs `componentMappings` in its response (e.g., `{ wireframeElement: "cta-button", designComponent: "Button/Primary/Large" }`), but there is no automated resolution from Figma component IDs to actual file paths in the codebase. Mappings are output-only metadata.

## Reasoning
Automated Code Connect resolution requires a component registry that maps design system component names to their source code locations. This registry depends on the target project's component structure, which varies per project. Phase 1 focuses on generating correct designs; the mapping to code paths is a code generation concern handled by the code_generator agent using naming conventions and spec references.

## Downstream Impact
- P29 Design-to-Spec: design context passes to spec without automated code path links. Spec writer uses component names, not file paths. Minimal impact.
- P30 Code Generation: code generator receives design component names but not file paths. It discovers components via codebase search. Slightly less efficient but functional.

## Decision
Phase 1 treats Code Connect as output-only metadata. Manual mapping via `agentforge.yaml` or spec files. Phase 2 can add a Code Connect resolver that:
1. Scans the codebase for component exports
2. Builds a component registry (name → file path)
3. Resolves Figma component IDs against the registry

## PRD Update Required
Section 11.1.2 should clarify that Phase 1 Code Connect is output-only; automated bidirectional resolution is Phase 2.
