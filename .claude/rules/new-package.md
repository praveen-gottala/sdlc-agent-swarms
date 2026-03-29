---
paths: ["packages/*/package.json", "packages/*/tsconfig.json"]
---

# New Package Checklist
When adding a new package to the monorepo, create/update ALL of these:

1. `packages/<name>/` — `package.json`, `tsconfig.json` (extends `../../tsconfig.base.json`), `tsconfig.lib.json`, `src/index.ts` barrel
2. Consumer `package.json` files — add as dependency in packages that import it
3. `README.md` — update Architecture package list
4. `CLAUDE.md` — update "Package Dependencies" section
