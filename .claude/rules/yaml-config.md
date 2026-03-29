---
paths: ["**/*.yaml", "**/*.yml"]
---

# YAML State & Config Rules

- Pipeline state files (`state.yaml`, `task_graph.yaml`): never modify structure, only update values
- Event registry: every event must have `name`, `emitted_by`, `consumed_by`, and typed `payload` fields
- Quality gates: every gate must define `mandatory` checks (list of boolean expressions) and optional `recommended` checks
- Trust levels: must define `auto_approve` and `require_approval` action lists per level
- Design tokens: must follow W3C DTCG format with `value` and `type` fields
- All YAML files must be valid — run through a YAML linter mentally before saving
- Config YAML must not contain environment-specific values (those go in `.env`)
