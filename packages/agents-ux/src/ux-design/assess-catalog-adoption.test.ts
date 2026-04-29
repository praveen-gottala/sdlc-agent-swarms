import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import { assessCatalogAdoption } from './assess-catalog-adoption.js';

function makeSpec(nodes: Record<string, NodeSpec>): DesignSpecV2 {
  return { screen: 'test', width: 1440, nodes };
}

describe('assessCatalogAdoption', () => {
  it('reports high adoption when catalog nodes dominate', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      sec: { parent: 'root', order: 0, catalog: 'Section', label: 'Settings', layout: { dir: 'column' } },
      input1: { parent: 'sec', order: 0, catalog: 'input-text', label: 'Name', placeholder: '' },
      input2: { parent: 'sec', order: 1, catalog: 'select', label: 'Country', placeholder: '' },
      btn: { parent: 'sec', order: 2, catalog: 'button-primary', label: 'Save' },
    }));

    expect(result.isLow).toBe(false);
    expect(result.catalogCount).toBe(4);
    expect(result.acceleratorCount).toBe(0);
    expect(result.catalogRatio).toBe(1);
  });

  it('flags low adoption with promotable patterns', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      hdr: { parent: 'root', order: 0, type: 'header', layout: { dir: 'row' } },
      htitle: { parent: 'hdr', order: 0, type: 'text', content: 'App', typography: 'heading-1' },
      content: { parent: 'root', order: 1, type: 'container', layout: { dir: 'column' } },
      sec: { parent: 'content', order: 0, type: 'container', layout: { dir: 'column' } },
      stitle: { parent: 'sec', order: 0, type: 'text', content: 'Profile', typography: 'heading-2' },
      input1: { parent: 'sec', order: 1, catalog: 'input-text', label: 'Name', placeholder: '' },
    }));

    expect(result.isLow).toBe(true);
    expect(result.acceleratorCount).toBeGreaterThan(result.catalogCount);
    expect(result.promotablePatterns.length).toBeGreaterThan(0);
    const targets = result.promotablePatterns.map(p => p.suggestedCatalog).sort();
    expect(targets).toContain('PageHeader');
    expect(targets).toContain('Section');
  });

  it('does not flag low adoption when no promotable patterns exist', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      c1: { parent: 'root', order: 0, type: 'container', layout: { dir: 'row' } },
      c2: { parent: 'root', order: 1, type: 'container', layout: { dir: 'row' } },
      t1: { parent: 'c1', order: 0, type: 'text', content: 'Hello', typography: 'body' },
      t2: { parent: 'c2', order: 0, type: 'text', content: 'World', typography: 'body' },
    }));

    expect(result.isLow).toBe(false);
    expect(result.promotablePatterns).toHaveLength(0);
  });

  it('excludes page/divider/spacer from counts', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      div: { parent: 'root', order: 0, type: 'divider' },
      space: { parent: 'root', order: 1, type: 'spacer', height: 16 },
      btn: { parent: 'root', order: 2, catalog: 'button-primary', label: 'Go' },
    }));

    expect(result.totalCountable).toBe(1);
    expect(result.catalogCount).toBe(1);
    expect(result.acceleratorCount).toBe(0);
  });

  it('identifies Form promotable pattern', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      form: { parent: 'root', order: 0, type: 'container', layout: { dir: 'column' } },
      f1: { parent: 'form', order: 0, catalog: 'input-text', label: 'A', placeholder: '' },
      f2: { parent: 'form', order: 1, catalog: 'select', label: 'B', placeholder: '' },
      f3: { parent: 'form', order: 2, catalog: 'checkbox', label: 'C' },
    }));

    const formPattern = result.promotablePatterns.find(p => p.suggestedCatalog === 'Form');
    expect(formPattern).toBeDefined();
    expect(formPattern!.nodeId).toBe('form');
  });

  it('skips nodes already promoted', () => {
    const result = assessCatalogAdoption(makeSpec({
      root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
      sec: { parent: 'root', order: 0, catalog: 'Section', label: 'Done', layout: { dir: 'column' }, overrides: { __promoted: true } },
      child: { parent: 'sec', order: 0, catalog: 'input-text', label: 'X', placeholder: '' },
    }));

    expect(result.promotablePatterns).toHaveLength(0);
  });
});
