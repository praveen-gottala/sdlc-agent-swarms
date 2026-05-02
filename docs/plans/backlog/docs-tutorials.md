# Docs Tutorials + Getting Started

**Origin:** Phase 5 of Docs Reorganization plan (`docs/plans/active/docs-reorganization/execution-plan.md`).
**Moved to backlog:** 2026-04-30. All infrastructure phases (1-4, 6, 7) complete. Tutorials are additive content with no blockers.

## Goal

New users can go from clone to running demo. First-time experience that converts skeptics into users.

## Pages to Create

Use the `/backstage create` skill for all pages.

| Invocation | Page | What the reader has at the end |
|-----------|------|-------------------------------|
| `/backstage create tutorial first-design` | `docs/tutorials/first-design.md` | A rendered multi-screen prototype from a sample PRD |
| `/backstage create tutorial first-clarifier` | `docs/tutorials/first-clarifier.md` | A clarified requirement with assumption ledger from a vague input |
| `/backstage create guide getting-started` | `docs/guides/getting-started.md` | Full dev environment: clone, install, build, dashboard, tests, Backstage |

## MkDocs Nav Changes

Add to `mkdocs.yml`:
```yaml
  - Tutorials:
      - Your First Design: tutorials/first-design.md
      - Your First Clarifier Run: tutorials/first-clarifier.md
```

## Estimate

~2-3 hours. New files only. Zero existing behavior changes.
