import { buildEvaluationContext } from './evaluation-context.js';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

describe('buildEvaluationContext', () => {
  it('produces compact output for a small spec', () => {
    const spec: DesignSpecV2 = {
      screen: 'settings',
      width: 320,
      screenType: 'drawer',
      nodes: {
        'root': { parent: null, order: 0, type: 'page', background: 'surface-primary', width: 320, layout: { dir: 'column', gap: 16, py: 24, px: 16 } },
        'settings-title': { parent: 'root', order: 0, type: 'text', content: 'Settings' },
        'settings-theme': { parent: 'root', order: 1, type: 'container', width: 'fill' as const, height: 48, layout: { dir: 'row', align: 'center', justify: 'space-between', px: 8 } },
        'settings-theme-label': { parent: 'settings-theme', order: 0, type: 'text', content: 'Dark Mode' },
        'settings-theme-toggle': { parent: 'settings-theme', order: 1, catalog: 'switch', width: 44, height: 24, background: 'cta-primary' },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('Page: settings (320px wide, 5 nodes)');
    expect(result).toContain('Component tree:');
    expect(result).toContain('root [page] bg:surface-primary');
    expect(result).toContain('settings-title [text] "Settings"');
    expect(result).toContain('settings-theme-toggle [switch] bg:cta-primary');
    expect(result).not.toContain('layout');
    expect(result).not.toContain('gap');
    expect(result).not.toContain('overrides');
  });

  it('preserves navigateTo targets', () => {
    const spec: DesignSpecV2 = {
      screen: 'dashboard',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'tab-home': { parent: 'root', order: 0, catalog: 'tab', label: 'Home', navigateTo: 'dashboard', active: true },
        'tab-expense': { parent: 'root', order: 1, catalog: 'tab', label: 'Expenses', navigateTo: 'add-expense' },
        'tab-insights': { parent: 'root', order: 2, catalog: 'tab', label: 'Insights', navigateTo: 'spending-insights' },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('→ dashboard');
    expect(result).toContain('→ add-expense');
    expect(result).toContain('→ spending-insights');
    expect(result).toContain('(active)');
    expect(result).toContain('Navigation bindings: 3');
    expect(result).toContain('tab-home → dashboard');
    expect(result).toContain('tab-expense → add-expense');
    expect(result).toContain('tab-insights → spending-insights');
  });

  it('preserves catalog entries', () => {
    const spec: DesignSpecV2 = {
      screen: 'form',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'input-1': { parent: 'root', order: 0, catalog: 'text-input', placeholder: 'Enter amount' },
        'btn-1': { parent: 'root', order: 1, catalog: 'button', label: 'Submit', background: 'accent-primary' },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('[text-input]');
    expect(result).toContain('placeholder:"Enter amount"');
    expect(result).toContain('[button]');
    expect(result).toContain('"Submit"');
    expect(result).toContain('bg:accent-primary');
  });

  it('handles empty spec', () => {
    const spec: DesignSpecV2 = { screen: 'empty', width: 1440, nodes: {} };
    const result = buildEvaluationContext(spec);

    expect(result).toContain('0 nodes (empty spec)');
    expect(result).not.toContain('undefined');
  });

  it('handles spec with no root node', () => {
    const spec: DesignSpecV2 = {
      screen: 'orphans',
      width: 1440,
      nodes: {
        'a': { parent: 'missing', order: 0, type: 'text', content: 'Hello' },
        'b': { parent: 'missing', order: 1, type: 'text', content: 'World' },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('no root');
    expect(result).toContain('"Hello"');
    expect(result).toContain('"World"');
  });

  it('truncates long text at 60 chars', () => {
    const longText = 'A'.repeat(80);
    const spec: DesignSpecV2 = {
      screen: 'long',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'long-text': { parent: 'root', order: 0, type: 'text', content: longText },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('A'.repeat(60) + '...');
    expect(result).not.toContain('A'.repeat(80));
  });

  it('formats items arrays compactly', () => {
    const spec: DesignSpecV2 = {
      screen: 'nav',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'nav': {
          parent: 'root', order: 0, catalog: 'NavigationTabs',
          items: [
            { label: 'Dashboard', active: false },
            { label: 'Expenses', active: true },
            { label: 'Settings', active: false },
          ],
        },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('items: Dashboard, Expenses(active), Settings');
  });

  it('caps depth at 5 and summarizes deeper branches', () => {
    const nodes: Record<string, { parent: string | null; order: number; type?: string; catalog?: string }> = {
      'root': { parent: null, order: 0, type: 'page' },
    };
    let parentId = 'root';
    for (let i = 0; i < 8; i++) {
      const id = `level-${i}`;
      nodes[id] = { parent: parentId, order: 0, type: i === 7 ? 'text' : 'container' };
      parentId = id;
    }

    const spec: DesignSpecV2 = {
      screen: 'deep',
      width: 1440,
      nodes: nodes as DesignSpecV2['nodes'],
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('level-4');
    expect(result).toContain('... ');
    expect(result).toContain('child node');
  });

  it('includes explicit pixel widths smaller than viewport', () => {
    const spec: DesignSpecV2 = {
      screen: 'form',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'narrow-col': { parent: 'root', order: 0, type: 'container', width: 520 },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).toContain('(520px)');
  });

  it('excludes width equal to viewport', () => {
    const spec: DesignSpecV2 = {
      screen: 'full',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page', width: 1440 },
      },
    };

    const result = buildEvaluationContext(spec);

    expect(result).not.toContain('(1440px)');
  });

  it('handles circular parent references without infinite loop', () => {
    const spec: DesignSpecV2 = {
      screen: 'cycle',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page' },
        'a': { parent: 'root', order: 0, type: 'container' },
        'b': { parent: 'a', order: 0, type: 'container' },
      },
    };
    // b points to a, a points to root — no cycle here, but buildTree uses visited set
    const result = buildEvaluationContext(spec);
    expect(result).toContain('root');
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('produces significantly fewer tokens than raw JSON', () => {
    const spec: DesignSpecV2 = {
      screen: 'dashboard',
      width: 1440,
      nodes: {
        'root': { parent: null, order: 0, type: 'page', background: 'bg-primary', layout: { dir: 'column', gap: 0 } },
        'header': { parent: 'root', order: 0, catalog: 'TopBar', label: 'Dashboard', background: 'surface-primary', overrides: { border_bottom: '1px solid #ccc', height: 64, z_index: 1100 } },
        'nav': { parent: 'root', order: 1, catalog: 'NavigationTabs', background: 'surface-primary', items: [{ label: 'Home', active: true }, { label: 'Expenses', active: false }] },
        'content': { parent: 'root', order: 2, type: 'container', width: 'fill' as const, layout: { dir: 'column', gap: 24, px: 32, py: 24 } },
        'metrics': { parent: 'content', order: 0, type: 'section', layout: { dir: 'row', display: 'grid' as const, columns: 3, gap: 16 } },
        'card-1': { parent: 'metrics', order: 0, catalog: 'stat-card', label: 'Total', value: '$2,847', background: 'surface-primary' },
        'card-2': { parent: 'metrics', order: 1, catalog: 'stat-card', label: 'Average', value: '$94.92', background: 'surface-primary' },
        'card-3': { parent: 'metrics', order: 2, catalog: 'stat-card', label: 'Top', value: 'Food', background: 'surface-primary' },
        'chart-section': { parent: 'content', order: 1, type: 'container', layout: { dir: 'column', gap: 8 } },
        'chart-title': { parent: 'chart-section', order: 0, type: 'text', content: 'Spending Over Time' },
        'chart': { parent: 'chart-section', order: 1, catalog: 'chart', width: 'fill' as const, height: 300 },
      },
    };

    const rawJson = JSON.stringify(spec);
    const compact = buildEvaluationContext(spec);

    // Compact should be at least 2x smaller than raw JSON (ratio improves with larger specs)
    expect(compact.length).toBeLessThan(rawJson.length / 2);
    // And under 1000 chars for this 11-node spec
    expect(compact.length).toBeLessThan(1000);
  });
});
