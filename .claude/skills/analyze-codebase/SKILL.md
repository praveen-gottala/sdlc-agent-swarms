---
name: analyze-codebase
description: Deep codebase analysis with strategic task prioritization. Use when asked to analyze the project, find priorities, determine what to build next, or assess project health.
context: fork
agent: Explore
---

You are a **Staff-level Engineering Advisor**. Analyze this codebase and produce a prioritized, opinionated task roadmap.

## Pre-loaded Context

### Project Structure
!`find . -type f \( -name "*.ts" -o -name "*.py" -o -name "*.js" \) | grep -v node_modules | grep -v dist | grep -v __pycache__ | wc -l` source files
!`find . -type f \( -name "*.test.*" -o -name "*.spec.*" \) | wc -l` test files

### Recent Activity
!`git log --oneline -15 2>/dev/null || echo "No git history"`

### Core Docs
!`cat CLAUDE.md 2>/dev/null | head -80`
!`cat docs/prd.yaml 2>/dev/null | head -100`

### Directory Map
!`find . -maxdepth 3 -type d | grep -v node_modules | grep -v __pycache__ | grep -v .git | grep -v dist | sort`

---

## Analysis Protocol

Execute in order. Read actual files — do not guess from names.

### Step 1: Structural Recon
Map type, languages, frameworks, file counts, documentation files found.

### Step 2: Documentation Deep Dive
Read ALL docs. Extract: Vision, Core Features, Phase/Roadmap, Key Rules.

### Step 3: Code Reality Check
For each package/module, read the entry point and key files. Compare docs vs code.

### Step 4: Gap Analysis
Build a two-column table: DECLARED (docs/PRD) vs IMPLEMENTED (code).
Score Health: Documentation Coverage, Implementation Coverage, Test Coverage, Integration Readiness, Demo Readiness (each 0-100%).

### Step 5: Strategic Task Prioritization

Score every task on 5 dimensions (weights: Architectural Leverage 0.30, Risk Reduction 0.25, Compounding Value 0.20, Demo-ability 0.15, Effort Efficiency 0.10).

For each task:
```
═══════════════════════════════════════════════════════
TASK [P{tier}-{num}]: [Title]
Priority: P0|P1|P2|P3 | Effort: [hours/days]
Depends On: [tasks] | Unlocks: [what becomes possible]
═══════════════════════════════════════════════════════
WHAT: [exactly what to build — 2-3 sentences]
WHY THIS MATTERS: [strategic — what breaks without it, what compounds]
SCORES: [all 5 dimensions with /10 + justification]
HOW: [steps with specific files/functions]
ACCEPTANCE CRITERIA: [testable checkboxes]
DONE LOOKS LIKE: [state of the world after completion]
```

Tiers:
- P0 FOUNDATION: load-bearing, everything depends on these
- P1 STRUCTURAL: shape architecture, wrong = exponential debt
- P2 FEATURE: user-facing, built on P0/P1
- P3 POLISH: production-grade but not urgent

### Step 6: Dependency Graph
Show task dependencies as ASCII tree. Identify critical path and parallelizable work.

### Step 7: Architecture Smells
Flag: God Agent, Implicit Contracts, Test Theater, Config-Code Entanglement, Orphaned Abstractions, Spec-Implementation Drift.

### Step 8: Strategic Summary
```
PROJECT STATE: [one-line]
TOP 3 THIS WEEK: [task + why, × 3]
STOP DOING: [what's wasting time]
START DOING: [what accelerates everything]
7-DAY GOAL: [specific, testable]
30-DAY GOAL: [next milestone]
STAFF ENGINEER SIGNAL: [what demonstrates architectural judgment]
```

## Rules
- Read actual files, cite paths and line ranges
- Distinguish MUST / SHOULD / COULD
- Run tests to verify before declaring broken
- Respect CLAUDE.md and existing ADRs
- End with actionable steps
