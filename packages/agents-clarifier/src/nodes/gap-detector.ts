/**
 * @module @agentforge/agents-clarifier/nodes/gap-detector
 *
 * Gap/Conflict Detector node (Task 1.3).
 * Pass 1 (deterministic): intent-level checks — scope, users, platform, data entry.
 * Pass 2 (ClarifyGPT): 3 plausible implementations, divergence = gap.
 * Model: claude-sonnet-4-6. Cost cap: 3 extra LLM calls.
 * All LLM calls via TracedProvider (ADR-046).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePromptFrontmatter, debugLog } from '@agentforge/core';
import type { PRD } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState, ClarifierContext, ClarifierMode, Gap, StructuredOption } from '../types.js';

// ---------------------------------------------------------------------------
// Prompt loading (cached, lazy)
// ---------------------------------------------------------------------------

let implPromptCache: string | undefined;
let implVersionCache: string | undefined;
const divergePromptCache: Record<string, string> = {};
const divergeVersionCache: Record<string, string | undefined> = {};

function promptDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
}

function loadImplPrompt(): string {
  if (implPromptCache) return implPromptCache;
  const raw = readFileSync(join(promptDir(), 'gap-detector-system.md'), 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  implPromptCache = parsed.body;
  implVersionCache = parsed.frontmatter.version;
  return implPromptCache;
}

function loadDivergePrompt(mode: ClarifierMode): string {
  if (divergePromptCache[mode]) return divergePromptCache[mode];
  const filename = mode === 'bootstrap' ? 'gap-divergence-bootstrap.md' : 'gap-divergence-evolution.md';
  const raw = readFileSync(join(promptDir(), filename), 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  divergePromptCache[mode] = parsed.body;
  divergeVersionCache[mode] = parsed.frontmatter.version;
  return divergePromptCache[mode];
}

/** Reset cached prompts — test-only. */
export function _resetPromptCache(): void {
  implPromptCache = undefined;
  implVersionCache = undefined;
  delete divergePromptCache.bootstrap;
  delete divergePromptCache.evolution;
  delete divergeVersionCache.bootstrap;
  delete divergeVersionCache.evolution;
}

// ---------------------------------------------------------------------------
// JSON Schemas for structured LLM output
// ---------------------------------------------------------------------------

const IMPL_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      implementations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            approach: { type: 'string' },
            keyDecisions: { type: 'array', items: { type: 'string' } },
          },
          required: ['approach', 'keyDecisions'],
          additionalProperties: false,
        },
      },
    },
    required: ['implementations'],
    additionalProperties: false,
  },
};

const DIVERGE_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'One or two word topic label (e.g. "Sharing", "Notifications", "Data detail")' },
            description: { type: 'string', description: 'User-friendly question — written for the person who described the app, not for a developer reading a spec' },
            category: {
              type: 'string',
              enum: ['missing', 'ambiguous', 'conflicting', 'incomplete'],
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  tradeoffs: { type: 'array', items: { type: 'string' } },
                  recommended: { type: 'boolean' },
                  source: { type: 'string', enum: ['llm', 'codebase', 'template', 'catalog'] },
                  citation: { type: 'string' },
                },
                required: ['label', 'description', 'rationale', 'recommended', 'source'],
                additionalProperties: false,
              },
            },
          },
          required: ['topic', 'description', 'category', 'options'],
          additionalProperties: false,
        },
      },
    },
    required: ['gaps'],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Pass 1: Intent-level deterministic checklist
// ---------------------------------------------------------------------------

const AUTH_KEYWORDS = ['login', 'auth', 'sign in', 'sign up', 'register', 'password', 'session', 'token', 'oauth'];
const USER_DATA_KEYWORDS = ['user', 'account', 'profile', 'personal', 'private'];
const PLATFORM_KEYWORDS = ['web', 'mobile', 'ios', 'android', 'desktop', 'browser', 'app store', 'pwa'];

function hasKeywords(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function prdText(prd: PRD): string {
  const parts = [
    prd.title,
    prd.description,
    ...prd.features.map((f) => `${f.name} ${f.description}`),
    ...prd.screens.map((s) => `${s.name} ${s.description}`),
    ...prd.nfrs.map((n) => `${n.category} ${n.description}`),
  ];
  return parts.join(' ');
}

/**
 * Group PRD features into user-facing clusters for scope confirmation.
 * Returns groups with labels, descriptions, and whether the raw seed implies them.
 */
function groupFeaturesByIntent(prd: PRD, rawInput: string): StructuredOption[] {
  const seedLower = rawInput.toLowerCase();
  const groups: Map<string, { features: typeof prd.features; implied: boolean }> = new Map();

  for (const f of prd.features) {
    const key = categorizeFeature(f.name, f.description);
    const existing = groups.get(key);
    if (existing) {
      existing.features.push(f);
    } else {
      const featureLower = `${f.name} ${f.description}`.toLowerCase();
      const implied = seedLower.split(/\s+/).some((word) =>
        word.length > 3 && featureLower.includes(word),
      ) || f.priority === 'must-have';
      groups.set(key, { features: [f], implied });
    }
  }

  return Array.from(groups.entries()).map(([label, group]) => {
    const featureNames = group.features.map((f) => f.name).join(', ');
    return {
      label,
      description: featureNames,
      rationale: group.implied
        ? 'Directly related to what you described.'
        : 'A common addition for this type of app.',
      tradeoffs: group.implied
        ? ['+ Core to your idea']
        : ['+ Makes the app more complete', '- Adds development time'],
      recommended: group.implied,
      source: 'template' as const,
    };
  });
}

function categorizeFeature(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes('report') || text.includes('chart') || text.includes('insight') || text.includes('analytic') || text.includes('summary') || text.includes('overview')) return 'Reports & insights';
  if (text.includes('budget') || text.includes('limit') || text.includes('alert') || text.includes('goal')) return 'Budgets & goals';
  if (text.includes('category') || text.includes('tag') || text.includes('label') || text.includes('group')) return 'Categories & organization';
  if (text.includes('export') || text.includes('import') || text.includes('csv') || text.includes('download') || text.includes('backup')) return 'Data export & backup';
  if (text.includes('setting') || text.includes('preference') || text.includes('config') || text.includes('theme')) return 'Settings & preferences';
  if (text.includes('auth') || text.includes('login') || text.includes('sign') || text.includes('account') || text.includes('register')) return 'User accounts';
  if (text.includes('search') || text.includes('filter') || text.includes('sort')) return 'Search & filtering';
  if (text.includes('notification') || text.includes('remind') || text.includes('alert')) return 'Notifications';
  if (text.includes('share') || text.includes('collaborat') || text.includes('invite') || text.includes('team')) return 'Sharing & collaboration';
  return 'Core features';
}

function runDeterministicChecklist(prd: PRD, rawInput: string, mode: ClarifierMode, round: number): Gap[] {
  const gaps: Gap[] = [];
  const fullText = prdText(prd);
  let idx = 0;

  // --- Intent-level checks (become questions) ---

  // Scope confirmation: always in bootstrap round 0, shows feature groups
  if (mode === 'bootstrap' && round === 0 && prd.features.length > 1) {
    const featureGroups = groupFeaturesByIntent(prd, rawInput);
    if (featureGroups.length > 1) {
      const groupLabels = featureGroups.map((g) => g.label).join(', ');
      gaps.push({
        id: `det-scope-${idx++}`,
        topic: 'Scope',
        description: `We're planning these capabilities: ${groupLabels}. Which of these matter to you?`,
        category: 'missing',
        confidence: 0.05,
        deterministic: true,
        divergentInterpretations: featureGroups,
        divergenceScore: 1.0,
      });
    }
  }

  // User count: when PRD mentions user/personal data but no explicit auth features
  const hasUserData = hasKeywords(fullText, USER_DATA_KEYWORDS);
  const hasAuth = hasKeywords(fullText, AUTH_KEYWORDS) ||
    prd.features.some((f) => hasKeywords(`${f.name} ${f.description}`, AUTH_KEYWORDS));

  if (hasUserData && !hasAuth) {
    gaps.push({
      id: `det-users-${idx++}`,
      topic: 'Users',
      description: 'Is this just for you, or should multiple people have separate accounts?',
      category: 'missing',
      confidence: 0.3,
      deterministic: true,
      divergentInterpretations: INTENT_TEMPLATE_OPTIONS.userCount,
      divergenceScore: 0.67,
    });
  }

  // Platform: when no platform keywords in seed
  if (!hasKeywords(rawInput, PLATFORM_KEYWORDS)) {
    gaps.push({
      id: `det-platform-${idx++}`,
      topic: 'Platform',
      description: 'Should this be a web app, a mobile app, or both?',
      category: 'missing',
      confidence: 0.4,
      deterministic: true,
      divergentInterpretations: INTENT_TEMPLATE_OPTIONS.platform,
      divergenceScore: 0.67,
    });
  }

  // Data entry style: when primary entity has 4+ fields
  const primaryEntity = prd.dataEntities[0];
  if (primaryEntity && primaryEntity.fields.length >= 4) {
    const entityName = primaryEntity.name.toLowerCase();
    gaps.push({
      id: `det-dataentry-${idx++}`,
      topic: `Adding ${entityName}s`,
      description: `How do you want to add ${entityName}s — quick entry with just the basics, or detailed with all the info?`,
      category: 'ambiguous',
      confidence: 0.4,
      deterministic: true,
      divergentInterpretations: buildDataEntryOptions(primaryEntity),
      divergenceScore: 0.67,
    });
  }

  // --- Phantom gaps (auto-assumptions, never asked) ---
  // These have high confidence + low divergenceScore, so the over-asking gate
  // routes them directly to the assumption ledger.

  const formKeywords = ['form', 'input', 'submit', 'add', 'create', 'edit', 'update'];
  const hasForms = hasKeywords(fullText, formKeywords) ||
    prd.screens.some((s) => hasKeywords(`${s.name} ${s.description}`, formKeywords));

  if (hasForms) {
    gaps.push({
      id: `det-phantom-validation-${idx++}`,
      topic: 'Validation',
      description: 'Instant validation with clear error messages for all form inputs.',
      category: 'missing',
      confidence: 0.95,
      deterministic: true,
      divergenceScore: 0.0,
    });
  }

  gaps.push({
    id: `det-phantom-errors-${idx++}`,
    topic: 'Error handling',
    description: 'Toast messages for minor errors, inline messages for form errors.',
    category: 'missing',
    confidence: 0.95,
    deterministic: true,
    divergenceScore: 0.0,
  });

  gaps.push({
    id: `det-phantom-a11y-${idx++}`,
    topic: 'Accessibility',
    description: 'WCAG 2.1 AA compliance with keyboard navigation and screen reader support.',
    category: 'missing',
    confidence: 0.90,
    deterministic: true,
    divergenceScore: 0.0,
  });

  const nfrsWithoutTargets = prd.nfrs.filter((n) => !n.target);
  if (nfrsWithoutTargets.length > 0) {
    gaps.push({
      id: `det-phantom-nfr-${idx++}`,
      topic: 'Performance',
      description: 'Sub-2-second page loads, responsive interactions.',
      category: 'incomplete',
      confidence: 0.90,
      deterministic: true,
      divergenceScore: 0.0,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Intent-level template options
// ---------------------------------------------------------------------------

const INTENT_TEMPLATE_OPTIONS: Record<string, readonly StructuredOption[]> = {
  userCount: [
    { label: 'Just me', description: 'A personal tool — no login needed, your data stays on your device or a single account.', rationale: 'Simplest setup, fastest to build.', tradeoffs: ['+ No login hassle', '+ Simpler to use', '- Only one person can use it'], recommended: true, source: 'template' },
    { label: 'Multiple users', description: 'Each person gets their own account with separate data.', rationale: 'Good for apps used by different people.', tradeoffs: ['+ Everyone has their own space', '- Requires sign-up and login'], recommended: false, source: 'template' },
    { label: 'Shared team or household', description: 'A shared space where a group of people collaborate on the same data.', rationale: 'Great for families or teams who need shared visibility.', tradeoffs: ['+ Shared visibility', '+ Collaborative', '- More complex permissions'], recommended: false, source: 'template' },
  ],
  platform: [
    { label: 'Web app', description: 'Runs in the browser on any device — no installation needed.', rationale: 'Widest reach, easiest to share and update.', tradeoffs: ['+ Works everywhere', '+ No app store', '- No offline access by default'], recommended: true, source: 'template' },
    { label: 'Mobile app', description: 'A native app for iOS and/or Android — installed from the app store.', rationale: 'Best for on-the-go use with offline support.', tradeoffs: ['+ Works offline', '+ Push notifications', '- App store review process'], recommended: false, source: 'template' },
    { label: 'Both web and mobile', description: 'Available in the browser and as a mobile app, data synced across devices.', rationale: 'Maximum flexibility for the user.', tradeoffs: ['+ Use it anywhere', '- More development time', '- Need data syncing'], recommended: false, source: 'template' },
  ],
};

function buildDataEntryOptions(entity: PRD['dataEntities'][number]): StructuredOption[] {
  const required = entity.fields.filter((f) => f.required !== false);
  const optional = entity.fields.filter((f) => f.required === false);
  const entityName = entity.name.toLowerCase();

  const quickFields = required.length > 0
    ? required.slice(0, 2).map((f) => f.name).join(' and ')
    : entity.fields.slice(0, 2).map((f) => f.name).join(' and ');

  const allFields = entity.fields.map((f) => f.name).join(', ');

  return [
    {
      label: 'Quick entry',
      description: `Just the essentials — ${quickFields}. Fast to enter, minimal effort.`,
      rationale: 'Best when speed matters more than detail.',
      tradeoffs: ['+ Fast to enter', '+ Low friction', `- Less detail per ${entityName}`],
      recommended: true,
      source: 'template' as const,
    },
    {
      label: 'Detailed entry',
      description: `Full details — ${allFields}. More info captured per ${entityName}.`,
      rationale: 'Best when you want comprehensive records.',
      tradeoffs: [`+ Rich ${entityName} data`, '+ Better for reports', '- More effort per entry'],
      recommended: false,
      source: 'template' as const,
    },
    ...(optional.length > 0
      ? [{
          label: 'Flexible',
          description: `Start with the basics, optionally add more details like ${optional.slice(0, 2).map((f) => f.name).join(', ')}.`,
          rationale: 'Best of both — quick when you want, detailed when you need.',
          tradeoffs: ['+ Adapts to the moment', '+ No forced fields', '- Slightly more complex form'],
          recommended: false,
          source: 'template' as const,
        }]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Ensure all gaps have options (post-processing)
// ---------------------------------------------------------------------------

function ensureGapHasOptions(gap: Gap): Gap {
  if (gap.divergentInterpretations && gap.divergentInterpretations.length >= 2) {
    return gap;
  }

  // Phantom gaps (auto-assumptions) don't need options — they won't be asked
  if (gap.divergenceScore !== undefined && gap.divergenceScore < 0.3) {
    return gap;
  }

  debugLog(`gap-detector: gap ${gap.id} has no options — adding yes/no fallback`);
  const topicLower = gap.topic?.toLowerCase() ?? 'this feature';
  return {
    ...gap,
    divergentInterpretations: [
      {
        label: 'Yes, include this',
        description: `Include ${topicLower} in the project.`,
        rationale: 'Adds capability at the cost of more development time.',
        tradeoffs: ['+ More complete product', '- More development time'],
        recommended: true,
        source: 'template' as const,
      },
      {
        label: 'No, skip for now',
        description: `Leave ${topicLower} out — can always add it later.`,
        rationale: 'Ship faster, add later if needed.',
        tradeoffs: ['+ Ship faster', '- Missing capability'],
        recommended: false,
        source: 'template' as const,
      },
    ],
    divergenceScore: gap.divergenceScore ?? 0.33,
  };
}

// ---------------------------------------------------------------------------
// Pass 2: ClarifyGPT (LLM-based divergence analysis)
// ---------------------------------------------------------------------------

interface ImplResponse {
  readonly implementations: readonly {
    readonly approach: string;
    readonly keyDecisions: readonly string[];
  }[];
}

interface DivergeOptionResponse {
  readonly label: string;
  readonly description: string;
  readonly rationale: string;
  readonly tradeoffs?: readonly string[];
  readonly recommended: boolean;
  readonly source: 'llm' | 'codebase' | 'template' | 'catalog';
  readonly citation?: string;
}

interface DivergeResponse {
  readonly gaps: readonly {
    readonly topic: string;
    readonly description: string;
    readonly category: 'missing' | 'ambiguous' | 'conflicting' | 'incomplete';
    readonly options: readonly DivergeOptionResponse[];
  }[];
}

function extractStructured<T>(result: { structured?: Record<string, unknown>; content: string }): T | null {
  if (result.structured) return result.structured as T;
  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function computeDivergenceScore(options: readonly DivergeOptionResponse[]): number {
  if (options.length <= 1) return 0;
  return Math.min((options.length - 1) / 3, 1);
}

function buildContextSection(context: ClarifierContext, mode: ClarifierMode): string | null {
  const parts: string[] = [];

  if (mode === 'evolution') {
    if (context.codeChunks?.length) {
      parts.push(`### Code patterns\n${context.codeChunks.slice(0, 5).join('\n---\n')}`);
    }
    if (context.docChunks?.length) {
      parts.push(`### Documentation\n${context.docChunks.slice(0, 3).join('\n---\n')}`);
    }
    if (context.designChunks?.length) {
      parts.push(`### Design patterns\n${context.designChunks.slice(0, 3).join('\n---\n')}`);
    }
  }

  if (context.catalog) {
    parts.push(`### Component catalog\n${context.catalog.slice(0, 2000)}`);
  }
  if (context.patternLibrary) {
    parts.push(`### Design tokens\n${context.patternLibrary.slice(0, 1000)}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function gapContentId(topic: string, description: string): string {
  const hash = createHash('sha256')
    .update(`${topic}::${description}`)
    .digest('hex')
    .slice(0, 8);
  return `llm-${hash}`;
}

async function runClarifyGPT(
  deps: ClarifierDeps,
  prd: PRD,
  rawInput: string,
  context: ClarifierContext,
  mode: ClarifierMode,
  previousQA?: readonly { question: string; answer: string }[],
): Promise<Gap[]> {
  const implSystem = loadImplPrompt();
  const prdSummary = `Title: ${prd.title}\nDescription: ${prd.description}\n\nFeatures:\n${prd.features.map((f) => `- ${f.name}: ${f.description}`).join('\n')}\n\nScreens:\n${prd.screens.map((s) => `- ${s.name}: ${s.description}`).join('\n')}\n\nData Entities:\n${prd.dataEntities.map((e) => `- ${e.name}: fields=[${e.fields.map((f) => f.name).join(', ')}]`).join('\n')}`;

  const implResult = await deps.provider.complete(
    {
      system: implSystem,
      messages: [{ role: 'user', content: `## PRD\n\n${prdSummary}\n\nGenerate exactly 3 distinct implementation approaches.` }],
    },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.7,
      responseSchema: IMPL_RESPONSE_SCHEMA,
      promptVersion: implVersionCache,
    },
  );

  if (!implResult.ok) {
    debugLog(`gap-detector: implementation generation failed: ${implResult.error.code}`);
    return [];
  }

  const implData = extractStructured<ImplResponse>(implResult.value);
  if (!implData?.implementations?.length) {
    debugLog('gap-detector: could not parse implementation response');
    return [];
  }

  const divergeSystem = loadDivergePrompt(mode);
  const implSummary = implData.implementations
    .map((impl, i) => `### Approach ${i + 1}\n${impl.approach}\nKey decisions: ${impl.keyDecisions.join('; ')}`)
    .join('\n\n');

  const contextSection = buildContextSection(context, mode);
  const contextLabel = mode === 'evolution' ? 'Existing Codebase Patterns' : 'Available Resources';

  let qaSection = '';
  if (previousQA && previousQA.length > 0) {
    const qaPairs = previousQA
      .map((pair) => `**Q:** ${pair.question}\n**A:** ${pair.answer}`)
      .join('\n\n');
    qaSection = `\n## Already Clarified (DO NOT ask about these topics again)\n\n${qaPairs}\n\nOnly identify NEW gaps not covered above.`;
  }

  const userMessage = [
    `## Raw Input\n\n${rawInput}`,
    `\n## PRD (generated from the raw input above)\n\n${prdSummary}`,
    `\n## Implementation Approaches\n\n${implSummary}`,
    contextSection ? `\n## ${contextLabel}\n\n${contextSection}` : '',
    qaSection,
    `\nIdentify where these approaches diverge in ways that affect the user experience. For each gap, provide 2-4 structured options with descriptions, tradeoffs, and a recommendation.`,
  ].filter(Boolean).join('\n');

  const divergeResult = await deps.provider.complete(
    {
      system: divergeSystem,
      messages: [{ role: 'user', content: userMessage }],
    },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0,
      responseSchema: DIVERGE_RESPONSE_SCHEMA,
      promptVersion: divergeVersionCache[mode],
    },
  );

  if (!divergeResult.ok) {
    debugLog(`gap-detector: divergence analysis failed: ${divergeResult.error.code}`);
    return [];
  }

  const divergeData = extractStructured<DivergeResponse>(divergeResult.value);
  if (!divergeData?.gaps?.length) {
    debugLog('gap-detector: no divergence gaps found');
    return [];
  }

  return divergeData.gaps.map((g) => ({
    id: gapContentId(g.topic ?? '', g.description),
    topic: g.topic,
    description: g.description,
    category: g.category,
    confidence: 0.6,
    deterministic: false,
    divergentInterpretations: g.options.map((opt) => ({
      label: opt.label,
      description: opt.description,
      rationale: opt.rationale,
      tradeoffs: opt.tradeoffs ? [...opt.tradeoffs] : undefined,
      recommended: opt.recommended,
      source: opt.source,
      citation: opt.citation,
    })),
    divergenceScore: computeDivergenceScore(g.options),
  }));
}

// ---------------------------------------------------------------------------
// Round>1 filtering
// ---------------------------------------------------------------------------

function filterAddressedGaps(
  gaps: readonly Gap[],
  questions: readonly ClarifierState['questions'][number][],
  humanResponses: readonly ClarifierState['humanResponses'][number][],
): Gap[] {
  const answeredQuestionIds = new Set(humanResponses.map((r) => r.questionId));
  const answeredGapIds = new Set(
    questions.filter((q) => answeredQuestionIds.has(q.id)).map((q) => q.gapId),
  );
  return gaps.filter((g) => !answeredGapIds.has(g.id));
}

function filterAskedGaps(
  gaps: readonly Gap[],
  questions: readonly ClarifierState['questions'][number][],
): Gap[] {
  const askedGapIds = new Set(questions.map((q) => q.gapId));
  return gaps.filter((g) => !askedGapIds.has(g.id));
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a Gap Detector node function for the Clarifier StateGraph.
 * Two-pass analysis: intent-level deterministic checks + ClarifyGPT divergence.
 */
export function createGapDetector(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    if (!state.prdDraft) {
      return { error: 'Gap Detector: no PRD draft available', round: state.round + 1 };
    }

    let deterministicGaps = runDeterministicChecklist(state.prdDraft, state.rawInput, state.mode, state.round);
    let llmGaps: Gap[] = [];

    if (state.round > 0) {
      deterministicGaps = filterAskedGaps(deterministicGaps, state.questions);
    }

    // Build Q&A pairs from previous rounds to prevent re-asking
    const previousQA: { question: string; answer: string }[] = state.humanResponses.map((r) => {
      const q = state.questions.find((qq) => qq.id === r.questionId);
      return { question: q?.text ?? '', answer: r.answer };
    }).filter((pair) => pair.question.length > 0);

    try {
      llmGaps = await runClarifyGPT(deps, state.prdDraft, state.rawInput, state.context, state.mode, previousQA);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog(`gap-detector: ClarifyGPT failed: ${msg}`);
    }

    if (state.round > 0 && llmGaps.length > 0) {
      llmGaps = filterAskedGaps(llmGaps, state.questions);
    }

    const existingDescriptions = new Set(deterministicGaps.map((g) => g.description.toLowerCase()));
    const dedupedLlmGaps = llmGaps.filter(
      (g) => !existingDescriptions.has(g.description.toLowerCase()),
    );

    // Ensure all non-phantom gaps have options
    const enrichedDetGaps = deterministicGaps.map((g) => ensureGapHasOptions(g));
    const enrichedLlmGaps = dedupedLlmGaps.map((g) => ensureGapHasOptions(g));
    const allGaps = [...enrichedDetGaps, ...enrichedLlmGaps];

    return { gaps: allGaps, round: state.round + 1 };
  };
}

export {
  runDeterministicChecklist,
  filterAddressedGaps,
  filterAskedGaps,
  gapContentId,
  runClarifyGPT,
  extractStructured,
  computeDivergenceScore,
  ensureGapHasOptions,
  buildContextSection,
  groupFeaturesByIntent,
  categorizeFeature,
  buildDataEntryOptions,
  IMPL_RESPONSE_SCHEMA,
  DIVERGE_RESPONSE_SCHEMA,
  INTENT_TEMPLATE_OPTIONS,
};
