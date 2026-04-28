# AgentForge Documentation

Start with [CLAUDE.md](../CLAUDE.md) for the reading order and development rules.

## Framework Architecture (start here)

| Document | Purpose |
|---|---|
| [vision.md](vision.md) | Architectural authority. 15 layers with locked/open decisions, current vs target state. |
| [research-report.md](research-report.md) | Evidence base. Deep-dive research supporting vision decisions. |
| [design-decisions.md](design-decisions.md) | Decisions by topic with reasoning, alternatives considered, and revisit criteria. |
| [roadmap.md](roadmap.md) | Eight-phase dependency-ordered rollout with demoable outcomes per phase. |
| [lessons-learned.md](lessons-learned.md) | Do Not Repeat list. Append-only record of what worked and what didn't. |

## Subfolders

| Folder | What's in it | When to read |
|---|---|---|
| [specs/](specs/) | Product requirements. PRD as index + domain specs (platform, agents, governance, dashboard). | Understanding what we're building. |
| [plans/](plans/) | All plans organized by lifecycle: `active/`, `backlog/`, `completed/`. Each initiative has an execution plan + optional capability vision. | Planning or resuming work on any initiative. |
| [research/](research/) | Investigation reports and methodology analysis with verified sources. | Understanding why decisions were made. |
| [adrs/](adrs/) | Architecture Decision Records (ADR-002 through ADR-043). Amend or supersede specs. | Before making architectural choices. |
| [architecture/](architecture/) | System design diagrams, dataflows, contracts, error handling, provider abstraction. | Understanding how components connect. |
| [cli/](cli/) | CLI command reference (init, design, orchestration, setup). | Using or modifying CLI commands. |
| [guides/](guides/) | Operational how-to's (design generation, model selection, viewport config, messaging). | Learning how to use a specific capability. |
| [issues/](issues/) | Known problems and tracking docs (flaky tests, rendering gaps, pipeline bugs). | Investigating a specific problem area. |
| [reference/](reference/) | Status docs, known limitations, readiness certification, pipeline improvements. | Checking current state or constraints. |
| [pending-evaluation/](pending-evaluation/) | Proposals and spikes under review (UX agent blueprint, MCP spike, data model). | Evaluating future directions. |
| [archive/](archive/) | Historical versions (previous CLAUDE.md, PRD v2 implementation notes). | Understanding past decisions. |
| [audits/](audits/) | Session distribution audits. | Reviewing session quality. |
| [self-correction/](self-correction/) | Session learning records. | Understanding what was learned per session. |
| [tests/](tests/) | Sample PRD fixtures for testing design generation. | Running or writing design pipeline tests. |
