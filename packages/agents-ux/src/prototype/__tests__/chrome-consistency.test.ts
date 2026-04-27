import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import { applyFrozenChromeToPageSpec } from '../merge-frozen-chrome.js';

/**
 * B1: chrome subtrees are identical per page when frozen merge runs (order/active stripped).
 */
describe('chrome consistency (frozen merge)', () => {
  it('makes top-bar match shared chrome; tabs differ only by active', () => {
    const frozen: DesignSpecV2 = {
      screen: '__chrome__',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'top-bar': {
          parent: 'root',
          order: 0,
          catalog: 'top-bar',
          height: 56,
        },
        'nav-tabs': {
          parent: 'root',
          order: 1,
          catalog: 'navigation-tabs',
        },
        'tab-a': {
          parent: 'nav-tabs',
          order: 0,
          catalog: 'tab',
          navigateTo: 'dashboard',
        },
        'tab-b': {
          parent: 'nav-tabs',
          order: 1,
          catalog: 'tab',
          navigateTo: 'add-expense',
        },
      },
    };

    const page: DesignSpecV2 = {
      screen: 'dashboard',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'top-bar': { parent: 'root', order: 0, catalog: 'top-bar', height: 99 },
        'nav-tabs': { parent: 'root', order: 1, catalog: 'navigation-tabs' },
        'tab-a': { parent: 'nav-tabs', order: 0, catalog: 'tab', navigateTo: 'dashboard' },
        'tab-b': { parent: 'nav-tabs', order: 1, catalog: 'tab', navigateTo: 'add-expense' },
        'main': { parent: 'root', order: 2, type: 'container' },
      },
    };

    const merged = applyFrozenChromeToPageSpec(page, frozen, 'dashboard');
    function canonical(n: (typeof page.nodes)[string]) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { active, order, ...rest } = n as NodeSpec & { active?: boolean; order: number };
      return rest;
    }
    expect(merged.nodes['top-bar']?.height).toBe(56);
    expect(merged.nodes['main']).toEqual(page.nodes['main']);
    const tabA = merged.nodes['tab-a'] as NodeSpec & { active?: boolean };
    const tabB = merged.nodes['tab-b'] as NodeSpec & { active?: boolean };
    expect(tabA?.active).toBe(true);
    expect(tabB?.active).toBe(false);
    expect(canonical(merged.nodes['top-bar']!)).toEqual(canonical(frozen.nodes['top-bar']!));
  });
});
