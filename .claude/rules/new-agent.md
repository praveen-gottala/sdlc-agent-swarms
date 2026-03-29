---
paths: ["packages/agents-*/**"]
---

# New Agent Role Checklist
When adding a new agent role, update ALL of these:

1. `packages/cli/src/commands/init.ts` — add to `buildAgentsYaml()` with all 7 PRD sections (role, provider, execution, tools, permissions, hitl_policy, budget)
2. `packages/core/src/events/domain-events.ts` — add `on_complete` event if it doesn't exist
3. `packages/core/src/index.ts` — export the new event type
4. Agent implementation in `packages/agents-*/src/` — the actual agent logic
5. `packages/governance/src/permission-checker.ts` — if role has special permissions
6. `packages/governance/src/hitl-enforcer.ts` — if role has HITL gates
7. Tests: agent unit test + integration test in `packages/integration-tests/`
