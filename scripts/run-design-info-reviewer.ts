/**
 * M3.6 Design Info Value Eval — Reviewer Scoring
 *
 * Scores raw eval outputs using the design-fidelity-reviewer prompt.
 * For consistency check mode (--consistency), runs each cell twice and reports divergence.
 *
 * Usage:
 *   npx tsx scripts/run-design-info-reviewer.ts                    # score all cells
 *   npx tsx scripts/run-design-info-reviewer.ts --consistency      # pilot consistency check
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = join(ROOT, 'packages', 'eval', 'results', 'm3-6');
const RAW_RESULTS_PATH = join(RESULTS_DIR, 'raw-results.json');
const SCORES_PATH = join(RESULTS_DIR, 'reviewer-scores.json');
const REVIEWER_PROMPT_PATH = join(ROOT, 'packages', 'eval', 'src', 'scoring', 'design-info-reviewer-prompt.md');
const FIXTURES_PATH = join(ROOT, 'packages', 'eval', 'src', 'scenarios', 'design-info-value.yaml');

const REVIEWER_MODEL_VERTEX = 'claude-sonnet-4-6';
const REVIEWER_MODEL_DIRECT = 'claude-sonnet-4-20250514';

interface ReviewerScore {
  fidelity: number;
  fidelity_notes: string;
  props: number;
  props_notes: string;
}

interface ScoredCell {
  taskId: string;
  taskType: string;
  config: string;
  rep: number;
  fidelity: number;
  fidelity_notes: string;
  props: number;
  props_notes: string;
  reviewerModelId: string;
  timestamp: string;
}

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

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

function createClient(): { client: AnthropicClient; model: string } {
  const vertexProject = process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
  const vertexRegion = process.env['CLOUD_ML_REGION'] || 'us-east5';

  if (vertexProject) {
    log(`Using Vertex AI (project=${vertexProject}, region=${vertexRegion})`);
    return {
      client: new AnthropicVertex({ projectId: vertexProject, region: vertexRegion }) as unknown as AnthropicClient,
      model: REVIEWER_MODEL_VERTEX,
    };
  }

  log('Using direct Anthropic API');
  return { client: new Anthropic() as unknown as AnthropicClient, model: REVIEWER_MODEL_DIRECT };
}

function loadReviewerPrompt(): string {
  const raw = readFileSync(REVIEWER_PROMPT_PATH, 'utf-8');
  const endOfFrontmatter = raw.indexOf('---', raw.indexOf('---') + 3);
  return endOfFrontmatter >= 0 ? raw.slice(endOfFrontmatter + 3).trim() : raw.trim();
}

function loadGroundTruths(): Map<string, string> {
  const raw = readFileSync(FIXTURES_PATH, 'utf-8');
  const doc = parseYaml(raw) as { tasks: Array<{ id: string; groundTruthExpected: string }> };
  const map = new Map<string, string>();
  for (const t of doc.tasks) {
    map.set(t.id, t.groundTruthExpected);
  }
  return map;
}

async function scoreCell(
  client: AnthropicClient,
  model: string,
  reviewerPrompt: string,
  code: string,
  groundTruth: string,
): Promise<ReviewerScore> {
  const userContent = `## Component Code\n\n${code}\n\n## Ground Truth Reference\n\n${groundTruth}`;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    temperature: 0,
    system: reviewerPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const text = (response as Anthropic.Message).content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Reviewer did not return JSON: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as ReviewerScore;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const consistencyMode = args.includes('--consistency');
  const force = args.includes('--force');

  if (!existsSync(RAW_RESULTS_PATH)) {
    log('STOP: No raw results found. Run the eval first.');
    process.exit(1);
  }

  const rawResults = JSON.parse(readFileSync(RAW_RESULTS_PATH, 'utf-8')) as Array<{
    taskId: string;
    taskType: string;
    config: string;
    rep: number;
    output: string;
    status: string;
  }>;

  const successCells = rawResults.filter((r) => r.status === 'success');
  log(`${successCells.length} successful cells to score`);

  const { client, model } = createClient();
  const reviewerPrompt = loadReviewerPrompt();
  const groundTruths = loadGroundTruths();

  mkdirSync(RESULTS_DIR, { recursive: true });

  if (consistencyMode) {
    log('Running consistency check (2 calls per cell)...');
    let maxDivergence = 0;

    for (const cell of successCells) {
      const gt = groundTruths.get(cell.taskId) ?? '';
      log(`Scoring ${cell.taskId} | config=${cell.config} | rep=${cell.rep} (call 1/2)`);
      const score1 = await scoreCell(client, model, reviewerPrompt, cell.output, gt);
      log(`  Score 1: fidelity=${score1.fidelity} props=${score1.props}`);

      log(`Scoring ${cell.taskId} | config=${cell.config} | rep=${cell.rep} (call 2/2)`);
      const score2 = await scoreCell(client, model, reviewerPrompt, cell.output, gt);
      log(`  Score 2: fidelity=${score2.fidelity} props=${score2.props}`);

      const fidelityDiff = Math.abs(score1.fidelity - score2.fidelity);
      const propsDiff = Math.abs(score1.props - score2.props);
      maxDivergence = Math.max(maxDivergence, fidelityDiff, propsDiff);

      if (fidelityDiff > 1 || propsDiff > 1) {
        log(`  WARNING: Divergence >1 point — fidelity diff=${fidelityDiff}, props diff=${propsDiff}`);
      } else {
        log(`  OK: divergence within tolerance (fidelity diff=${fidelityDiff}, props diff=${propsDiff})`);
      }
    }

    log(`\nMax divergence across all cells: ${maxDivergence}`);
    if (maxDivergence > 1) {
      log('STOP: Reviewer consistency check FAILED. Reviewer prompt needs sharpening.');
      process.exit(1);
    }
    log('Reviewer consistency check PASSED.');
    return;
  }

  // Full scoring mode
  const existingScores: ScoredCell[] = existsSync(SCORES_PATH)
    ? JSON.parse(readFileSync(SCORES_PATH, 'utf-8'))
    : [];
  const scoredKeys = new Set(existingScores.map((s) => `${s.taskId}:${s.config}:${s.rep}`));

  const forcedKeys = force
    ? new Set(successCells.map((c) => `${c.taskId}:${c.config}:${c.rep}`))
    : new Set<string>();
  const scores: ScoredCell[] = force
    ? existingScores.filter((s) => !forcedKeys.has(`${s.taskId}:${s.config}:${s.rep}`))
    : [...existingScores];
  let scored = 0;
  let skipped = 0;

  for (const cell of successCells) {
    const key = `${cell.taskId}:${cell.config}:${cell.rep}`;
    if (!force && scoredKeys.has(key)) {
      skipped++;
      continue;
    }

    scored++;
    const gt = groundTruths.get(cell.taskId) ?? '';
    log(`[${scored}/${successCells.length - skipped}] Scoring ${cell.taskId} | config=${cell.config} | rep=${cell.rep}`);

    try {
      const score = await scoreCell(client, model, reviewerPrompt, cell.output, gt);
      scores.push({
        taskId: cell.taskId,
        taskType: cell.taskType,
        config: cell.config,
        rep: cell.rep,
        fidelity: score.fidelity,
        fidelity_notes: score.fidelity_notes,
        props: score.props,
        props_notes: score.props_notes,
        reviewerModelId: model,
        timestamp: new Date().toISOString(),
      });
      log(`  → fidelity=${score.fidelity} props=${score.props}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  FAILED: ${msg}`);
      scores.push({
        taskId: cell.taskId,
        taskType: cell.taskType,
        config: cell.config,
        rep: cell.rep,
        fidelity: -1,
        fidelity_notes: `Error: ${msg}`,
        props: -1,
        props_notes: `Error: ${msg}`,
        reviewerModelId: model,
        timestamp: new Date().toISOString(),
      });
    }

    writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2));
  }

  log(`\nDone. ${scored} cells scored, ${skipped} skipped (checkpoint).`);
  log(`Scores: ${SCORES_PATH}`);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
