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

---

## ADR-021: Single on_complete Emission Rule
**Context:** `packages/core/src/agent-runtime/base-agent.ts`
**Rule:** workFn implementations must NOT manually emit the `on_complete` event type. `runAgent()` is the single source of on_complete emission.
**Why:** Double emission produces duplicate audit entries, triggers downstream subscribers twice (orchestrator, V3 dashboard WebSocket), and violates PRD Section 10.1 which specifies on_complete fires once per task completion.
**How to apply:** When writing agent work functions, return detailed data via `Ok(output)`. Never call `ctx.eventBus.publish({ type: contract.on_complete, ... })` inside workFn. For intermediate progress, emit a *different* event type (e.g. progress events).

---

## ADR-022: TypeScript-Only Engine
**Context:** PRD Section 4.3 specifies Python/LangGraph engine
**Rule:** The implementation uses TypeScript-only orchestration. No Python process, no REST/gRPC bridge.
**Why:** All behavioral requirements pass in TypeScript. Single-process simplicity, better type safety, simpler deployment. LangGraph features (graph persistence, visualization) deferred to V3 Dashboard and Phase 2 Redis migration.
**How to apply:** When referencing architecture, use the TypeScript package names (@agentforge/core, @agentforge/governance). Do not assume a Python sidecar exists.
