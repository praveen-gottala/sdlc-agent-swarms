# Agent instructions — Cursor + Claude Code

This file is the **navigation hub** for AI agents using **Cursor** or **Claude Code** in this repo. It avoids duplicating long rules; it tells you **what to read and when**.

## Canonical project rules (stable)

| File | Role |
|------|------|
| **`CLAUDE.md`** | Full AgentForge rules: tests, PRD, architecture, commands, browser-first debugging, skills. **Claude Code loads this automatically.** Cursor agents should read it for substantive work unless mirrored in `.cursor/rules/`. |
| **`docs/lessons-learned.md`** | Append-only learnings. **Read at session start** before writing code (per `CLAUDE.md`). |
| **`docs/PRD-v2.md`** | Product intent; TypeScript types in `packages/core/src/types/` win for field-level truth (ADR-038). |
| **`docs/architecture.md`** | Layer diagram and system shape. |

Keep **`CLAUDE.md` roughly under ~200 lines** for context efficiency; if it grows, **move sections to `docs/`** and link instead of pasting into multiple places.

## Focused behavioral rules (`.claude/rules/`)

Short, topical rules that supplement `CLAUDE.md`. Read whichever applies to the task:

| File | Role |
|------|------|
| **`.claude/rules/honesty.md`** | No deflection when stuck; isolate before guessing; don't loop. |
| **`.claude/rules/karpathy-guidelines.md`** | Think before coding, simplicity first, surgical changes, goal-driven execution (adapted from Andrej Karpathy). Complements — does not replace — `CLAUDE.md`. |
| **`.claude/rules/prd-compliance.md`**, **`testing.md`**, **`typescript.md`**, etc. | Topic-specific conventions; read when touching those areas. |

## Episodic handoff (volatile — do not turn into always-on rules)

| File | Role |
|------|------|
| **`docs/design-review-session-handoff.md`** | Active design-review process, renderer gotchas, per-project review status, “what’s next.” **Update when you run a review pass.** |

**Do not copy** handoff content into `.cursor/rules/*.mdc` or into `CLAUDE.md` wholesale — it changes often and would bloat every session. Instead:

- Add a **one-line pointer** in `CLAUDE.md` under `Last session:` when a handoff is active, e.g.  
  `Last session: design review — see docs/design-review-session-handoff.md`

## Recommended split: rules vs handoffs

| Content type | Where it lives | Why |
|--------------|----------------|-----|
| Stable policies (tests, PRD, how to run commands) | `CLAUDE.md` (+ optional Cursor rules that **link** to it) | Same expectations every session; worth the tokens. |
| Session/thread state (“we’re fixing renderer chips this week”) | Handoff doc + `Last session` line | Changes weekly; belongs in docs, not in `alwaysApply` rules. |

## Cursor-specific (optional)

- **`.cursor/rules/*.mdc`** — Short, composable rules: `alwaysApply: true` for a **brief** pointer (“Follow `CLAUDE.md` and `AGENTS.md`”), or **`globs`** for path-scoped rules (e.g. `packages/designspec-renderer/**` for renderer conventions).
- Prefer **referencing files** (`CLAUDE.md`, `docs/...`) over pasting long text into `.mdc` files (saves tokens, single source of truth).

## Claude Code-specific

- **`CLAUDE.md`** remains the primary auto-loaded project file.
- Skills under **`.claude/skills/`** stay Claude-only; no need to duplicate them for Cursor.

## Dual-tool hygiene (2026 practice)

1. **One source of truth** for rules: this repo uses **`CLAUDE.md`** as that source; **`AGENTS.md`** is the map (this file).
2. **Do not maintain two full copies** of the same rules in Cursor and Claude files — use pointers + links.
3. After **renderer or dashboard UI** changes, verify with a **hard refresh** and, if needed, restart the Vite renderer (port 4100); see `docs/design-review-session-handoff.md`.
