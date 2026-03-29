---
paths: ["**/*.ts", "**/*.tsx"]
---

# TypeScript Rules

- Use strict TypeScript — no `any` types. Use `unknown` + type guards instead.
- ES modules only (`import/export`), never CommonJS (`require`).
- Destructure imports: `import { foo } from 'bar'` not `import bar from 'bar'` unless default export.
- Interfaces over types for object shapes. Types for unions/intersections.
- All exported functions must have explicit return types.
- Use Commander.js patterns consistent with existing commands in `packages/cli/src/commands/`.
- Error handling: throw typed errors extending `AgentForgeError` base class.
- File naming: `kebab-case.ts` for files, `PascalCase` for classes/interfaces, `camelCase` for functions/variables.

## Code Conventions
- Strict TypeScript (strict: true, no any)
- Functional style, avoid classes except where interfaces demand it
- All public APIs must have JSDoc comments
- Every module exports via index.ts barrel file
- Error handling: Result pattern (never throw), see docs/error-handling.md

## Debug Logging for Backfills and Defaults
- When code backfills missing values, derives defaults, or applies hardcoded
  fallbacks at runtime, use `debugLog()` or `logDefaults()` from `@agentforge/core`.
- Log what was missing/backfilled and the values applied.
- Use: `debugLog('context: message')` for single messages.
- Use: `logDefaults('fnName', { field: [actualValue, 'fallback'] })` for
  multiple fields with defaults (only logs falsy fields).
- Import: `import { debugLog, logDefaults } from '@agentforge/core';`
  (or from `'../debug-log.js'` within the core package itself).
- Both are no-ops when `process.env.DEBUG` is unset — callers never check env.
- This does NOT apply to code that terminates/throws on missing values — only
  to code that silently continues with derived/default values.

## Important Reminders
- ALWAYS run typecheck after making changes across packages
- NEVER modify packages/stacks/react-node-prisma/prompts/ without asking
- Test files go next to source files (foo.ts → foo.test.ts)
- When creating interfaces, check if core/src/types/ already has one
