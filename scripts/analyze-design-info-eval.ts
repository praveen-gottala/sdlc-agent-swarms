/**
 * M3.6 Design Info Value Eval — Analysis & CSV Pivot
 *
 * Reads raw-results.json + reviewer-scores.json, generates:
 *   1. scored-results.csv — one row per cell
 *   2. Console analysis with config comparisons
 *
 * Usage:
 *   npx tsx scripts/analyze-design-info-eval.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = join(ROOT, 'packages', 'eval', 'results', 'm3-6');
const RAW_RESULTS_PATH = join(RESULTS_DIR, 'raw-results.json');
const SCORES_PATH = join(RESULTS_DIR, 'reviewer-scores.json');
const CSV_PATH = join(RESULTS_DIR, 'scored-results.csv');

interface RawCell {
  taskId: string;
  taskType: string;
  config: string;
  rep: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: string;
}

interface ScoreCell {
  taskId: string;
  taskType: string;
  config: string;
  rep: number;
  fidelity: number;
  props: number;
}

interface MergedCell {
  taskId: string;
  taskType: string;
  config: string;
  rep: number;
  fidelity: number;
  props: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

function log(msg: string): void {
  process.stdout.write(msg + '\n');
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

function main(): void {
  if (!existsSync(RAW_RESULTS_PATH)) {
    log('STOP: No raw results. Run the eval first.');
    process.exit(1);
  }
  if (!existsSync(SCORES_PATH)) {
    log('STOP: No reviewer scores. Run the reviewer first.');
    process.exit(1);
  }

  const rawResults = JSON.parse(readFileSync(RAW_RESULTS_PATH, 'utf-8')) as RawCell[];
  const scores = JSON.parse(readFileSync(SCORES_PATH, 'utf-8')) as ScoreCell[];

  const scoreMap = new Map<string, ScoreCell>();
  for (const s of scores) {
    scoreMap.set(`${s.taskId}:${s.config}:${s.rep}`, s);
  }

  const merged: MergedCell[] = [];
  for (const r of rawResults) {
    if (r.status !== 'success') continue;
    const key = `${r.taskId}:${r.config}:${r.rep}`;
    const s = scoreMap.get(key);
    if (!s || s.fidelity < 0) continue;

    merged.push({
      taskId: r.taskId,
      taskType: r.taskType,
      config: r.config,
      rep: r.rep,
      fidelity: s.fidelity,
      props: s.props,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      latencyMs: r.latencyMs,
    });
  }

  log(`Merged ${merged.length} cells (${rawResults.length} raw, ${scores.length} scored)`);

  // Write CSV
  const csvHeader = 'taskId,taskType,config,rep,fidelity_0_3,props_0_3,input_tokens,output_tokens,latency_ms';
  const csvRows = merged.map(
    (m) =>
      `${m.taskId},${m.taskType},${m.config},${m.rep},${m.fidelity},${m.props},${m.inputTokens},${m.outputTokens},${m.latencyMs}`,
  );
  writeFileSync(CSV_PATH, [csvHeader, ...csvRows].join('\n'));
  log(`CSV written: ${CSV_PATH}`);

  // --- Analysis ---

  const configs = ['A', 'B', 'C', 'D', 'E'];

  function filterBy(cells: MergedCell[], criteria: Partial<MergedCell>): MergedCell[] {
    return cells.filter((c) => {
      for (const [k, v] of Object.entries(criteria)) {
        if (c[k as keyof MergedCell] !== v) return false;
      }
      return true;
    });
  }

  function statsFor(cells: MergedCell[]): { meanFidelity: number; stdFidelity: number; meanProps: number; stdProps: number; meanTokens: number; n: number } {
    const f = cells.map((c) => c.fidelity);
    const p = cells.map((c) => c.props);
    const t = cells.map((c) => c.inputTokens);
    return {
      meanFidelity: mean(f),
      stdFidelity: stddev(f),
      meanProps: mean(p),
      stdProps: stddev(p),
      meanTokens: mean(t),
      n: cells.length,
    };
  }

  // Overall config comparison
  log('\n═══ Overall Config Comparison ═══');
  log('Config | n  | Fidelity (mean±sd) | Props (mean±sd) | Input Tokens (mean)');
  log('-------|----|--------------------|-----------------|-----------------------');
  for (const c of configs) {
    const cells = filterBy(merged, { config: c });
    const s = statsFor(cells);
    log(
      `  ${c}    | ${String(s.n).padStart(2)} | ${s.meanFidelity.toFixed(2)} ± ${s.stdFidelity.toFixed(2)}           | ${s.meanProps.toFixed(2)} ± ${s.stdProps.toFixed(2)}          | ${s.meanTokens.toFixed(0)}`,
    );
  }

  // A vs B
  log('\n═══ A vs B (does planning context help?) ═══');
  const aStats = statsFor(filterBy(merged, { config: 'A' }));
  const bStats = statsFor(filterBy(merged, { config: 'B' }));
  log(`  A: fidelity=${aStats.meanFidelity.toFixed(2)}, props=${aStats.meanProps.toFixed(2)}, tokens=${aStats.meanTokens.toFixed(0)}`);
  log(`  B: fidelity=${bStats.meanFidelity.toFixed(2)}, props=${bStats.meanProps.toFixed(2)}, tokens=${bStats.meanTokens.toFixed(0)}`);
  log(`  Δ fidelity: ${(bStats.meanFidelity - aStats.meanFidelity).toFixed(2)}`);

  // B vs C
  log('\n═══ B vs C (does full DesignSpec help over planning-only?) ═══');
  const cStats = statsFor(filterBy(merged, { config: 'C' }));
  log(`  B: fidelity=${bStats.meanFidelity.toFixed(2)}, props=${bStats.meanProps.toFixed(2)}, tokens=${bStats.meanTokens.toFixed(0)}`);
  log(`  C: fidelity=${cStats.meanFidelity.toFixed(2)}, props=${cStats.meanProps.toFixed(2)}, tokens=${cStats.meanTokens.toFixed(0)}`);
  log(`  Δ fidelity: ${(cStats.meanFidelity - bStats.meanFidelity).toFixed(2)}`);

  // C vs D vs E
  log('\n═══ C vs D vs E (which slice preserves quality?) ═══');
  const dStats = statsFor(filterBy(merged, { config: 'D' }));
  const eStats = statsFor(filterBy(merged, { config: 'E' }));
  log(`  C (full):      fidelity=${cStats.meanFidelity.toFixed(2)}, props=${cStats.meanProps.toFixed(2)}, tokens=${cStats.meanTokens.toFixed(0)}`);
  log(`  D (labels):    fidelity=${dStats.meanFidelity.toFixed(2)}, props=${dStats.meanProps.toFixed(2)}, tokens=${dStats.meanTokens.toFixed(0)}`);
  log(`  E (structure): fidelity=${eStats.meanFidelity.toFixed(2)}, props=${eStats.meanProps.toFixed(2)}, tokens=${eStats.meanTokens.toFixed(0)}`);
  log(`  C-D fidelity gap: ${(cStats.meanFidelity - dStats.meanFidelity).toFixed(2)}`);
  log(`  C-E fidelity gap: ${(cStats.meanFidelity - eStats.meanFidelity).toFixed(2)}`);
  log(`  D token savings vs C: ${((1 - dStats.meanTokens / cStats.meanTokens) * 100).toFixed(1)}%`);
  log(`  E token savings vs C: ${((1 - eStats.meanTokens / cStats.meanTokens) * 100).toFixed(1)}%`);

  // NEW vs MODIFY split
  log('\n═══ NEW vs MODIFY Split ═══');
  for (const tt of ['NEW', 'MODIFY']) {
    log(`\n--- ${tt} tasks ---`);
    log('Config | n  | Fidelity | Props | Tokens');
    log('-------|----|---------:|------:|-------:');
    for (const c of configs) {
      const cells = filterBy(merged, { config: c, taskType: tt });
      const s = statsFor(cells);
      log(
        `  ${c}    | ${String(s.n).padStart(2)} | ${s.meanFidelity.toFixed(2)}    | ${s.meanProps.toFixed(2)}  | ${s.meanTokens.toFixed(0)}`,
      );
    }
  }

  // Quality-per-token frontier
  log('\n═══ Quality-per-Token Frontier ═══');
  log('Config | mean_fidelity / mean_input_tokens × 1000');
  log('-------|------------------------------------------');
  for (const c of configs) {
    const cells = filterBy(merged, { config: c });
    const s = statsFor(cells);
    const qpt = s.meanTokens > 0 ? (s.meanFidelity / s.meanTokens) * 1000 : 0;
    log(`  ${c}    | ${qpt.toFixed(4)}`);
  }

  // Decision rule
  log('\n═══ Decision Rule ═══');
  const cdGap = cStats.meanFidelity - dStats.meanFidelity;
  if (cdGap <= 0.3) {
    log(`C-D gap (${cdGap.toFixed(2)}) ≤ 0.3 → Recommend D (labels-only). Cheaper for equivalent quality.`);
  } else {
    log(`C-D gap (${cdGap.toFixed(2)}) > 0.3 → Recommend C (full). Quality difference justifies cost.`);
  }

  if (bStats.meanFidelity >= 2.0) {
    log(`B alone achieves ${bStats.meanFidelity.toFixed(2)} ≥ 2.0 mean fidelity — headline finding.`);
  }

  // Check if answer differs for NEW vs MODIFY
  const cNew = statsFor(filterBy(merged, { config: 'C', taskType: 'NEW' }));
  const dNew = statsFor(filterBy(merged, { config: 'D', taskType: 'NEW' }));
  const cMod = statsFor(filterBy(merged, { config: 'C', taskType: 'MODIFY' }));
  const dMod = statsFor(filterBy(merged, { config: 'D', taskType: 'MODIFY' }));

  const cdGapNew = cNew.meanFidelity - dNew.meanFidelity;
  const cdGapMod = cMod.meanFidelity - dMod.meanFidelity;

  if ((cdGapNew <= 0.3) !== (cdGapMod <= 0.3)) {
    log(`Answer differs by task type:`);
    log(`  NEW: C-D gap=${cdGapNew.toFixed(2)} → ${cdGapNew <= 0.3 ? 'D' : 'C'}`);
    log(`  MODIFY: C-D gap=${cdGapMod.toFixed(2)} → ${cdGapMod <= 0.3 ? 'D' : 'C'}`);
  } else {
    log(`Answer is the same for both NEW (C-D=${cdGapNew.toFixed(2)}) and MODIFY (C-D=${cdGapMod.toFixed(2)}).`);
  }

  log(`\nAnalysis complete. CSV at: ${CSV_PATH}`);
}

main();
