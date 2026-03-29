---
name: demo-readiness
description: Find the fastest path to a working, showable demo. Use when preparing for a presentation, review, or stakeholder update.
context: fork
agent: Explore
---

## Demo Readiness Assessment

You are assessing how quickly this project can produce a compelling, working demo for a technical audience.

### Pre-loaded
!`git log --oneline -10 2>/dev/null`
!`cat CLAUDE.md 2>/dev/null | head -40`
!`find . -name "*.test.*" -exec grep -l "pass\|PASS" {} \; 2>/dev/null | wc -l` passing test files

### Assessment Protocol

**1. What Works Right Now?**
- Find every runnable entry point (CLI commands, API servers, scripts)
- Try running them: do they produce output without crashing?
- Find any existing UI/visual output
- Identify the longest end-to-end flow that currently works

**2. What's 80% Done?**
- Find modules with implementation but no integration
- Find features that work in tests but aren't wired to the CLI/UI
- Find code that works with mocks but needs real connections

**3. The 7-Day Demo Plan**
For a technical audience, identify the MOST IMPRESSIVE thing achievable in 7 days.

```
DEMO TARGET: [one sentence — what you'll show]

CURRENT STATE: [what works today]

GAP TO DEMO: [what's missing — be specific]

FASTEST PATH (ordered by day):
  Day 1-2: [concrete task — what file, what function]
  Day 3-4: [concrete task]
  Day 5-6: [concrete task]
  Day 7:   [polish + rehearse]

WHAT TO CUT: [features to explicitly defer]
WHAT TO FAKE: [things that can be hardcoded/mocked for the demo]
WHAT MUST BE REAL: [things that lose all impact if faked]

DEMO SCRIPT:
  1. [Open terminal, run command X]
  2. [Show output Y — explain what's happening]
  3. [Modify input Z — show system responds]
  4. [Highlight: this is the architectural insight]

BACKUP PLAN: If Day 3 reveals a blocker, pivot to: [simpler demo]
```

### Rules
- Optimize for IMPACT, not completeness
- A working pipeline with 1 agent is more impressive than 5 half-built agents
- Running code beats slides every time
- The demo should tell a STORY: problem -> architecture -> working solution
- End with "and here's what's next" to show the roadmap is clear
