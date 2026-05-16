/**
 * @module @agentforge/agents-architect/graph/nodes/context-assembler
 *
 * Node 1 — Context Assembler.
 * Greenfield: deterministic constraint extraction from EnrichedRequirement (no LLM).
 * Brownfield: 1 Sonnet call to produce repo-map digest capped at 20K tokens (R2 §7.6).
 *
 * Produces ConstraintSet for downstream nodes.
 */

import { debugLog } from '@agentforge/core';
import type { Constraint, Gap, ConstraintSet } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

interface PRDLike {
  readonly features: readonly { readonly id: string; readonly name: string; readonly description: string }[];
  readonly dataEntities: readonly { readonly id: string; readonly name: string; readonly fields?: readonly { readonly name: string }[] }[];
  readonly nfrs: readonly { readonly id: string; readonly category: string; readonly description: string }[];
  readonly screens: readonly { readonly id: string; readonly name: string }[];
  readonly outOfScope: readonly string[];
}

/** Extract hard/soft constraints from PRD NFRs and outOfScope entries. */
export function extractConstraintsFromPrd(prd: PRDLike): Constraint[] {
  const constraints: Constraint[] = [];

  for (const nfr of prd.nfrs) {
    const isHard =
      nfr.category.toLowerCase() === 'accessibility' &&
      /wcag/i.test(nfr.description);

    constraints.push({
      id: `constraint-${nfr.id}`,
      type: isHard ? 'hard' : 'soft',
      category: nfr.category,
      description: nfr.description,
      source: 'prd.nfrs',
    });
  }

  for (let i = 0; i < prd.outOfScope.length; i++) {
    constraints.push({
      id: `constraint-scope-${i}`,
      type: 'soft',
      category: 'scope-exclusion',
      description: `Out of scope: ${prd.outOfScope[i]}`,
      source: 'prd.outOfScope',
    });
  }

  return constraints;
}

const FEATURE_GAP_PATTERNS: readonly { readonly pattern: RegExp; readonly id: string; readonly axis: string; readonly description: string }[] = [
  { pattern: /\b(real[- ]?time|websocket|push|live\s+update|streaming)\b/i, id: 'gap-realtime-strategy', axis: 'api', description: 'Real-time communication strategy (WebSocket, SSE, polling)' },
  { pattern: /\b(file\s+upload|image\s+upload|attachment|media\s+upload)\b/i, id: 'gap-storage-strategy', axis: 'api', description: 'File/media storage strategy (S3, local filesystem, CDN)' },
  { pattern: /\b(payment|billing|subscription|checkout|stripe)\b/i, id: 'gap-payment-provider', axis: 'api', description: 'Payment processing provider and integration approach' },
  { pattern: /\b(auth|login|sign[- ]?in|sign[- ]?up|registration|oauth)\b/i, id: 'gap-auth-strategy', axis: 'api', description: 'Authentication and authorization approach' },
  { pattern: /\b(notification|alert|email|sms|push\s+notification)\b/i, id: 'gap-notification-channel', axis: 'api', description: 'Notification delivery channels and infrastructure' },
  { pattern: /\b(search|full[- ]?text|filter|autocomplete)\b/i, id: 'gap-search-strategy', axis: 'api', description: 'Search and filtering implementation approach' },
];

/** Derive architectural gaps from PRD analysis. */
export function extractGapsForGreenfield(prd: PRDLike): Gap[] {
  const gaps: Gap[] = [];
  const seen = new Set<string>();

  // Universal greenfield gaps
  gaps.push(
    { id: 'gap-data-store', axis: 'data-model', description: 'Data persistence strategy (e.g., in-memory, SQLite, PostgreSQL, Supabase)' },
    { id: 'gap-styling-approach', axis: 'design-system', description: 'CSS/styling methodology (e.g., Tailwind, CSS Modules, styled-components)' },
    { id: 'gap-component-library', axis: 'component', description: 'UI component library (e.g., shadcn/ui, MUI, Mantine, custom)' },
  );
  for (const g of gaps) seen.add(g.id);

  // Entity-driven gaps
  if (prd.dataEntities.length >= 5) {
    gaps.push({ id: 'gap-orm-strategy', axis: 'data-model', description: 'ORM or data access library for managing 5+ entity types' });
    seen.add('gap-orm-strategy');
  }

  const hasRelationships = prd.dataEntities.some((e) =>
    e.fields?.some((f) => /id$/i.test(f.name) && f.name !== 'id'),
  );
  if (hasRelationships && !seen.has('gap-orm-strategy')) {
    gaps.push({ id: 'gap-data-access-pattern', axis: 'data-model', description: 'Data access pattern for entity relationships (repository, active record, query builder)' });
    seen.add('gap-data-access-pattern');
  }

  // NFR-driven gaps
  const hasPerformanceNfr = prd.nfrs.some((n) => /performance/i.test(n.category));
  if (hasPerformanceNfr) {
    gaps.push({ id: 'gap-caching-strategy', axis: 'api', description: 'Caching strategy for performance targets (in-memory, Redis, HTTP cache)' });
    seen.add('gap-caching-strategy');
  }

  // Feature-driven gaps
  const allFeatureText = prd.features.map((f) => `${f.name} ${f.description}`).join(' ');
  for (const { pattern, id, axis, description } of FEATURE_GAP_PATTERNS) {
    if (!seen.has(id) && pattern.test(allFeatureText)) {
      gaps.push({ id, axis, description });
      seen.add(id);
    }
  }

  // OutOfScope-driven gaps: create resolved gaps for excluded capabilities
  const outOfScopeText = prd.outOfScope.join(' ');
  for (const { pattern, id, axis, description } of FEATURE_GAP_PATTERNS) {
    if (!seen.has(id) && pattern.test(outOfScopeText)) {
      gaps.push({ id, axis, description, resolvedValue: 'none', resolvedBy: 'scope-exclusion' });
      seen.add(id);
    }
  }

  return gaps;
}

/** Create the Context Assembler node (Node 1). */
export function createContextAssembler(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog(`contextAssembler: ENTER mode=${state.mode}`);

    const req = state.enrichedRequirement;
    if (!req) {
      debugLog('contextAssembler: EXIT (no enrichedRequirement)');
      return {};
    }

    const constraints = extractConstraintsFromPrd(req.prd);
    const gaps = extractGapsForGreenfield(req.prd);

    // TODO: Brownfield path — 1 Sonnet call for repo-map digest (uses deps.retrievalTools)

    debugLog(`contextAssembler: EXIT constraints=${constraints.length} gaps=${gaps.length}`);

    const constraintSet: ConstraintSet = {
      projectId: deps.projectId,
      constraints,
      gaps,
      mode: state.mode,
    };

    return { constraintSet };
  };
}
