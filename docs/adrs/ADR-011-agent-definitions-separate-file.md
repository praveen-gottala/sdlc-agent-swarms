# ADR-011: Agent Definitions in Separate File

## Date
2026-03-18

## Status
Accepted

## PRD Reference
Section 10.1 — "Every agent is defined by a YAML contract in the project manifest." The example shows a filename `design_wireframe_agent.yaml`, implying per-agent or per-collection YAML files rather than inline definitions in `agentforge.yaml`.

## What the Implementation Does
The implementation stores agent contract definitions in a separate `agentforge/agents.yaml` file rather than embedding them directly in the top-level `agentforge.yaml` manifest. The manifest contains the `agents` section with provider configuration, sandbox settings, and orchestration parameters. Agent contracts with their full definitions (role, provider, execution, tools, permissions, hitl_policy, budget) live in the dedicated agents file.

## Reasoning
Separating agent definitions from the project manifest follows the PRD's own implied pattern — the Section 10.1 example filename is `design_wireframe_agent.yaml`, not `agentforge.yaml`. A separate file keeps the manifest focused on project-level configuration while agent contracts handle per-agent details. This separation also makes it easier to add or remove agents without modifying the core manifest, and supports the PRD's future vision of per-agent YAML files.

## Downstream Impact
- **P12 Agent Contract Schema (Wave 3):** Must read from `agentforge/agents.yaml`, not from `agentforge.yaml`. No functional risk — the file path is well-defined.
- **P11 Agent Runtime:** Loads agent contracts from the agents file. No impact.
- **P26 Permissions Enforcement:** Reads contracts regardless of file location. No impact.

## Decision
Accept deviation and update PRD to match implementation.

## PRD Update Required
Yes — Section 10.1 should clarify that agent contracts are stored in `agentforge/agents.yaml` during init, with the manifest referencing provider/sandbox/orchestration settings at the project level.

> Updated per ADR-011 (2026-03-18): Agent contracts are stored in `agentforge/agents.yaml`. The `agentforge.yaml` manifest contains project-level agent configuration (providers, sandbox, orchestration).
