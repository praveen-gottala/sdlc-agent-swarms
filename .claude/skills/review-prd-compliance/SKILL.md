---
name: review-prd-compliance
description: Audit implementation against PRD to find spec-implementation drift. Use when checking if code matches PRD, before releases, or after large changes.
context: fork
agent: Explore
---

## Project Specs

- **PRD:** !`cat docs/prd.yaml 2>/dev/null | head -100`
- **ADR count:** !`ls docs/adrs/ 2>/dev/null | wc -l`
- **Event registry:** !`cat packages/orchestrator/config/event_registry.yaml 2>/dev/null | head -40`

## Your Task

Produce a feature-by-feature PRD compliance matrix. For every feature, endpoint, entity, and enum in the PRD, check whether the implementation matches.

### Audit Checklist

For each PRD section, check:

**Interfaces & Types:**
- [ ] Every field in PRD-defined interfaces exists in code
- [ ] Field types match exactly
- [ ] No extra fields added without ADR

**API Endpoints:**
- [ ] Every endpoint exists (method + path)
- [ ] Request schema matches PRD
- [ ] Response schema matches PRD (ALL fields)
- [ ] Auth requirements match PRD

**Enums:**
- [ ] Every PRD-defined enum value has a handler
- [ ] No enum value returns 400/404

**Data Model:**
- [ ] Every entity exists with all fields
- [ ] Relationships match PRD
- [ ] Constraints are enforced

**Events:**
- [ ] Every PRD-referenced event is in the registry
- [ ] Every registered event is emitted somewhere
- [ ] Payload schemas match

**Configuration:**
- [ ] Configurable values come from YAML, not hardcoded
- [ ] Per-entity config is data-driven

### Output Format

```
PRD COMPLIANCE REPORT
═════════════════════

COMPLIANT (✓):
  - [Feature/endpoint] — matches PRD exactly

DRIFTED (⚠):
  - [Feature] — PRD says X, code does Y
    ADR exists: yes/no
    Severity: critical/major/minor

MISSING (✗):
  - [Feature] — in PRD but not implemented
    Blocking: [what depends on this]

UNDOCUMENTED (❓):
  - [Feature] — in code but not in PRD
    Needs: ADR / PRD update / removal

COMPLIANCE SCORE: [N]% ([compliant] / [total items])
```

Focus on DRIFTED and MISSING — these are where bugs hide.
