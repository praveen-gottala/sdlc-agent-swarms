import { chunkDesignSpec, chunkCatalog } from './design-chunker.js';

describe('chunkDesignSpec', () => {
  it('chunks by node from designSpec.nodes path', () => {
    const spec = {
      designSpec: {
        nodes: {
          'node-1': { type: 'container', catalog: 'Card', label: 'Main Card' },
          'node-2': { type: 'text', content: 'Hello' },
        },
      },
    };

    const result = chunkDesignSpec('designs/dashboard.json', JSON.stringify(spec), 'dashboard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.screenId).toBe('dashboard');
    expect(result.value[0]!.catalogEntry).toBe('Card');
    expect(result.value[0]!.nodeType).toBe('container');
    expect(result.value[1]!.nodeType).toBe('text');
  });

  it('handles nodes at top level', () => {
    const spec = {
      nodes: { 'n1': { type: 'section' } },
    };

    const result = chunkDesignSpec('design.json', JSON.stringify(spec), 'page-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('falls back to whole file for non-JSON', () => {
    const result = chunkDesignSpec('broken.json', 'not json', 'page-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.content).toBe('not json');
  });
});

describe('chunkCatalog', () => {
  it('chunks by component entry', () => {
    const content = `- id: Button
  variants:
    - primary
    - secondary
- id: Card
  variants:
    - elevated
    - flat`;

    const result = chunkCatalog('catalog.yaml', content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    expect(result.value[0]!.catalogEntry).toBe('Button');
    expect(result.value[0]!.screenId).toBe('__catalog__');
    expect(result.value[1]!.catalogEntry).toBe('Card');
  });
});
