# Lessons Learned

## Clean Code Discipline
**Context:** Monorepo-wide code quality  
**Rule:** Never leave dead code (unused imports, variables, etc.) even if pre-existing. Fix all issues across the full codebase, not just the files you touched.  
**Why:** Production-quality, push-ready code is the baseline. Unused imports and skipped test runs violate software design principles and block clean pushes.  
**How to apply:** After any change, run full typecheck + tests across the entire monorepo. Fix all errors — not just in changed files. Do not declare done until `nx run-many -t typecheck` and all tests pass clean.

---

## Engine Test Strategy
**Context:** `services/engine` — orchestration engine tests  
**Rule:** Always test through real server API endpoints, never by compiling LangGraph graphs directly.  
**Why:** Direct graph compilation bypasses server-level logic (request parsing, phase config lookup, graph compilation, async task management) and can mask bugs like the hardcoded `interrupt_before` issue. Tests must validate real behavior, not workarounds.  
**How to apply:**
- Use the `client` fixture (`httpx AsyncClient` + `ASGITransport`) to call endpoints: `/phase/start`, `/gate/approve`, `/status`, etc.
- Use `asyncio.sleep()` to wait for async graph execution between `start`/`approve` calls.
- Use `load_tasks()` to verify state transitions on disk.
- Add regression tests in `TestPerPhaseInterruptRegression` for any new phase-specific fixes.
