# ADR-025: V3 Dashboard Greenfield Package

## Status
Accepted

## Date
2026-03-19

## Context
The AgentForge monorepo needs a web dashboard for V3. PRD Section 27 defines 13 domain events the dashboard must consume in real-time, and PRD Section 28 defines 10 REST API endpoints the dashboard will call.

## Decision

### Framework: Next.js 14 App Router
- Next.js `^14.2.0` is already in the root `package.json`
- App Router provides file-based routing, server components, and layouts
- SSR for initial load performance; client components for real-time updates

### Styling: Tailwind CSS
- `tailwindcss@^3.4.0` already in root dependencies
- Utility-first approach consistent with project conventions
- Component primitives via ShadCN/UI (to be initialized separately via `npx`)

### TypeScript Configuration
The dashboard does **not** extend `tsconfig.base.json`. Rationale:
- The base config uses `module: nodenext` which is incompatible with Next.js bundler mode
- Next.js requires `jsx: preserve`, `moduleResolution: bundler`, and the `next` TS plugin
- The dashboard has its own `tsconfig.json` with Next.js-compatible settings
- It does NOT use `tsconfig.lib.json` since Next.js has its own build system (`next build`)

### Cross-Package Dependency
Only `@agentforge/core` is referenced, for:
- Domain event types (PRD Section 27)
- Shared types (`TaskStatus`, `PhaseSummary`, etc.)
- `transpilePackages` in `next.config.js` ensures core is compiled correctly

### Package Characteristics
- `private: true` — this is an application, not a published library
- Nx `project.json` wires `dev`, `build`, `test`, and `typecheck` targets
- Jest with `jsdom` environment for component testing

## Consequences
- Dashboard TypeScript settings are decoupled from the monorepo base config
- ShadCN/UI must be initialized separately (`npx shadcn-ui@latest init`)
- The dashboard build is handled by Next.js, not the Nx TypeScript builder
