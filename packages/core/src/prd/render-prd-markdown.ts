import type { PRD } from '../types/cross-boundary-artifacts.js';

/**
 * Deterministic markdown rendering of a structured PRD.
 *
 * Single source of truth for the human-readable form of a PRD. Used by:
 *   1. createProject — writes the result to docs/prd.md on approval.
 *   2. Design pipeline initState() — derives prdRequirements[0] when an
 *      EnrichedRequirement is provided and prdRequirements is not set.
 *
 * Section order per ADR-053: Title, Screens, Data Entities, Personas,
 * Features, NFRs, Success Metrics, Out of Scope. Do not reorder without
 * a superseding ADR.
 *
 * Output is stable for a given input (no timestamps, no random ordering).
 */
export function renderPrdToMarkdown(prd: PRD): string {
  const out: string[] = [];

  out.push(`# ${prd.title}`, '');
  out.push(prd.description, '');

  out.push('## Screens');
  for (const s of prd.screens) {
    const type = s.screenType ? ` (${s.screenType})` : '';
    out.push(`- **${s.name}**${type}: ${s.description}`);
  }
  out.push('');

  out.push('## Data Entities');
  for (const e of prd.dataEntities) {
    out.push(`- **${e.name}**`);
    for (const f of e.fields) {
      const req = f.required ? ' _(required)_' : '';
      out.push(`  - \`${f.name}\`: ${f.type}${req}`);
    }
    if (e.relationships?.length) {
      out.push(`  - Relationships: ${e.relationships.join(', ')}`);
    }
  }
  out.push('');

  if (prd.personas.length > 0) {
    out.push('## Personas');
    for (const p of prd.personas) {
      out.push(`- **${p.name}** (${p.role})`);
      for (const g of p.goals) out.push(`  - Goal: ${g}`);
    }
    out.push('');
  }

  out.push('## Features');
  for (const f of prd.features) {
    const priority = f.priority ? ` _[${f.priority}]_` : '';
    out.push(`- **${f.name}**${priority}: ${f.description}`);
  }
  out.push('');

  if (prd.nfrs.length > 0) {
    out.push('## Non-Functional Requirements');
    for (const n of prd.nfrs) {
      const target = n.target ? ` — target: ${n.target}` : '';
      out.push(`- **${n.category}**: ${n.description}${target}`);
    }
    out.push('');
  }

  if (prd.successMetrics.length > 0) {
    out.push('## Success Metrics');
    for (const m of prd.successMetrics) {
      out.push(`- **${m.name}**: ${m.description} — target: ${m.target}`);
    }
    out.push('');
  }

  if (prd.outOfScope.length > 0) {
    out.push('## Out of Scope');
    for (const o of prd.outOfScope) out.push(`- ${o}`);
    out.push('');
  }

  return out.join('\n').trimEnd() + '\n';
}
