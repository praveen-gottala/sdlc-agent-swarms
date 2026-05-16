/**
 * Generate post-change DesignSpec v2 files for the 3 M3.6 MODIFY tasks.
 *
 * Runs the design pipeline for each brownfield screen, passing the Architect's
 * ComponentComposition + ScreenPlan as extra context via prdRequirements.
 * Outputs go to fixtures/personal-expense-tracker/agentforge/designs-brownfield-after/.
 *
 * Usage: npx tsx scripts/run-brownfield-design.ts
 *
 * Prerequisites:
 *   - nx run-many -t build
 *   - ANTHROPIC_API_KEY or Vertex AI ADC configured
 *   - Brownfield Architect outputs at fixtures/.../architect-brownfield-output/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRealFs,
  createEventBus,
  readYaml,
  EnrichedRequirementSchema,
} from '@agentforge/core';
import type { AgentContext, DesignTokensSpec, EnrichedRequirement, PageContext } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import {
  runDesignPipeline,
  buildComponentCatalogPrompt,
} from '@agentforge/agents-ux';
import type { PipelineInput } from '@agentforge/agents-ux';
import type { RawCatalogSpec, RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = join(ROOT, 'fixtures', 'personal-expense-tracker');
const ARCHITECT_DIR = join(PROJECT_ROOT, 'agentforge', 'architect-brownfield-output');
const OUTPUT_DIR = join(PROJECT_ROOT, 'agentforge', 'designs-brownfield-after');

interface ScreenTask {
  readonly id: string;
  readonly label: string;
  readonly architectScreenId: string;
  readonly outputFilename: string;
  readonly screenType: 'page' | 'modal' | 'drawer' | 'sheet';
  readonly existingDesignPath: string;
}

const TASKS: readonly ScreenTask[] = [
  {
    id: 'dashboard-recurring-card',
    label: 'Dashboard — Upcoming Recurring Card',
    architectScreenId: 'screen-001',
    outputFilename: 'dashboard-recurring-card.json',
    screenType: 'page',
    existingDesignPath: join(PROJECT_ROOT, 'agentforge', 'designs', 'dashboard.json'),
  },
  {
    id: 'add-expense-recurrence',
    label: 'Add Expense — Recurrence Configuration',
    architectScreenId: 'screen-002',
    outputFilename: 'add-expense-recurrence.json',
    screenType: 'page',
    existingDesignPath: join(PROJECT_ROOT, 'agentforge', 'designs', 'add-expense.json'),
  },
  {
    id: 'dashboard-recurring-badge',
    label: 'Dashboard — Recurring Badge on Expense Rows',
    architectScreenId: 'screen-006',
    outputFilename: 'dashboard-recurring-badge.json',
    screenType: 'page',
    existingDesignPath: join(PROJECT_ROOT, 'agentforge', 'designs', 'dashboard.json'),
  },
];

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

function formatComponentTree(cc: Record<string, unknown>): string {
  const tree = (cc.componentTree ?? []) as readonly Record<string, unknown>[];
  const lines: string[] = ['## Architect Component Composition\n'];
  for (const node of tree) {
    const children = (node.children as string[] | undefined) ?? [];
    const props = node.props ? JSON.stringify(node.props) : '';
    lines.push(`- **${node.id}** (${node.type})${children.length > 0 ? ` → [${children.join(', ')}]` : ''}`);
    if (props) lines.push(`  Props: ${props}`);
  }
  return lines.join('\n');
}

function formatScreenPlan(sp: Record<string, unknown>): string {
  const lines: string[] = ['## Architect Screen Plan\n'];
  lines.push(`- Screen: ${sp.id} (${sp.screenType})`);
  lines.push(`- Route: ${sp.route}`);
  lines.push(`- Components: ${(sp.components as string[]).join(', ')}`);

  const bindings = (sp.dataBindings ?? []) as readonly Record<string, unknown>[];
  if (bindings.length > 0) {
    lines.push('\n### Data Bindings\n');
    for (const b of bindings) {
      lines.push(`- ${b.entityId}.${b.field} ← ${b.source}${b.transform ? ` (${b.transform})` : ''}`);
    }
  }

  const navTargets = (sp.navigationTargets ?? []) as readonly Record<string, unknown>[];
  if (navTargets.length > 0) {
    lines.push('\n### Navigation Targets\n');
    for (const n of navTargets) {
      lines.push(`- → ${n.target} via ${n.trigger}`);
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  log('M3.6 Brownfield Design Generation');
  log('==================================');

  // 1. Load shared inputs
  const auth = resolveClaudeAuth();
  if (!auth) {
    log('ERROR: No Claude API authentication configured.');
    process.exitCode = 1;
    return;
  }
  const config = authResultToProviderConfig(auth);
  log(`Provider: claude-sonnet-4-6 via ${auth.type}`);

  const providerFactory = (model: string) => createClaudeProvider(model, config);

  // Load enriched requirement
  const enrichedRaw = JSON.parse(readFileSync(
    join(PROJECT_ROOT, 'agentforge', 'clarifier-brownfield-output', 'enriched-requirement.json'), 'utf-8',
  ));
  const enrichedRequirement = EnrichedRequirementSchema.parse(enrichedRaw) as EnrichedRequirement;
  log(`EnrichedRequirement loaded (${enrichedRequirement.prd.screens.length} screens)`);

  // Load Architect outputs
  const screenPlans = JSON.parse(readFileSync(join(ARCHITECT_DIR, 'screen-plans.json'), 'utf-8')) as Record<string, unknown>[];
  const componentComps = JSON.parse(readFileSync(join(ARCHITECT_DIR, 'component-compositions.json'), 'utf-8')) as Record<string, unknown>[];
  log(`Architect outputs: ${screenPlans.length} screen plans, ${componentComps.length} compositions`);

  // Load design tokens
  const fs = createRealFs();
  const tokensResult = readYaml<DesignTokensSpec>(join(PROJECT_ROOT, 'agentforge/spec/design-tokens.yaml'), fs);
  const designTokens = tokensResult.ok ? tokensResult.value : undefined;

  // Load component catalog
  const catalogResult = readYaml<RawCatalogSpec>(join(PROJECT_ROOT, 'agentforge/spec/component-catalog.yaml'), fs);
  const componentCatalog = catalogResult.ok ? catalogResult.value : undefined;

  let rendererTokens: Record<string, unknown> | undefined;
  let catalogMap: CatalogMap | undefined;
  if (designTokens) {
    const rt: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(designTokens)) {
      if (key !== 'version' && key !== 'created_by') rt[key] = value;
    }
    rendererTokens = rt;
    catalogMap = loadCatalogForRenderer(componentCatalog, rt as RendererTokens);
  }

  const componentCatalogPrompt = buildComponentCatalogPrompt(componentCatalog);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 2. Run design pipeline for each brownfield screen
  const agentContext: AgentContext = {
    taskId: 'brownfield-design',
    projectRoot: PROJECT_ROOT,
    eventBus: createEventBus(),
    fs,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: (model: string) => Ok(providerFactory(model)),
    recordAudit: () => {},
  };

  for (const task of TASKS) {
    log(`\n--- ${task.label} ---`);

    const sp = screenPlans.find((s) => s.id === task.architectScreenId);
    const cc = componentComps.find((c) => c.screenId === task.architectScreenId);
    if (!sp || !cc) {
      log(`ERROR: No Architect output for ${task.architectScreenId}`);
      continue;
    }

    // Load existing design spec as context
    let existingDesignContext = '';
    if (existsSync(task.existingDesignPath)) {
      const existing = JSON.parse(readFileSync(task.existingDesignPath, 'utf-8'));
      const nodeCount = Object.keys(existing.nodes ?? existing).length;
      existingDesignContext = `\n## Existing Design (${nodeCount} nodes)\nThe existing screen has ${nodeCount} design nodes. The modification should ADD new components while preserving the existing layout.\n`;
    }

    const architectContext = [
      `# Brownfield Modification: ${task.label}\n`,
      `This is a MODIFY task. Add the following components to the existing screen.\n`,
      existingDesignContext,
      formatScreenPlan(sp),
      '\n',
      formatComponentTree(cc),
    ].join('\n');

    const prdRequirements = [architectContext];

    const input: PipelineInput = {
      moduleId: task.id,
      taskId: `brownfield-${task.id}`,
      projectRoot: PROJECT_ROOT,
      designTool: 'browser',
      providerString: 'claude-sonnet-4-6',
      resume: false,
      agentContext,
      prdRequirements,
      enrichedRequirement,
      designTokensSpec: designTokens,
      rendererTokens,
      catalogMap,
      componentCatalogPrompt,
      viewportWidth: task.screenType === 'drawer' ? 320 : task.screenType === 'modal' ? 560 : 1440,
      description: task.label,
    };

    log(`Running design pipeline (viewport=${input.viewportWidth}px)...`);
    const startMs = Date.now();
    const result = await runDesignPipeline(input);
    const durationMs = Date.now() - startMs;

    if (!result.ok) {
      log(`ERROR: Pipeline failed — ${result.error.stage}: ${result.error.message}`);
      process.exitCode = 1;
      continue;
    }

    const state = result.value;
    const spec = state.design?.spec;

    if (!spec) {
      log(`ERROR: No DesignSpec produced`);
      process.exitCode = 1;
      continue;
    }

    const nodeCount = typeof spec === 'object' && spec !== null
      ? Object.keys((spec as Record<string, unknown>).nodes ?? spec).length
      : 0;

    writeFileSync(join(OUTPUT_DIR, task.outputFilename), JSON.stringify(spec, null, 2));
    log(`SAVED ${task.outputFilename} (${nodeCount} nodes, ${(durationMs / 1000).toFixed(1)}s)`);
  }

  log('\n=== Summary ===');
  log(`Output directory: ${OUTPUT_DIR}`);
  for (const task of TASKS) {
    const path = join(OUTPUT_DIR, task.outputFilename);
    if (existsSync(path)) {
      const spec = JSON.parse(readFileSync(path, 'utf-8'));
      const nodeCount = Object.keys(spec.nodes ?? spec).length;
      log(`  ${task.outputFilename}: ${nodeCount} nodes`);
    } else {
      log(`  ${task.outputFilename}: MISSING`);
    }
  }
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) log(err.stack);
  process.exitCode = 1;
});
