/**
 * Renders M3.6 eval fixtures to self-contained HTML references.
 * NEW tasks → renderToJSX. MODIFY tasks → renderDelta with synthetic deltas.
 * Usage: npx tsx scripts/render-m3-6-fixtures.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures/personal-expense-tracker/agentforge');
const OUTPUT_DIR = path.join(ROOT, 'packages/eval/results/m3-6-references');

interface TaskDef {
  id: string;
  taskType: 'NEW' | 'MODIFY';
  designSpecPath: string;
  existingDesignSpecPath?: string;
  summary: string;
}

const TASKS: TaskDef[] = [
  {
    id: 'cashpulse-dashboard-summary-card',
    taskType: 'NEW',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    summary: 'Dashboard with budget summary, spending categories, and recent expenses (159 nodes)',
  },
  {
    id: 'cashpulse-transactions-list-page',
    taskType: 'NEW',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/spending-insights.json',
    summary: 'Spending insights page with charts, category breakdowns, and trend indicators (161 nodes)',
  },
  {
    id: 'cashpulse-settings-form',
    taskType: 'NEW',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/settings.json',
    summary: 'Settings form with currency, budget, and category management (62 nodes)',
  },
  {
    id: 'cashpulse-dashboard-modify-add-recurring-card',
    taskType: 'MODIFY',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    existingDesignSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    summary: 'Dashboard + "Upcoming Recurring" card added to left column (5 nodes added, 1 reordered)',
  },
  {
    id: 'cashpulse-add-expense-modify-recurrence-toggle',
    taskType: 'MODIFY',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/add-expense.json',
    existingDesignSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/add-expense.json',
    summary: 'Add-expense form + "Make this recurring" toggle with frequency/date fields (6 nodes added)',
  },
  {
    id: 'cashpulse-transactions-list-modify-recurring-badge',
    taskType: 'MODIFY',
    designSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    existingDesignSpecPath: 'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    summary: 'Dashboard expense list rows + recurring frequency badges (4 nodes modified with badge overrides)',
  },
];

// Synthetic deltas for MODIFY tasks (since designSpecPath === existingDesignSpecPath)
function getSyntheticDelta(taskId: string): Record<string, unknown> {
  switch (taskId) {
    case 'cashpulse-dashboard-modify-add-recurring-card':
      return {
        screenId: 'dashboard',
        baseWidth: 1440,
        added: {
          'recurring-section': {
            parent: 'left-column', order: 1, type: 'section',
            label: 'Upcoming Recurring',
            layout: { dir: 'column', gap: 8 }, background: 'surface-primary', radius: 12,
          },
          'recurring-list': {
            parent: 'recurring-section', order: 0, type: 'container',
            layout: { dir: 'column', gap: 4 },
          },
          'recurring-item-netflix': {
            parent: 'recurring-list', order: 0, catalog: 'list-item',
            label: 'Netflix', overrides: { subtitle: 'Monthly · $15.99 · Due in 3 days' },
          },
          'recurring-item-gym': {
            parent: 'recurring-list', order: 1, catalog: 'list-item',
            label: 'Gym Membership', overrides: { subtitle: 'Monthly · $45.00 · Due in 6 days' },
          },
          'recurring-item-spotify': {
            parent: 'recurring-list', order: 2, catalog: 'list-item',
            label: 'Spotify', overrides: { subtitle: 'Monthly · $9.99 · Due in 10 days' },
          },
        },
        modified: {},
        removed: [],
        reordered: [{ nodeId: 'category-donut-card', newOrder: 2 }],
      };

    case 'cashpulse-add-expense-modify-recurrence-toggle':
      return {
        screenId: 'add-expense',
        baseWidth: 1440,
        added: {
          'recurrence-section': {
            parent: 'expense-form-card', order: 10, type: 'section',
            label: 'Recurrence', layout: { dir: 'column', gap: 12 },
          },
          'recurrence-toggle': {
            parent: 'recurrence-section', order: 0, catalog: 'toggle',
            label: 'Make this recurring',
          },
          'recurrence-frequency': {
            parent: 'recurrence-section', order: 1, catalog: 'segmented-control',
            label: 'Frequency',
            options: [
              { label: 'Weekly', selected: false },
              { label: 'Monthly', selected: true },
              { label: 'Yearly', selected: false },
            ],
          },
          'recurrence-start-date': {
            parent: 'recurrence-section', order: 2, catalog: 'date-picker',
            label: 'Start Date', placeholder: 'Select start date',
          },
          'recurrence-end-date': {
            parent: 'recurrence-section', order: 3, catalog: 'date-picker',
            label: 'End Date (optional)', placeholder: 'No end date',
          },
          'recurrence-summary': {
            parent: 'recurrence-section', order: 4, type: 'text',
            content: 'Repeats monthly starting today',
            typography: 'caption', color: 'text-secondary',
          },
        },
        modified: {},
        removed: [],
        reordered: [],
      };

    case 'cashpulse-transactions-list-modify-recurring-badge':
      return {
        screenId: 'dashboard',
        baseWidth: 1440,
        added: {
          'recurring-badge-1': { parent: 'expense-row-1-right', order: 2, catalog: 'badge', label: 'Monthly', overrides: { variant: 'secondary' } },
          'recurring-badge-3': { parent: 'expense-row-3-right', order: 2, catalog: 'badge', label: 'Weekly', overrides: { variant: 'secondary' } },
          'recurring-badge-4': { parent: 'expense-row-4-right', order: 2, catalog: 'badge', label: 'Monthly', overrides: { variant: 'secondary' } },
          'recurring-badge-6': { parent: 'expense-row-6-right', order: 2, catalog: 'badge', label: 'Yearly', overrides: { variant: 'secondary' } },
        },
        modified: {},
        removed: [],
        reordered: [],
      };

    default:
      return { screenId: '', baseWidth: 1440, added: {}, modified: {}, removed: [], reordered: [] };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ChangeRegionInfo {
  nodeId: string;
  op: string;
  description: string;
  fieldDiffs?: ReadonlyArray<{ field: string; before: unknown; after: unknown }>;
}

function buildChangeSummaryHtml(regions: ChangeRegionInfo[]): string {
  if (regions.length === 0) return '';
  const opColors: Record<string, { border: string; bg: string; badge: string; text: string; label: string }> = {
    added:     { border: '#639922', bg: 'rgba(99,153,34,0.08)',  badge: '#C0DD97', text: '#173404', label: '+ Added' },
    modified:  { border: '#BA7517', bg: 'rgba(186,117,23,0.08)', badge: '#FAC775', text: '#412402', label: '~ Modified' },
    removed:   { border: '#E24B4A', bg: 'rgba(226,75,74,0.06)',  badge: '#F7C1C1', text: '#501313', label: '− Removed' },
    reordered: { border: '#BA7517', bg: 'rgba(186,117,23,0.08)', badge: '#FAC775', text: '#412402', label: '↕ Reordered' },
  };

  const rows = regions.map(r => {
    const c = opColors[r.op] ?? opColors['modified'];
    let diffHtml = '';
    if (r.fieldDiffs && r.fieldDiffs.length > 0) {
      diffHtml = '<div style="margin-top:4px;font-size:11px;color:#5f5e5a;">' +
        r.fieldDiffs.map(d => `<code>${escapeHtml(d.field)}</code>: ${escapeHtml(JSON.stringify(d.before))} → ${escapeHtml(JSON.stringify(d.after))}`).join('<br>') +
        '</div>';
    }
    return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 12px;border-left:3px solid ${c.border};background:${c.bg};border-radius:0 8px 8px 0;">
      <span style="display:inline-block;font-size:10px;font-weight:500;padding:2px 8px;border-radius:8px;background:${c.badge};color:${c.text};white-space:nowrap;flex-shrink:0;">${c.label}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:500;">${escapeHtml(r.nodeId)}</div>
        <div style="font-size:11px;color:#5f5e5a;">${escapeHtml(r.description)}</div>
        ${diffHtml}
      </div>
    </div>`;
  }).join('\n');

  const addedCount = regions.filter(r => r.op === 'added').length;
  const modifiedCount = regions.filter(r => r.op === 'modified').length;
  const removedCount = regions.filter(r => r.op === 'removed').length;
  const reorderedCount = regions.filter(r => r.op === 'reordered').length;
  const summary = [
    addedCount > 0 ? `${addedCount} added` : '',
    modifiedCount > 0 ? `${modifiedCount} modified` : '',
    removedCount > 0 ? `${removedCount} removed` : '',
    reorderedCount > 0 ? `${reorderedCount} reordered` : '',
  ].filter(Boolean).join(', ');

  return `<div style="max-width:900px;margin:0 auto 16px;background:#fff;border-radius:12px;border:0.5px solid rgba(0,0,0,0.15);padding:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <h2 style="font-size:14px;font-weight:600;margin:0;">Change Summary</h2>
    <span style="font-size:12px;color:#5f5e5a;">${summary}</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px;">
    ${rows}
  </div>
</div>`;
}

function buildHtml(
  title: string,
  jsxContent: string,
  isDelta: boolean,
  highlightCss: string,
  changeRegions?: ChangeRegionInfo[],
): string {
  const changeSummary = isDelta && changeRegions ? buildChangeSummaryHtml(changeRegions) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --background-primary: #ffffff;
    --background-secondary: #f5f4ef;
    --background-tertiary: #faf9f5;
    --surface-primary: #ffffff;
    --surface-secondary: #f5f4ef;
    --accent-primary: #0F6E56;
    --cta-primary: #0F6E56;
    --text-primary: #1a1a19;
    --text-secondary: #5f5e5a;
    --text-tertiary: #888780;
    --text-on-cta: #ffffff;
    --border-primary: rgba(0, 0, 0, 0.15);
    --border-secondary: rgba(0, 0, 0, 0.3);
    --success: #1D9E75;
    --warning: #BA7517;
    --error: #E24B4A;
    --info: #378ADD;
    --border-radius-md: 8px;
    --border-radius-lg: 12px;
    --font-sans: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  body {
    margin: 0; padding: 24px;
    font-family: var(--font-sans);
    background: var(--background-tertiary);
    color: var(--text-primary);
    line-height: 1.5;
  }
  .header { max-width: 900px; margin: 0 auto 16px; }
  .header h1 { font-size: 16px; font-weight: 500; margin: 0 0 4px; }
  .header p { font-size: 13px; color: var(--text-secondary); margin: 0 0 8px; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 8px; font-weight: 500; }
  .badge-new { background: #dbeafe; color: #1e40af; }
  .badge-modify { background: #FAC775; color: #412402; }
  .content {
    max-width: 900px; margin: 0 auto;
    background: var(--background-primary);
    border-radius: var(--border-radius-lg);
    border: 0.5px solid var(--border-primary);
    padding: 16px; overflow: auto;
  }
  pre {
    font-size: 11px; line-height: 1.5;
    white-space: pre-wrap; word-wrap: break-word;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    margin: 0;
  }
  ${isDelta ? highlightCss : ''}
</style>
</head>
<body>
<div class="header">
  <h1>${escapeHtml(title)}</h1>
  <p><span class="badge ${isDelta ? 'badge-modify' : 'badge-new'}">${isDelta ? 'MODIFY' : 'NEW'}</span></p>
</div>
${changeSummary}
<div class="content">
<pre>${escapeHtml(jsxContent)}</pre>
</div>
</body>
</html>`;
}

async function main(): Promise<void> {
  const { renderToJSX, renderDelta, DELTA_HIGHLIGHT_CSS } = await import(
    '../packages/designspec-renderer/src/renderer/delta/index.js'
  );
  const { renderToJSX: renderToJSXDirect } = await import(
    '../packages/designspec-renderer/src/renderer/react/index.js'
  );
  const { SAMPLE_TOKENS } = await import(
    '../packages/designspec-renderer/src/__fixtures__/design-tokens.js'
  );
  const { V2_BUILTIN_CATALOG } = await import(
    '../packages/designspec-renderer/src/__fixtures__/catalog-entries.js'
  );

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest: Array<{ id: string; path: string; summary: string }> = [];

  for (const task of TASKS) {
    console.log(`\nRendering: ${task.id} (${task.taskType})`);

    const specPath = path.join(ROOT, task.designSpecPath);
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    console.log(`  Spec: ${spec.screen} (${Object.keys(spec.nodes).length} nodes)`);

    const outputPath = path.join(OUTPUT_DIR, `${task.id}.html`);
    let jsxContent: string;
    let isDelta = false;
    let changeRegions: ChangeRegionInfo[] = [];

    if (task.taskType === 'NEW') {
      const result = renderToJSXDirect(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
      jsxContent = result.jsx;
      console.log(`  Rendered: ${result.nodeIds.length} nodes, ${result.warnings.length} warnings`);
    } else {
      isDelta = true;
      const delta = getSyntheticDelta(task.id);
      const result = renderDelta(spec, delta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG, { mode: 'overlay' });
      if (!result.ok) {
        console.error(`  FAILED: ${result.error.message}`);
        continue;
      }
      jsxContent = result.value.jsx;
      changeRegions = result.value.changeRegions as ChangeRegionInfo[];
      const m = result.value.metadata;
      console.log(`  Delta: +${m.addedCount} ~${m.modifiedCount} -${m.removedCount} ↕${m.reorderedCount}`);
      console.log(`  Regions: ${result.value.changeRegions.map((r: { op: string; nodeId: string }) => `${r.op}:${r.nodeId}`).join(', ')}`);
    }

    const title = `M3.6 Reference — ${task.id}`;
    const html = buildHtml(title, jsxContent, isDelta, DELTA_HIGHLIGHT_CSS, changeRegions);
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`  Written: ${outputPath}`);

    manifest.push({ id: task.id, path: outputPath, summary: task.summary });
  }

  console.log('\n═══ Manifest ═══');
  for (const entry of manifest) {
    console.log(`  ${entry.id}`);
    console.log(`    ${entry.path}`);
    console.log(`    ${entry.summary}`);
  }
  console.log(`\n${manifest.length} references generated in ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
