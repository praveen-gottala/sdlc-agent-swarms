---
paths: ["packages/cli/src/commands/**", "packages/cli/src/index.ts"]
---

# CLI Command Change Checklist
When adding, modifying, or removing a CLI command or option, update ALL of these:

1. `packages/cli/src/commands/<command>.ts` — implementation
2. `packages/cli/src/index.ts` — Commander registration (`.command()`, `.option()`, `.action()`)
3. `packages/cli/src/index.ts` (bottom) — re-export types/functions if changed
4. `docs/cli/setup.md` or `docs/cli/design.md` or `docs/cli/orchestration.md` — detailed docs
5. `docs/cli/README.md` — CLI index table
6. `README.md` — top-level CLI Command Reference table
7. `packages/cli/src/commands/<command>.test.ts` — tests for new behavior
8. Interfaces/config types — e.g. `InitConfig`, `GenerateDesignOptionsConfig`
9. `.vscode/launch.json` — add/update debug launch configuration with all args and flags
