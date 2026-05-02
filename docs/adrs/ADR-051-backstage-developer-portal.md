# ADR-051: Backstage Developer Portal

## Status

Accepted (2026-04-29)

## Context

CHIP has 173 markdown files across 25 directories under `docs/`, 47 ADRs, 18 packages with zero READMEs, and a 15-layer architecture. Navigating this documentation as raw `.md` files in a repository is difficult for new contributors and existing team members. There is no documentation site, service catalog, or developer portal.

The vision (`docs/vision.md` Layer 14) prescribes three dashboard surfaces (Clarifier, Pipeline, Artifacts) for runtime interaction but does not address developer onboarding, documentation discovery, or service catalog concerns. This ADR documents the decision to add Backstage as a complementary developer surface.

## Decision

Add a Backstage developer portal as the **outer-loop developer surface** for CHIP:
- **Backstage owns:** documentation navigation (TechDocs), service catalog (package discovery + dependency graphs), developer onboarding, operational guides
- **Dashboard owns:** runtime pipeline execution, HITL approvals, design studio, cost monitoring, agent reasoning traces (via Langfuse links)

Backstage is deployed as an isolated application in `backstage/` at the repository root. It is NOT part of the npm/Nx workspace. It uses its own Yarn workspace and runs on port 3003.

### Scope boundaries

| Concern | Owner | Rationale |
|---------|-------|-----------|
| Documentation browsing | Backstage TechDocs | MkDocs-based rendering of existing `docs/` markdown |
| Package catalog | Backstage Catalog | Component entities with dependency graph |
| Developer onboarding | Backstage | TechDocs landing page + guides |
| Pipeline runs | Dashboard | Real-time execution, graph viz, HITL gates |
| Design studio | Dashboard | DesignSpec rendering, correction, prototype |
| Cost/token monitoring | Dashboard | Live metrics per run |
| Observability traces | Langfuse (linked from Dashboard) | Full trace visualization |

### Deferred decisions

- **Backstage-Dashboard relationship evolution:** After Phase 1 (TechDocs + basic catalog), evaluate whether to deepen Backstage (custom plugins, Software Templates) or keep it lightweight. No commitment to migration.
- **Custom entity kinds:** Standard Backstage entities (System, Component, Location) used initially. Custom kinds (AgentContract, PromptVersion, MCPTool) deferred until the portal proves its value.

## Consequences

### Positive
- Developers can browse 173 docs with search, navigation, and dark mode instead of reading raw markdown
- Service catalog visualizes the 18-package dependency graph
- TechDocs uses MkDocs (same engine as Backstage TechDocs) -- zero conversion needed; `.md` files stay in place
- If CHIP ever adopts full Backstage infrastructure (scaffolder, CI/CD plugins), the foundation is already in place
- AI agents (Claude Code, Cursor) continue reading raw `.md` files -- the portal is a view layer

### Negative
- Adds a separate application (`backstage/`) with its own dependency tree (Yarn, Backstage packages)
- Requires Python for TechDocs generation (MkDocs + `techdocs-core`)
- `mkdocs.yml` nav tree must be updated when docs are added -- a maintenance cost
- Port 3003 adds another local service to the development stack

### Neutral
- Does not affect the existing dashboard, CLI, or any agent package
- Does not change the vision's three-surface model -- Backstage is additive
- Python is already a project dependency (`services/engine/`)

## Alternatives Considered

1. **MkDocs + Material theme only** -- simpler, no Backstage overhead. Rejected: user specifically wanted the full Backstage experience (service catalog, plugin ecosystem, scaffolder potential).
2. **Docusaurus** -- React/TS native, MDX support. Rejected: requires `.mdx` conversion, doesn't provide service catalog or scaffolder.
3. **Custom Next.js docs route** -- integrate with existing dashboard. Rejected: conflates runtime dashboard with documentation, creates deployment coupling.
4. **No documentation site** -- continue with raw `.md`. Rejected: 173 files across 25 directories with 47 ADRs is unnavigable without tooling.

## References

- `docs/vision.md` Layer 14 (Dashboard and UX)
- `docs/guides/backstage-developer-portal.md` (setup guide, created with this ADR)
- Backstage: https://backstage.io/docs
- TechDocs: https://backstage.io/docs/features/techdocs/
