/**
 * @module @agentforge/cli/preview/app-spec-preview
 *
 * Generates a multi-tabbed HTML preview for a complete app spec
 * (pages, models, API endpoints) with design system integration.
 */

import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';
import type { GeneratedAppSpec } from '../commands/design-generate.js';
import { isLight, resolveColor } from '../design/preview-helpers.js';

/** Generate an HTML preview showing the complete app spec. */
export function generateAppSpecPreviewHtml(
  appName: string,
  spec: GeneratedAppSpec,
  tokens: DesignTokensSpec,
  brand: BrandSpec,
): string {
  const displayFont = tokens.typography.font_families.display;
  const bodyFont = tokens.typography.font_families.body;
  const fontImport = [displayFont, bodyFont]
    .filter((f, i, a) => a.indexOf(f) === i)
    .map((f) => f.replace(/\s+/g, '+'))
    .join('&family=');

  const bgHex = resolveColor(tokens.colors.semantic['background-primary'], tokens.colors.primitive);
  const textHex = resolveColor(tokens.colors.semantic['text-primary'], tokens.colors.primitive);
  const ctaHex = resolveColor(tokens.colors.semantic['cta-primary'], tokens.colors.primitive);
  const primitiveVals = Object.values(tokens.colors.primitive);
  const surfaceHex = primitiveVals[4] ?? primitiveVals[3] ?? '#f5f5f5';

  const pageCards = spec.pages.map((page, i) => `
        <div class="page-card" style="animation-delay: ${i * 0.1}s">
          <div class="page-header">
            <span class="page-number">${i + 1}</span>
            <div>
              <h3 class="page-name">${page.name}</h3>
              <code class="page-route">${page.route}</code>
            </div>
          </div>
          <p class="page-desc">${page.description}</p>
          <div class="page-section">
            <div class="section-label">Components</div>
            <div class="chip-list">
              ${page.components.map((c) => `<span class="chip component-chip">${c}</span>`).join('')}
            </div>
          </div>
          <div class="page-section">
            <div class="section-label">Data Sources</div>
            <div class="chip-list">
              ${page.data_sources.map((d) => `<span class="chip data-chip">${d}</span>`).join('')}
            </div>
          </div>
        </div>`).join('\n');

  const modelCards = spec.models.map((model) => `
        <div class="model-card">
          <h4 class="model-name">${model.name}</h4>
          <code class="model-table">${model.db_table}</code>
          <table class="field-table">
            <thead><tr><th>Field</th><th>Type</th></tr></thead>
            <tbody>
              ${model.fields.map((f) => `<tr><td>${f.name}</td><td><code>${f.type}</code>${f.nullable ? ' <span class="nullable">nullable</span>' : ''}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('\n');

  const endpointRows = spec.endpoints.map((ep) => {
    const methodClass = ep.method.toLowerCase();
    return `
            <tr>
              <td><span class="method-badge ${methodClass}">${ep.method}</span></td>
              <td><code>${ep.path}</code></td>
              <td>${ep.description}</td>
              <td><code>${ep.response.schema_ref}</code></td>
            </tr>`;
  }).join('\n');

  // Build a flow diagram showing page connections
  const flowNodes = spec.pages.map((page, i) => {
    const x = 40 + (i % 3) * 280;
    const y = 40 + Math.floor(i / 3) * 120;
    return `<div class="flow-node" style="left:${x}px;top:${y}px">
              <div class="flow-node-name">${page.name}</div>
              <div class="flow-node-route">${page.route}</div>
            </div>`;
  }).join('\n');

  const flowHeight = (Math.ceil(spec.pages.length / 3)) * 120 + 80;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App Spec Preview — ${appName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${fontImport}&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: '${bodyFont}', -apple-system, sans-serif; background: #f4f5f7; color: #333; }

    .header {
      background: ${textHex};
      color: ${bgHex};
      padding: 48px 24px 40px;
      text-align: center;
    }
    .header h1 { font-family: '${displayFont}', sans-serif; font-size: 32px; font-weight: 700; margin-bottom: 8px; }
    .header p { font-size: 16px; opacity: 0.8; }
    .header .brand-badge {
      display: inline-block;
      margin-top: 12px;
      padding: 4px 16px;
      background: ${ctaHex};
      color: ${isLight(ctaHex) ? '#111' : '#fff'};
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }

    .tabs {
      display: flex;
      gap: 0;
      justify-content: center;
      background: #fff;
      border-bottom: 1px solid #e0e0e0;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .tab {
      padding: 14px 32px;
      border: none;
      background: transparent;
      font-size: 14px;
      font-weight: 500;
      color: #888;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all .2s;
      font-family: '${bodyFont}', sans-serif;
    }
    .tab.active { color: ${ctaHex}; border-bottom-color: ${ctaHex}; }
    .tab:hover:not(.active) { color: #555; }

    .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
    .panel { display: none; }
    .panel.active { display: block; }

    /* Pages */
    .pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
    .page-card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      animation: fadeIn 0.3s ease-out both;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    .page-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .page-number {
      width: 32px; height: 32px; border-radius: 8px;
      background: ${ctaHex}; color: ${isLight(ctaHex) ? '#111' : '#fff'};
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; flex-shrink: 0;
    }
    .page-name { font-family: '${displayFont}', sans-serif; font-size: 18px; font-weight: 600; color: ${textHex}; }
    .page-route { font-size: 12px; color: #888; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
    .page-desc { font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 16px; }
    .page-section { margin-top: 12px; }
    .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #999; letter-spacing: 0.5px; margin-bottom: 6px; }
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; }
    .component-chip { background: #e0f2fe; color: #0369a1; }
    .data-chip { background: #fce7f3; color: #9d174d; }

    /* Models */
    .models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .model-card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .model-name { font-family: '${displayFont}', sans-serif; font-size: 18px; font-weight: 600; color: ${textHex}; margin-bottom: 4px; }
    .model-table { font-size: 12px; color: #888; background: #f5f5f5; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 16px; }
    .field-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .field-table th { text-align: left; padding: 8px 0; border-bottom: 1px solid #e0e0e0; color: #999; font-weight: 500; font-size: 11px; text-transform: uppercase; }
    .field-table td { padding: 6px 0; border-bottom: 1px solid #f5f5f5; }
    .field-table code { background: #f5f5f5; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
    .nullable { font-size: 10px; color: #999; font-style: italic; }

    /* API */
    .api-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .api-table th { text-align: left; padding: 12px 16px; background: #fafafa; font-size: 11px; text-transform: uppercase; color: #999; font-weight: 600; border-bottom: 1px solid #e0e0e0; }
    .api-table td { padding: 12px 16px; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
    .api-table code { background: #f5f5f5; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
    .method-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: monospace; }
    .method-badge.get { background: #dcfce7; color: #166534; }
    .method-badge.post { background: #dbeafe; color: #1e40af; }
    .method-badge.put { background: #fef9c3; color: #854d0e; }
    .method-badge.patch { background: #fef9c3; color: #854d0e; }
    .method-badge.delete { background: #fecaca; color: #991b1b; }

    /* Flow */
    .flow-container { position: relative; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-height: ${flowHeight}px; }
    .flow-node {
      position: absolute;
      background: ${surfaceHex};
      border: 2px solid ${ctaHex};
      border-radius: 10px;
      padding: 12px 16px;
      min-width: 200px;
      text-align: center;
    }
    .flow-node-name { font-family: '${displayFont}', sans-serif; font-size: 14px; font-weight: 600; color: ${textHex}; }
    .flow-node-route { font-size: 11px; color: #888; margin-top: 2px; }

    /* Summary */
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .summary-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .summary-number { font-family: '${displayFont}', sans-serif; font-size: 32px; font-weight: 700; color: ${ctaHex}; }
    .summary-label { font-size: 12px; color: #888; margin-top: 4px; }

    .footer { text-align: center; padding: 40px 24px; color: #888; font-size: 14px; }
    .footer strong { color: #333; }
    .footer kbd { background: #e0e0e0; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${appName}</h1>
    <p>Generated App Specification</p>
    <span class="brand-badge">${brand.identity.tone} · ${brand.identity.audience}</span>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('overview')" data-tab="overview">Overview</button>
    <button class="tab" onclick="switchTab('pages')" data-tab="pages">Pages (${spec.pages.length})</button>
    <button class="tab" onclick="switchTab('models')" data-tab="models">Models (${spec.models.length})</button>
    <button class="tab" onclick="switchTab('api')" data-tab="api">API (${spec.endpoints.length})</button>
    <button class="tab" onclick="switchTab('flow')" data-tab="flow">User Flow</button>
  </div>

  <div class="container">
    <!-- Overview -->
    <div class="panel active" id="panel-overview">
      <div class="summary-strip">
        <div class="summary-card">
          <div class="summary-number">${spec.pages.length}</div>
          <div class="summary-label">Pages</div>
        </div>
        <div class="summary-card">
          <div class="summary-number">${spec.models.length}</div>
          <div class="summary-label">Data Models</div>
        </div>
        <div class="summary-card">
          <div class="summary-number">${spec.endpoints.length}</div>
          <div class="summary-label">API Endpoints</div>
        </div>
        <div class="summary-card">
          <div class="summary-number">${new Set(spec.pages.flatMap((p) => p.components)).size}</div>
          <div class="summary-label">Components</div>
        </div>
      </div>
      <div class="pages-grid">
        ${pageCards}
      </div>
    </div>

    <!-- Pages -->
    <div class="panel" id="panel-pages">
      <div class="pages-grid">
        ${pageCards}
      </div>
    </div>

    <!-- Models -->
    <div class="panel" id="panel-models">
      <div class="models-grid">
        ${modelCards}
      </div>
    </div>

    <!-- API -->
    <div class="panel" id="panel-api">
      <table class="api-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Description</th>
            <th>Response</th>
          </tr>
        </thead>
        <tbody>
          ${endpointRows}
        </tbody>
      </table>
    </div>

    <!-- Flow -->
    <div class="panel" id="panel-flow">
      <div class="flow-container">
        ${flowNodes}
      </div>
    </div>
  </div>

  <div class="footer">
    Return to your terminal — type <kbd>y</kbd> to approve, <kbd>r</kbd> to regenerate, or <kbd>n</kbd> to cancel.
  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    }
  </script>
</body>
</html>`;
}

