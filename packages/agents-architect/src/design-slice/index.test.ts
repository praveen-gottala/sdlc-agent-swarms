import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import { extractLabelsAndBindings, extractStructure } from './index.js';

function makeSpec(nodes: Record<string, NodeSpec>): DesignSpecV2 {
  return { screen: 'test-screen', width: 1440, nodes };
}

const FULL_NODE: NodeSpec = {
  parent: 'root',
  order: 0,
  type: 'container',
  catalog: 'card',
  label: 'Summary Card',
  content: 'Total spent this month',
  value: '$1,234.56',
  placeholder: 'Enter amount',
  options: [{ label: 'Weekly', selected: true }],
  layout: { dir: 'column', gap: 8, px: 16, py: 12 },
  width: 'fill',
  height: 200,
  typography: 'heading-2',
  color: 'text-primary',
  weight: 700,
  background: 'surface-card',
  shadow: 'md',
  radius: 12,
  overrides: { variant: 'elevated' },
  navigateTo: 'detail-page',
  items: [{ id: '1', name: 'Groceries' }],
};

const MINIMAL_NODE: NodeSpec = {
  parent: null,
  order: 0,
  type: 'page',
};

describe('extractLabelsAndBindings', () => {
  it('preserves node count', () => {
    const spec = makeSpec({
      root: MINIMAL_NODE,
      card: FULL_NODE,
      text: { parent: 'card', order: 1, type: 'text', label: 'Hello' },
    });
    const sliced = extractLabelsAndBindings(spec);
    expect(Object.keys(sliced.nodes)).toHaveLength(3);
  });

  it('retains content fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractLabelsAndBindings(spec);
    const node = sliced.nodes['card'];
    expect(node.parent).toBe('root');
    expect(node.order).toBe(0);
    expect(node.type).toBe('container');
    expect(node.catalog).toBe('card');
    expect(node.label).toBe('Summary Card');
    expect(node.content).toBe('Total spent this month');
    expect(node.value).toBe('$1,234.56');
    expect(node.placeholder).toBe('Enter amount');
    expect(node.options).toEqual([{ label: 'Weekly', selected: true }]);
    expect(node.navigateTo).toBe('detail-page');
    expect(node.items).toEqual([{ id: '1', name: 'Groceries' }]);
  });

  it('drops layout fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractLabelsAndBindings(spec);
    const node = sliced.nodes['card'];
    expect(node.layout).toBeUndefined();
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
  });

  it('drops visual fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractLabelsAndBindings(spec);
    const node = sliced.nodes['card'];
    expect(node.typography).toBeUndefined();
    expect(node.color).toBeUndefined();
    expect(node.weight).toBeUndefined();
    expect(node.background).toBeUndefined();
    expect(node.shadow).toBeUndefined();
    expect(node.radius).toBeUndefined();
    expect(node.overrides).toBeUndefined();
  });

  it('preserves screen-level metadata', () => {
    const spec: DesignSpecV2 = {
      screen: 'dashboard',
      width: 1440,
      nodes: { root: MINIMAL_NODE },
      screenType: 'page',
      regions: { header: ['nav'] },
    };
    const sliced = extractLabelsAndBindings(spec);
    expect(sliced.screen).toBe('dashboard');
    expect(sliced.width).toBe(1440);
    expect(sliced.screenType).toBe('page');
    expect(sliced.regions).toEqual({ header: ['nav'] });
  });
});

describe('extractStructure', () => {
  it('preserves node count', () => {
    const spec = makeSpec({
      root: MINIMAL_NODE,
      card: FULL_NODE,
      text: { parent: 'card', order: 1, type: 'text', label: 'Hello' },
    });
    const sliced = extractStructure(spec);
    expect(Object.keys(sliced.nodes)).toHaveLength(3);
  });

  it('retains only structural fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractStructure(spec);
    const node = sliced.nodes['card'];
    expect(node.parent).toBe('root');
    expect(node.order).toBe(0);
    expect(node.type).toBe('container');
    expect(node.catalog).toBe('card');
  });

  it('drops label fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractStructure(spec);
    const node = sliced.nodes['card'];
    expect(node.label).toBeUndefined();
    expect(node.content).toBeUndefined();
    expect(node.value).toBeUndefined();
    expect(node.placeholder).toBeUndefined();
    expect(node.options).toBeUndefined();
    expect(node.navigateTo).toBeUndefined();
    expect(node.items).toBeUndefined();
  });

  it('drops layout and visual fields', () => {
    const spec = makeSpec({ card: FULL_NODE });
    const sliced = extractStructure(spec);
    const node = sliced.nodes['card'];
    expect(node.layout).toBeUndefined();
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
    expect(node.typography).toBeUndefined();
    expect(node.color).toBeUndefined();
    expect(node.weight).toBeUndefined();
    expect(node.background).toBeUndefined();
    expect(node.shadow).toBeUndefined();
    expect(node.radius).toBeUndefined();
    expect(node.overrides).toBeUndefined();
  });

  it('preserves screen-level metadata', () => {
    const spec: DesignSpecV2 = {
      screen: 'settings',
      width: 1440,
      nodes: { root: MINIMAL_NODE },
      screenType: 'modal',
    };
    const sliced = extractStructure(spec);
    expect(sliced.screen).toBe('settings');
    expect(sliced.width).toBe(1440);
    expect(sliced.screenType).toBe('modal');
    expect(sliced.regions).toBeUndefined();
  });
});
