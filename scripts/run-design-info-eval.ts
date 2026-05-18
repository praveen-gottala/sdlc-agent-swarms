/**
 * M3.6 Design Info Value Eval — Eval Runner
 *
 * Drives the 5 × 2 × 3 × 3 = 90 cell matrix measuring how design-stage
 * context affects implementer code-generation quality.
 *
 * Usage:
 *   npx tsx scripts/run-design-info-eval.ts --config all --task all --reps 3
 *   npx tsx scripts/run-design-info-eval.ts --config C --task cashpulse-dashboard-summary-card --reps 1
 *
 * Prerequisites:
 *   - nx run-many -t build
 *   - ANTHROPIC_API_KEY or Vertex AI ADC configured
 *   - packages/eval/src/scenarios/design-info-value.yaml must exist with all 6 tasks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { extractLabelsAndBindings, extractStructure } from '@agentforge/agents-architect';
import { deltaApply } from '@agentforge/designspec-renderer';
import type { DesignSpecV2, DesignSpecDelta } from '@agentforge/designspec-renderer';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_PATH = join(ROOT, 'packages', 'eval', 'src', 'scenarios', 'design-info-value.yaml');
const PROMPT_PATH = join(ROOT, 'packages', 'eval', 'src', 'scoring', 'implementer-test-prompt.md');
const RESULTS_DIR = join(ROOT, 'packages', 'eval', 'results', 'm3-6');
const RAW_RESULTS_PATH = join(RESULTS_DIR, 'raw-results.json');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_MODEL_DIRECT = 'claude-sonnet-4-20250514';
const EXPECTED_MODEL_VERTEX = 'claude-sonnet-4-6';
let EXPECTED_MODEL = EXPECTED_MODEL_DIRECT;
const TEMPERATURE = 0.3;
const MAX_TOKENS = 8192;
const MAX_RETRIES = 3;
const CONFIG_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceRef {
  source: string;
  screenId: string;
}

interface RawTaskFixture {
  id: string;
  taskDescription: string;
  taskType: 'NEW' | 'MODIFY';
  contractBundleSlice: Record<string, unknown>;
  screenPlan?: SourceRef;
  componentComposition?: SourceRef;
  designSpecPath?: string;
  existingDesignSpecPath?: string;
  deltaPath?: string;
  groundTruthExpected: string;
}

interface EvalTaskFixture {
  id: string;
  taskDescription: string;
  taskType: 'NEW' | 'MODIFY';
  contractBundleSlice: Record<string, unknown>;
  screenPlan?: Record<string, unknown>;
  componentComposition?: Record<string, unknown>;
  designSpec?: DesignSpecV2;
  existingDesignSpec?: DesignSpecV2;
  delta?: Record<string, unknown>;
  groundTruthExpected: string;
}

interface EvalCellResult {
  taskId: string;
  taskType: string;
  config: ConfigKey;
  rep: number;
  seed: number;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  output: string;
  modelId: string;
  timestamp: string;
  status: 'success' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

function hashPrompt(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function loadPromptTemplate(): string {
  const raw = readFileSync(PROMPT_PATH, 'utf-8');
  const endOfFrontmatter = raw.indexOf('---', raw.indexOf('---') + 3);
  return endOfFrontmatter >= 0 ? raw.slice(endOfFrontmatter + 3).trim() : raw.trim();
}

function resolveDesignSpec(relPath: string | undefined): DesignSpecV2 | undefined {
  if (!relPath) return undefined;
  const absPath = join(ROOT, relPath);
  if (!existsSync(absPath)) {
    log(`WARNING: Design spec not found at ${absPath}`);
    return undefined;
  }
  return JSON.parse(readFileSync(absPath, 'utf-8')) as DesignSpecV2;
}

function resolveSourceRef(ref: SourceRef | undefined, lookupField: string): Record<string, unknown> | undefined {
  if (!ref?.source || !ref?.screenId) return undefined;
  const absPath = join(ROOT, ref.source);
  if (!existsSync(absPath)) {
    log(`WARNING: Source file not found at ${absPath}`);
    return undefined;
  }
  const arr = JSON.parse(readFileSync(absPath, 'utf-8')) as Record<string, unknown>[];
  const entry = arr.find((item) => item[lookupField] === ref.screenId);
  if (!entry) {
    log(`WARNING: No entry with ${lookupField}=${ref.screenId} in ${ref.source}`);
    return undefined;
  }
  return entry;
}

function resolveDelta(relPath: string | undefined): Record<string, unknown> | undefined {
  if (!relPath) return undefined;
  const absPath = join(ROOT, relPath);
  if (!existsSync(absPath)) {
    log(`WARNING: Delta file not found at ${absPath}`);
    return undefined;
  }
  return JSON.parse(readFileSync(absPath, 'utf-8')) as Record<string, unknown>;
}

function loadFixtures(): EvalTaskFixture[] {
  if (!existsSync(FIXTURES_PATH)) {
    log(`STOP: Fixtures not found at ${FIXTURES_PATH}`);
    log('Fixtures not found. Complete Phase 2 and write groundTruthExpected for all 6 tasks before running.');
    process.exit(1);
  }
  const raw = readFileSync(FIXTURES_PATH, 'utf-8');
  const doc = parseYaml(raw) as { tasks: RawTaskFixture[] };
  return doc.tasks.map((t) => {
    const existingSpec = resolveDesignSpec(t.existingDesignSpecPath);
    const delta = resolveDelta(t.deltaPath);

    let designSpec = resolveDesignSpec(t.designSpecPath);
    if (t.taskType === 'MODIFY' && existingSpec && delta) {
      const result = deltaApply(existingSpec, delta as unknown as DesignSpecDelta);
      if (result.ok) {
        designSpec = result.value;
        const d = delta as Record<string, unknown>;
        const added = d['added'] as Record<string, unknown> | undefined;
        const modified = d['modified'] as Record<string, unknown> | undefined;
        const removed = d['removed'] as unknown[] | undefined;
        const reordered = d['reordered'] as unknown[] | undefined;
        log(`  Delta applied for ${t.id}: +${Object.keys(added ?? {}).length} ~${Object.keys(modified ?? {}).length} -${(removed ?? []).length} ↕${(reordered ?? []).length}`);
      } else {
        log(`  WARNING: Delta apply failed for ${t.id}: ${result.error.message}`);
      }
    }

    return {
      id: t.id,
      taskDescription: t.taskDescription,
      taskType: t.taskType,
      contractBundleSlice: t.contractBundleSlice,
      screenPlan: resolveSourceRef(t.screenPlan, 'id'),
      componentComposition: resolveSourceRef(t.componentComposition, 'screenId'),
      designSpec,
      existingDesignSpec: existingSpec,
      delta,
      groundTruthExpected: t.groundTruthExpected,
    };
  });
}

function loadExistingResults(): EvalCellResult[] {
  if (!existsSync(RAW_RESULTS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(RAW_RESULTS_PATH, 'utf-8')) as EvalCellResult[];
  } catch {
    return [];
  }
}

function saveResults(results: EvalCellResult[]): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(RAW_RESULTS_PATH, JSON.stringify(results, null, 2));
}

function cellKey(taskId: string, config: ConfigKey, rep: number): string {
  return `${taskId}:${config}:${rep}`;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

function assembleContext(task: EvalTaskFixture, config: ConfigKey): string {
  const sections: string[] = [];

  sections.push(`## Task\n\n${task.taskDescription}`);
  sections.push(`## Task Type\n\n${task.taskType}`);

  if (Object.keys(task.contractBundleSlice).length > 0) {
    sections.push(`## Contract Bundle (data model + patterns)\n\n\`\`\`json\n${JSON.stringify(task.contractBundleSlice, null, 2)}\n\`\`\``);
  }

  if (config === 'A') {
    return sections.join('\n\n');
  }

  // B+: add screen plan and component composition
  if (task.screenPlan && Object.keys(task.screenPlan).length > 0) {
    sections.push(`## Screen Plan\n\n\`\`\`json\n${JSON.stringify(task.screenPlan, null, 2)}\n\`\`\``);
  }
  if (task.componentComposition && Object.keys(task.componentComposition).length > 0) {
    sections.push(`## Component Composition\n\n\`\`\`json\n${JSON.stringify(task.componentComposition, null, 2)}\n\`\`\``);
  }

  if (config === 'B') {
    return sections.join('\n\n');
  }

  // C/D/E: add design spec (sliced per strategy)
  const spec = task.designSpec;
  if (spec) {
    let sliced: DesignSpecV2;
    switch (config) {
      case 'C':
        sliced = spec;
        break;
      case 'D':
        sliced = extractLabelsAndBindings(spec);
        break;
      case 'E':
        sliced = extractStructure(spec);
        break;
      default:
        sliced = spec;
    }
    sections.push(`## Design Specification\n\n\`\`\`json\n${JSON.stringify(sliced, null, 2)}\n\`\`\``);
  }

  // MODIFY tasks: include existing design spec (sliced at same strategy)
  if (task.taskType === 'MODIFY' && task.existingDesignSpec) {
    let existingSliced: DesignSpecV2;
    switch (config) {
      case 'C':
        existingSliced = task.existingDesignSpec;
        break;
      case 'D':
        existingSliced = extractLabelsAndBindings(task.existingDesignSpec);
        break;
      case 'E':
        existingSliced = extractStructure(task.existingDesignSpec);
        break;
      default:
        existingSliced = task.existingDesignSpec;
    }
    sections.push(`## Existing Design (pre-change)\n\n\`\`\`json\n${JSON.stringify(existingSliced, null, 2)}\n\`\`\``);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Client creation (Vertex AI or direct Anthropic)
// ---------------------------------------------------------------------------

interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<Anthropic.Message>;
  };
}

function createClient(): AnthropicClient {
  const vertexProject = process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
  const vertexRegion = process.env['CLOUD_ML_REGION'];

  if (vertexProject) {
    const region = vertexRegion || 'us-east5';
    EXPECTED_MODEL = EXPECTED_MODEL_VERTEX;
    log(`Using Vertex AI (project=${vertexProject}, region=${region}, model=${EXPECTED_MODEL})`);
    return new AnthropicVertex({
      projectId: vertexProject,
      region,
    }) as unknown as AnthropicClient;
  }

  log('Using direct Anthropic API');
  return new Anthropic() as unknown as AnthropicClient;
}

// ---------------------------------------------------------------------------
// LLM call with retry
// ---------------------------------------------------------------------------

async function callLLM(
  client: AnthropicClient,
  systemPrompt: string,
  userContent: string,
): Promise<{ output: string; inputTokens: number; outputTokens: number; modelId: string }> {
  const response = await client.messages.create({
    model: EXPECTED_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const output = (response as Anthropic.Message).content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    output,
    inputTokens: (response as Anthropic.Message).usage.input_tokens,
    outputTokens: (response as Anthropic.Message).usage.output_tokens,
    modelId: (response as Anthropic.Message).model,
  };
}

async function runCellWithRetry(
  client: AnthropicClient,
  systemPrompt: string,
  userContent: string,
  seed: number,
): Promise<{ output: string; inputTokens: number; outputTokens: number; modelId: string; status: 'success' | 'failed'; error?: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callLLM(client, systemPrompt, userContent);
      return { ...result, status: 'success' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);

      if (attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        log(`  Retrying in ${(delayMs / 1000).toFixed(1)}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        return { output: '', inputTokens: 0, outputTokens: 0, modelId: EXPECTED_MODEL, status: 'failed', error: msg };
      }
    }
  }
  return { output: '', inputTokens: 0, outputTokens: 0, modelId: EXPECTED_MODEL, status: 'failed', error: 'max retries exceeded' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configArg = args[args.indexOf('--config') + 1] ?? 'all';
  const taskArg = args[args.indexOf('--task') + 1] ?? 'all';
  const reps = parseInt(args[args.indexOf('--reps') + 1] ?? '3', 10);
  const force = args.includes('--force');

  const configs: ConfigKey[] = configArg === 'all'
    ? [...CONFIG_KEYS]
    : configArg.split(',').map((c) => c.trim().toUpperCase() as ConfigKey);

  if (!configs.every((c) => CONFIG_KEYS.includes(c))) {
    log(`Invalid config: ${configArg}. Must be one of ${CONFIG_KEYS.join(', ')} or 'all'.`);
    process.exit(1);
  }

  log('Loading fixtures...');
  const allTasks = loadFixtures();
  const tasks = taskArg === 'all'
    ? allTasks
    : allTasks.filter((t) => t.id === taskArg);

  if (tasks.length === 0) {
    log(`No tasks matched filter '${taskArg}'. Available: ${allTasks.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }

  const totalCells = configs.length * tasks.length * reps;
  log(`Matrix: ${configs.length} configs × ${tasks.length} tasks × ${reps} reps = ${totalCells} cells`);

  const systemPrompt = loadPromptTemplate();
  const client = createClient();

  // Verify model pin
  log(`Model pin: ${EXPECTED_MODEL}`);

  const results = loadExistingResults();
  const completedKeys = new Set(results.map((r) => cellKey(r.taskId, r.config as ConfigKey, r.rep)));

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const config of configs) {
    for (const task of tasks) {
      for (let rep = 0; rep < reps; rep++) {
        const key = cellKey(task.id, config, rep);
        if (!force && completedKeys.has(key)) {
          skipped++;
          continue;
        }

        completed++;
        const seed = completed * 1000 + rep;
        const userContent = assembleContext(task, config);
        const promptH = hashPrompt(systemPrompt + userContent);

        log(`[${completed}/${totalCells - skipped}] ${task.id} | config=${config} | rep=${rep} | seed=${seed}`);

        const startMs = Date.now();
        const llmResult = await runCellWithRetry(client, systemPrompt, userContent, seed);
        const latencyMs = Date.now() - startMs;

        if (llmResult.status === 'failed') {
          failed++;
        }

        if (llmResult.modelId !== EXPECTED_MODEL) {
          log(`  WARNING: Model returned '${llmResult.modelId}', expected '${EXPECTED_MODEL}'`);
        }

        const cellResult: EvalCellResult = {
          taskId: task.id,
          taskType: task.taskType,
          config,
          rep,
          seed,
          promptHash: promptH,
          inputTokens: llmResult.inputTokens,
          outputTokens: llmResult.outputTokens,
          latencyMs,
          output: llmResult.output,
          modelId: llmResult.modelId,
          timestamp: new Date().toISOString(),
          status: llmResult.status,
          ...(llmResult.error ? { error: llmResult.error } : {}),
        };

        results.push(cellResult);
        saveResults(results);

        log(`  → ${llmResult.status} | ${llmResult.inputTokens} in / ${llmResult.outputTokens} out | ${latencyMs}ms`);
      }
    }
  }

  log('---');
  log(`Done. ${completed} cells run, ${skipped} skipped (checkpoint), ${failed} failed.`);
  log(`Results: ${RAW_RESULTS_PATH}`);

  if (failed > totalCells * 0.2) {
    log(`WARNING: Failure rate ${((failed / totalCells) * 100).toFixed(0)}% exceeds 20% threshold. Do not write findings on incomplete data.`);
    process.exit(1);
  }
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
