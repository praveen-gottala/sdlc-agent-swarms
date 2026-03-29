---
name: implement-feature
description: Guided feature implementation enforcing PRD compliance, proper testing, and ADR documentation. Use when building new capabilities or modules.
argument-hint: "[feature-name or PRD section]"
---

## Implementation Workflow

You are implementing a feature for AgentForge. Follow this protocol exactly.

### Phase 1: Specification Lock
1. Read `docs/prd.yaml` — find the section for $ARGUMENTS
2. Read `docs/tdd.yaml` — find the technical approach
3. Read `config/event_registry.yaml` — find related events
4. List EVERY field, endpoint, enum value, and interface the PRD specifies
5. Present the spec summary and confirm before writing code

### Phase 2: Implementation
- Match PRD exactly — all fields, all enum values, all interface members
- Use YAML config for behavior that varies by phase/agent/entity
- Emit typed events matching event registry
- Library components from registry manifests (no LLM-designed components)
- Design tokens through theme bridge (no hardcoded values)

### Phase 3: Testing
- Tests hit real server/API endpoints — never internal functions directly
- Every PRD acceptance criterion → at least one test
- Test ALL enum values, not just happy path
- Deviation tests include ADR number: `[ADR-NNN] should...`

### Phase 4: Validation
1. Run build → zero errors
2. Run tests → all pass
3. Run linter → zero warnings
4. Cross-check: every PRD field exists in implementation
5. Any deviation → create ADR via `/write-adr` before committing

### Anti-Patterns
- Skipping fields because they're "derivable"
- Returning 404 for defined enum values
- Testing internal functions instead of API endpoints
- Hardcoding phase-specific behavior in if-else chains
- Ad-hoc colors/spacing instead of design tokens
