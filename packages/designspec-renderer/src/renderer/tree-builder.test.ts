import { buildTree } from './tree-builder.js';
import { loadFixture } from '../__fixtures__/load-fixture.js';
import type { TreeNode } from '../types/catalog.js';

const { spec: settingsForm } = loadFixture('settings-form');
const { spec: dashboardDetail } = loadFixture('dashboard-detail');

describe('buildTree — settings-form fixture', () => {
  const tree = buildTree(settingsForm.nodes);

  it('root is the single node with parent === null', () => {
    expect(tree.id).toBe('root');
    expect(tree.parent).toBeNull();
    expect(tree.type).toBe('page');
  });

  it('root has 2 children: header (order 0), content (order 1)', () => {
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].id).toBe('header');
    expect(tree.children[0].order).toBe(0);
    expect(tree.children[1].id).toBe('content');
    expect(tree.children[1].order).toBe(1);
  });

  it('content has 7 children sorted by order', () => {
    const content = tree.children[1];
    expect(content.children).toHaveLength(7);
    expect(content.children.map(c => c.id)).toEqual([
      'titleBlock', 'profileSection', 'divider1', 'prefsSection', 'divider2', 'spacer1', 'saveButton'
    ]);
  });

  it('profileSection has 5 children sorted by order', () => {
    const content = tree.children[1];
    const profileSection = content.children[1];
    expect(profileSection.children).toHaveLength(5);
    expect(profileSection.children.map(c => c.id)).toEqual([
      'nameInput', 'emailInput', 'currencyInput', 'themeToggle', 'statusDisplay'
    ]);
  });

  it('children are always sorted by order field', () => {
    function checkOrder(node: TreeNode): void {
      for (let i = 1; i < node.children.length; i++) {
        expect(node.children[i].order).toBeGreaterThanOrEqual(node.children[i - 1].order);
      }
      for (const child of node.children) {
        checkOrder(child);
      }
    }
    checkOrder(tree);
  });

  it('preserves node properties on text accelerators', () => {
    const logo = tree.children[0].children[0]; // header -> logo
    expect(logo.id).toBe('logo');
    expect(logo.type).toBe('text');
    expect(logo.content).toBe('AppName');
    expect(logo.typography).toBe('heading-3');
    expect(logo.color).toBe('cta-primary');
    expect(logo.weight).toBe(700);
  });

  it('preserves catalog references and overrides', () => {
    const content = tree.children[1];
    const emailInput = content.children[1].children[1]; // content -> profileSection -> emailInput
    expect(emailInput.catalog).toBe('input-text');
    expect(emailInput.label).toBe('Email Address');
    expect(emailInput.overrides).toBeDefined();
  });

  it('throws on no root node', () => {
    expect(() => buildTree({
      a: { parent: 'b', order: 0 },
      b: { parent: 'a', order: 0 },
    })).toThrow('No root node found');
  });

  it('throws on multiple root nodes', () => {
    expect(() => buildTree({
      a: { parent: null, order: 0 },
      b: { parent: null, order: 1 },
    })).toThrow('Multiple root nodes found');
  });
});

describe('buildTree — dashboard-detail fixture (72 nodes)', () => {
  const tree = buildTree(dashboardDetail.nodes);

  it('root exists and has children', () => {
    expect(tree.id).toBe('root');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('itemList has 4 card children (card0-card3)', () => {
    function findNode(node: TreeNode, id: string): TreeNode | undefined {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return undefined;
    }

    const itemList = findNode(tree, 'itemList');
    expect(itemList).toBeDefined();
    expect(itemList!.children).toHaveLength(4);
    expect(itemList!.children.map(c => c.id)).toEqual([
      'card0', 'card1', 'card2', 'card3'
    ]);
  });
});
