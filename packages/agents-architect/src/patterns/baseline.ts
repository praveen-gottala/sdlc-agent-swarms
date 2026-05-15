/**
 * @module @agentforge/agents-architect/patterns/baseline
 *
 * Seed implementation-pattern catalog merged with Node 3 LLM output (M3 Phase 4).
 * Baseline ids are stable; LLM may override same id or add new patterns at exit.
 */

import type { ImplementationPattern } from '@agentforge/core';

/** Default patterns recommended for CashPulse-class full-stack apps (R6 §7.1). */
export const BASELINE_IMPLEMENTATION_PATTERNS: readonly ImplementationPattern[] = [
  {
    id: 'data-access-drizzle-only',
    category: 'data-access',
    title: 'Drizzle ORM for all persistence',
    rule: 'Use Drizzle schemas and queries only; no raw SQL except inside reviewed migrations.',
    rationale: 'Keeps schema drift and parallel-task DB access consistent.',
    appliesTo: ['backend'],
  },
  {
    id: 'api-error-rfc7807',
    category: 'error-handling',
    title: 'Problem+json error envelope',
    rule: 'HTTP errors use application/problem+json with code, message, optional details; same shape on every route.',
    rationale: 'Prevents T3/T4 mismatch on error handling (R6 Q2, Cognition Principle 2).',
    appliesTo: ['backend', 'integration'],
  },
  {
    id: 'component-tailwind-tokens-only',
    category: 'styling',
    title: 'Tailwind via design tokens only',
    rule: 'No arbitrary hex colors or one-off palette utilities; use semantic tokens from the design system.',
    forbids: ['text-gray-400 without token mapping', 'inline style color for theme surfaces'],
    rationale: 'Grounds failure mode #8 in R6 Q5 (token drift).',
    appliesTo: ['frontend'],
  },
  {
    id: 'state-server-only',
    category: 'other',
    title: 'Authoritative state on the server',
    rule: 'React state is ephemeral UI only; budgets, transactions, and sessions are loaded and mutated via API.',
    rationale: 'Avoids split-brain between client guesses and server truth.',
    appliesTo: ['frontend', 'backend'],
  },
  {
    id: 'validation-zod-at-boundary',
    category: 'other',
    title: 'Zod at HTTP and RPC boundaries',
    rule: 'Parse and validate every inbound request body and query with Zod before handlers run.',
    appliesTo: ['backend'],
  },
  {
    id: 'auth-middleware-required',
    category: 'auth',
    title: 'Session auth via shared middleware',
    rule: 'Protected routes and handlers run behind the same auth middleware stack; no ad-hoc cookie checks in handlers.',
    appliesTo: ['backend'],
  },
  {
    id: 'logging-structured-pino',
    category: 'logging',
    title: 'Structured JSON logging',
    rule: 'Use structured logging (e.g. pino) with correlation ids; no console.log in production paths.',
    appliesTo: ['backend', 'integration'],
  },
];

/**
 * Merge baseline patterns with model-emitted patterns.
 * Same `id` → override value from `derived` wins (later wins).
 */
export function mergeImplementationPatterns(
  baseline: readonly ImplementationPattern[],
  derived: readonly ImplementationPattern[],
): ImplementationPattern[] {
  const byId = new Map<string, ImplementationPattern>();
  for (const p of baseline) byId.set(p.id, p);
  for (const p of derived) byId.set(p.id, p);
  return [...byId.values()];
}
