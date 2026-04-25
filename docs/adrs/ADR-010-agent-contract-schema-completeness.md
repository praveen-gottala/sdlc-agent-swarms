# ADR-010: Agent Contract Schema Completeness

## Date
2026-03-18

## Status
Rejected

## PRD Reference
Section 10.1 — "Every agent is defined by a YAML contract in the project manifest specifying what the agent can do, cannot do, and how it coordinates with humans and other agents." The example shows 7 sections: role, provider, execution, tools, permissions, hitl_policy, budget.

## What the Implementation Does
Prior to this fix, `buildAgentsYaml()` in `packages/cli/src/commands/init.ts` generated agent definitions with only 5 fields: `{role, phase, provider, hitl_level, on_complete}`. This omitted `execution`, `tools`, `permissions`, and `budget` sections. Additionally, the field was named `hitl_level` instead of `hitl_policy` as specified in PRD Section 10.1.

## Reasoning
The simplified format was created during initial scaffolding as a minimal registration. However, the PRD intent is clear: agent contracts are the foundation for governance middleware (P26 Permissions Enforcement), agent runtime (P11), and contract validation (P12). A simplified format would cause P12 Agent Contract Schema Completeness in Wave 3 to fail, since it validates all 7 sections against every Phase 1 agent.

## Downstream Impact
- **P12 Agent Contract Schema Completeness (Wave 3):** Would FAIL without fix — validates all 7 sections.
- **P26 Permissions Enforcement:** Reads `permissions` and `denied` arrays from agent contracts.
- **P11 Agent Runtime:** Reads `execution` config for stream mode and progress events.
- **P13 LLM Provider Abstraction:** Reads `provider` field (already present, no impact).
- **P31 Event Catalog:** Reads `on_complete` and `on_error` event names (already present, no impact).

## Decision
Reject deviation and fix implementation to match PRD.

## PRD Update Required
No — implementation was fixed instead.

## Fix Applied
Updated `buildAgentsYaml()` in `packages/cli/src/commands/init.ts` to generate full PRD 10.1 compliant agent contracts with all 7 sections:
1. `role` — agent role identifier
2. `provider` — LLM provider reference
3. `execution` — `{mode, progress_events}` configuration
4. `tools` — array of MCP tool references per agent
5. `permissions` — allowed actions + `denied` list
6. `hitl_policy` — renamed from `hitl_level` to match PRD naming
7. `budget` — `{max_tokens_per_task, max_cost_per_task_usd}`

Also added `on_complete` and `on_error` event hooks per PRD Section 10.1 example.

Tests in `packages/cli/src/commands/agent-contract-schema-p12.test.ts` — all 7
sections verified per agent (canonical home; the older `wave2-onboarding.test.ts`
duplicate was deleted as part of the test-quality-gates cleanup, see
`docs/lessons-learned.md` § Test Quality Gates — One Canonical Site Per Behavior).
