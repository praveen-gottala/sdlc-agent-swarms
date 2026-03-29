---
name: sprint-plan
description: Plan a time-boxed sprint by selecting from prioritized tasks, estimating effort, and producing daily goals. Use when planning what to build next.
argument-hint: "[1 week | 2 weeks]"
---

## Sprint Planning Protocol

### Step 1: Current State
1. Check recent git log for work in progress
2. Identify unfinished P0/P1 tasks from last analysis
3. Note any blockers or incomplete ADRs

!`git log --oneline -10 2>/dev/null || echo "No git history"`
!`find docs/adrs -name "*.yaml" -o -name "*.md" 2>/dev/null | wc -l` ADRs exist

### Step 2: Capacity
- Duration: $ARGUMENTS (default: 1 week)
- Assume 3-4 productive hours/day on this project
- Apply 20% overhead tax for context switching
- Effective capacity = days x hours x 0.8

### Step 3: Task Selection
Select tasks that:
1. Fit the time budget
2. Respect dependency order (never pick P2 if blocking P0 is undone)
3. Produce at least one demo-able outcome by sprint end
4. Include one "compounding value" task (tooling/infra that speeds future work)

### Step 4: Output

```
SPRINT: [dates] | THEME: [one-line story of this sprint]
CAPACITY: [X effective hours]

DAY-BY-DAY:
  Day 1: [task slice] --> [what is done by EOD]
  Day 2: [task slice] --> [what is done by EOD]
  ...
  Day N: [buffer/polish] --> [what ships]

SPRINT DEMO: [what you can show someone at the end]
SPRINT RISK: [what might go wrong + mitigation]
DEFINITION OF DONE:
  [ ] [specific checklist item]
  [ ] [specific checklist item]
  [ ] At least one end-to-end integration test proving pipeline flow
```

### Rules
- Never plan more than 80% capacity
- Every sprint must ship at least one integration test proving e2e flow
- Incomplete P0 tasks always carry over as highest priority
- If sprint goal is at risk by mid-sprint, cut scope, don't cut quality
