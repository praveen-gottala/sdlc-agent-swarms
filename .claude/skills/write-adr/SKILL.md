---
name: write-adr
description: Create an Architecture Decision Record when deviating from PRD or TDD. Use whenever implementation differs from spec.
argument-hint: "[brief description of the deviation]"
---

## ADR Template

When the developer describes a deviation, produce a complete ADR and save it to `docs/adrs/`.

### Steps

1. Check existing ADRs: read `docs/adrs/` to determine next number
2. Understand the deviation: what does the PRD/TDD say vs. what the code does/will do
3. Generate the ADR
4. Save to `docs/adrs/ADR-NNN-kebab-case-title.md`
5. Add a code comment referencing the ADR at the deviation point
6. Suggest a test name that explicitly references the ADR

### ADR Format

```markdown
# ADR-NNN: [Title]

## Status
Accepted

## Date
[Today's date]

## Context
[Why this decision was needed. What problem or constraint triggered it.
Reference the specific PRD/TDD section that's being deviated from.]

## Decision
[What was decided. Be precise about the change.]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Tradeoff 1]
- [Tradeoff 2]

### Risks
- [Risk 1 and mitigation]

## Alternatives Considered

### [Alternative A]
- Pros: ...
- Cons: ...
- Rejected because: ...

## References
- PRD Section: [specific section]
- TDD Section: [if applicable]
- Related ADRs: [if any]
```

### After Creating the ADR

Remind the developer to:
1. Add `// See ADR-NNN: [title]` comment at the deviation point in code
2. Name related tests with the ADR: `[ADR-NNN] should [expected behavior]`
3. Update the TDD if the ADR affects architecture
