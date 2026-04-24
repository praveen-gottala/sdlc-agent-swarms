---
name: review-spec-sync
description: Audit domain specs against vision.md and codebase for stale patterns, Figma references, wrong model IDs, and rejected architectural patterns. Use before major releases or after completing feature plans.
context: fork
agent: Explore
---

## Source of Truth

- **Vision (architecture):** !`head -100 docs/vision.md`
- **CLAUDE.md rejected patterns:** !`grep -A2 "Rejected Patterns" CLAUDE.md | head -20`
- **ADR-043 (orchestration):** !`head -30 docs/adrs/ADR-043-typescript-only-orchestration.md 2>/dev/null`

## Your Task

Audit all domain spec files in `docs/specs/` for drift from `docs/vision.md` locked decisions and the current codebase. Produce a prioritized report of stale patterns.

### Stale Pattern Checks

Run these grep checks and report any violations:

**1. Figma References (should only appear in "removed" or historical context):**
```
grep -rn "Figma" docs/specs/
```
Flag any occurrence that presents Figma as a current/active integration.

**2. Event Bus as Coordination (should only appear with "telemetry" qualifier):**
```
grep -rn "event bus" docs/specs/ | grep -iv "telemetry\|observability\|retained for"
```
Flag any occurrence that describes event bus as the coordination substrate.

**3. MCP as Orchestration/Coordination (should be described as tool protocol only):**
```
grep -rn "MCP" docs/specs/ | grep -i "orchestrat\|coordinat"
```
Flag any occurrence that presents MCP as orchestration or coordination layer.

**4. Generic Model Names (should use versioned IDs):**
```
grep -rn "Claude Opus\|Claude Sonnet\|Claude Haiku\|GPT-4\b" docs/specs/
```
Flag any model reference without a version ID (e.g., `claude-opus-4-6`).

**5. Parallel Code Generation (rejected by vision Layer 8):**
```
grep -rn "parallel.*frontend\|frontend.*parallel\|concurrent.*agent\|agent.*concurrent" docs/specs/
```
Flag any description of within-task parallel coding agents.

**6. Ten-Agent / Five-Category Taxonomy (superseded by four-stage spine):**
```
grep -rn "five.*categor\|ten.*agent\|20.*agent\|peer.*agent" docs/specs/
```
Flag any reference to the old taxonomy without spine framing.

**7. Python Engine (deprecated per ADR-043):**
```
grep -rn "Python.*engine\|services/engine\|python.*orchestrat" docs/specs/
```
Flag any reference that presents the Python engine as current.

### Cross-Reference Checks

For each vision.md locked decision (Layers 1-15), verify the corresponding domain spec section is consistent:
- Layer 1 (Orchestration): Check platform-architecture.md Section 4.1
- Layer 2 (Coordination): Check platform-architecture.md Sections 4.2 and 7
- Layer 3 (Taxonomy): Check sdlc-agents.md Section 10
- Layer 7 (Design): Check sdlc-agents.md Section 11.1
- Layer 8 (Implementation): Check sdlc-agents.md Section 11.3

### Output Format

```
SPEC SYNC REPORT
════════════════

VIOLATIONS (fix immediately):
  - [file:line] — [pattern found] — [what it should say]
  - ...

WARNINGS (annotate or fix soon):
  - [file:line] — [stale pattern] — [correct source]
  - ...

CLEAN:
  - [check name] — no violations found

SYNC SCORE: [N] violations, [M] warnings across [K] files
```

Focus on VIOLATIONS — these are the patterns that actively mislead Claude Code.
