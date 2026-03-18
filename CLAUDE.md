# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.
Open source, Apache 2.0.

## Tech Stack
- Monorepo: Nx with TypeScript
- CLI: Commander.js (packages/cli)
- Orchestration engine: Python + LangGraph (services/engine)
- Event bus: In-memory EventEmitter (v1), Redis Streams later
- State: YAML files in git (v1)
- Testing: Jest + ts-jest for all packages
- Linting: ESLint + Prettier (config in root)

## Architecture
See docs/architecture.md for layer diagram.
See docs/PRD-v2.md for full product spec.
Governance is MIDDLEWARE, not a service — it wraps agent execution.
Agents communicate via event bus ONLY. No direct agent-to-agent calls.

## Package Dependencies
core depends on: nothing (zero external deps beyond yaml, eventemitter3)
governance depends on: core
providers depends on: core
channels depends on: core
cli depends on: core, governance, providers, channels
agents-* depend on: core, governance, providers

## Commands
- Build all: nx run-many -t build
- Test single package: nx test core
- Test all: nx run-many -t test
- Lint: nx run-many -t lint
- Type check: nx run-many -t typecheck

## Code Conventions
- Strict TypeScript (strict: true, no any)
- Functional style, avoid classes except where interfaces demand it
- All public APIs must have JSDoc comments
- Every module exports via index.ts barrel file
- Error handling: Result pattern (never throw), see docs/error-handling.md
- File naming: kebab-case for files, PascalCase for types/interfaces

## IMPORTANT
- ALWAYS run typecheck after making changes across packages
- NEVER modify packages/stacks/react-node-prisma/prompts/ without asking
- Test files go next to source files (foo.ts → foo.test.ts)
- When creating interfaces, check if core/src/types/ already has one