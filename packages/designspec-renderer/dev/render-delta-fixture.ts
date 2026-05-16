/**
 * CLI script to render a delta fixture to a standalone HTML preview.
 * Usage: npx tsx packages/designspec-renderer/dev/render-delta-fixture.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDelta } from '../src/renderer/delta/index.js';
import { DELTA_HIGHLIGHT_CSS } from '../src/renderer/delta/highlight-styles.js';
import type { DesignSpecV2 } from '../src/types/design-spec-v2.js';
import type { DesignSpecDelta } from '../src/renderer/delta/delta-types.js';
import type { RendererTokens } from '../src/types/tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures/personal-expense-tracker/agentforge');
const OUTPUT_PATH = path.join(__dirname, 'delta-preview.rendered.html');

async function loadDesignTokens(): Promise<RendererTokens> {
  const { SAMPLE_TOKENS } = await import('../src/__fixtures__/design-tokens.js');
  return SAMPLE_TOKENS;
}

function loadDashboard(): DesignSpecV2 {
  const specPath = path.join(FIXTURE_DIR, 'designs/dashboard.json');
  return JSON.parse(fs.readFileSync(specPath, 'utf-8'));
}

async function loadCatalog() {
  const { V2_BUILTIN_CATALOG } = await import('../src/__fixtures__/catalog-entries.js');
  return V2_BUILTIN_CATALOG;
}

// Hand-crafted delta matching R9's CashPulse brownfield example:
// "Add recurring transactions — let users mark a transaction as recurring
// and see upcoming recurrence on the dashboard."
const CASHPULSE_DELTA: DesignSpecDelta = {
  screenId: 'dashboard',
  baseWidth: 1440,
  added: {
    'recurring-section': {
      parent: 'left-column',
      order: 2,
      type: 'section',
      label: 'Upcoming Recurring',
    },
    'recurring-list': {
      parent: 'recurring-section',
      order: 0,
      type: 'container',
      layout: { dir: 'column', gap: 8 },
    },
    'recurring-item-netflix': {
      parent: 'recurring-list',
      order: 0,
      catalog: 'list-item',
      label: 'Netflix',
      overrides: {
        subtitle: 'Monthly · $15.99 · Due in 3 days',
        badge: 'recurring',
      },
    },
    'recurring-item-gym': {
      parent: 'recurring-list',
      order: 1,
      catalog: 'list-item',
      label: 'Gym Membership',
      overrides: {
        subtitle: 'Monthly · $45.00 · Due in 6 days',
        badge: 'recurring',
      },
    },
    'recurring-item-spotify': {
      parent: 'recurring-list',
      order: 2,
      catalog: 'list-item',
      label: 'Spotify',
      overrides: {
        subtitle: 'Monthly · $9.99 · Due in 10 days',
        badge: 'recurring',
      },
    },
  },
  modified: {
    'top-bar': {
      background: 'accent-primary',
    },
  },
  removed: [],
  reordered: [
    { nodeId: 'spending-categories', newOrder: 3 },
  ],
};

function buildPreviewHtml(jsxOutput: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>R10 Delta Preview — CashPulse Dashboard</title>
<style>
  :root {
    --color-background-primary: #ffffff;
    --color-background-secondary: #f5f4ef;
    --color-background-tertiary: #faf9f5;
    --color-text-primary: #1a1a19;
    --color-text-secondary: #5f5e5a;
    --color-text-tertiary: #888780;
    --color-border-tertiary: rgba(0, 0, 0, 0.15);
    --color-border-secondary: rgba(0, 0, 0, 0.3);
    --border-radius-md: 8px;
    --border-radius-lg: 12px;
    --font-sans: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

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
  }

  body {
    margin: 0;
    padding: 24px;
    font-family: var(--font-sans);
    background: var(--background-tertiary);
    color: var(--text-primary);
    line-height: 1.5;
  }

  .preview-header {
    max-width: 900px;
    margin: 0 auto 16px;
    font-size: 13px;
    color: var(--text-secondary);
  }
  .preview-header h1 {
    font-size: 16px;
    font-weight: 500;
    margin: 0 0 4px;
    color: var(--text-primary);
  }

  .preview-container {
    max-width: 900px;
    margin: 0 auto;
    background: var(--background-primary);
    border-radius: var(--border-radius-lg);
    border: 0.5px solid var(--border-primary);
    padding: 24px;
    overflow: hidden;
  }

  ${DELTA_HIGHLIGHT_CSS}
</style>
</head>
<body>
<div class="preview-header">
  <h1>R10 Delta Preview — Overlay Mode</h1>
  <p>CashPulse dashboard with "Add recurring transactions" delta applied.</p>
</div>
<div class="preview-container">
  <!-- DELTA OUTPUT START -->
  <pre style="font-size: 12px; line-height: 1.6; white-space: pre-wrap; font-family: 'SF Mono', 'Fira Code', monospace;">${escapeHtml(jsxOutput)}</pre>
  <!-- DELTA OUTPUT END -->
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main(): Promise<void> {
  console.log('Loading dashboard spec...');
  const dashboard = loadDashboard();
  console.log(`  ${Object.keys(dashboard.nodes).length} nodes`);

  // Check if the delta's parent nodes exist in the dashboard
  const existingIds = new Set(Object.keys(dashboard.nodes));
  const parentRef = CASHPULSE_DELTA.added['recurring-section']?.parent;
  if (parentRef && !existingIds.has(parentRef)) {
    // Find a suitable parent in the dashboard (first child of root)
    const rootChildren = Object.entries(dashboard.nodes)
      .filter(([_, n]) => n.parent === 'root')
      .sort((a, b) => a[1].order - b[1].order);
    if (rootChildren.length > 0) {
      console.log(`  Parent "${parentRef}" not found, using "${rootChildren[0][0]}" as parent`);
      // Patch delta to use an existing parent
      const patchedAdded = { ...CASHPULSE_DELTA.added };
      patchedAdded['recurring-section'] = {
        ...patchedAdded['recurring-section'],
        parent: rootChildren[0][0],
      };
      (CASHPULSE_DELTA as Record<string, unknown>).added = patchedAdded;
    }
  }

  // Check reordered nodes exist
  for (const r of CASHPULSE_DELTA.reordered) {
    if (!existingIds.has(r.nodeId)) {
      console.log(`  Reordered node "${r.nodeId}" not found, skipping`);
      (CASHPULSE_DELTA as Record<string, unknown>).reordered =
        CASHPULSE_DELTA.reordered.filter(x => x.nodeId !== r.nodeId);
    }
  }

  // Check modified nodes exist
  for (const id of Object.keys(CASHPULSE_DELTA.modified)) {
    if (!existingIds.has(id)) {
      console.log(`  Modified node "${id}" not found, removing from delta`);
      delete (CASHPULSE_DELTA.modified as Record<string, unknown>)[id];
    }
  }

  console.log('Loading tokens and catalog...');
  const tokens = await loadDesignTokens();
  const catalog = await loadCatalog();

  console.log('Rendering delta...');
  const result = renderDelta(dashboard, CASHPULSE_DELTA, tokens, catalog, { mode: 'overlay' });

  if (!result.ok) {
    console.error('Render failed:', result.error);
    process.exit(1);
  }

  const { jsx, changeRegions, metadata } = result.value;

  console.log('\nMetadata:');
  console.log(`  Added: ${metadata.addedCount}`);
  console.log(`  Modified: ${metadata.modifiedCount}`);
  console.log(`  Removed: ${metadata.removedCount}`);
  console.log(`  Reordered: ${metadata.reorderedCount}`);
  console.log(`  Total nodes: ${metadata.totalNodeCount}`);
  console.log(`  Complexity: ${metadata.estimatedRenderComplexity}`);

  console.log('\nChange regions:');
  for (const region of changeRegions) {
    console.log(`  ${region.op}: ${region.nodeId} — ${region.description}`);
    if (region.fieldDiffs && region.fieldDiffs.length > 0) {
      for (const fd of region.fieldDiffs) {
        console.log(`    ${fd.field}: ${JSON.stringify(fd.before)} → ${JSON.stringify(fd.after)}`);
      }
    }
  }

  console.log('\nWriting preview HTML...');
  const html = buildPreviewHtml(jsx);
  fs.writeFileSync(OUTPUT_PATH, html, 'utf-8');
  console.log(`\nPreview written to:\n  ${OUTPUT_PATH}`);
  console.log(`\nOpen in browser to verify visual output.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
