import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { UXPlanningOutput } from '../../ux-planning/ux-planning.js';
import {
  findNavigateToNodeId,
  injectMissingNavigateToInPlace,
  planningNameToKebab,
} from '../validate-navigate-to.js';

function minimalPlanning(tree: UXPlanningOutput['componentTree']): UXPlanningOutput {
  return {
    specRef: 's',
    moduleId: 'm',
    componentTree: tree,
    tokenBindings: {},
    responsiveRules: [],
  };
}

describe('planningNameToKebab', () => {
  it('converts NavItemHome to nav-item-home', () => {
    expect(planningNameToKebab('NavItemHome')).toBe('nav-item-home');
  });
});

describe('findNavigateToNodeId', () => {
  const base: DesignSpecV2 = {
    screen: 't',
    width: 1440,
    nodes: {
      root: { parent: null, order: 0, type: 'page' },
    },
  };

  it('rule 1: exact kebab id', () => {
    const spec: DesignSpecV2 = {
      ...base,
      nodes: {
        ...base.nodes,
        'nav-item-home': { parent: 'root', order: 0, catalog: 'tab' },
      },
    };
    expect(findNavigateToNodeId(spec, 'NavItemHome', 'dashboard', new Set())).toBe('nav-item-home');
  });

  it('rule 2: id contains kebab', () => {
    const spec: DesignSpecV2 = {
      ...base,
      nodes: {
        ...base.nodes,
        'row-nav-item-home-x': { parent: 'root', order: 0, catalog: 'tab' },
      },
    };
    expect(findNavigateToNodeId(spec, 'NavItemHome', 'foo', new Set())).toBe('row-nav-item-home-x');
  });

  it('rule 3: id contains target', () => {
    const spec: DesignSpecV2 = {
      ...base,
      nodes: {
        ...base.nodes,
        'tab-for-dashboard': { parent: 'root', order: 0, catalog: 'tab' },
      },
    };
    expect(findNavigateToNodeId(spec, 'Q', 'dashboard', new Set())).toBe('tab-for-dashboard');
  });

  it('rule 4: tab under navigation-bar ancestor', () => {
    const spec: DesignSpecV2 = {
      ...base,
      nodes: {
        ...base.nodes,
        'navigation-bar': { parent: 'root', order: 0, catalog: 'navigation-bar' },
        'orphan-tab': { parent: 'root', order: 1, catalog: 'tab' },
        'nav-tab-a': { parent: 'navigation-bar', order: 0, catalog: 'tab' },
      },
    };
    const used = new Set<string>();
    // Name does not match any id substring; target not in id — falls through to rule 4
    const id = findNavigateToNodeId(spec, 'Zeta', 'add-expense', used);
    expect(id).toBe('nav-tab-a');
  });

  it('returns null when nothing matches', () => {
    const spec: DesignSpecV2 = {
      ...base,
      nodes: {
        ...base.nodes,
        'icon-only': { parent: 'root', order: 0, catalog: 'text' },
      },
    };
    expect(findNavigateToNodeId(spec, 'X', 'missing-target-zzz', new Set())).toBeNull();
  });
});

describe('injectMissingNavigateToInPlace', () => {
  it('injects using exact kebab and uses separate nodes for two targets', () => {
    const spec: DesignSpecV2 = {
      screen: 'd',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'home-tab': { parent: 'root', order: 0, catalog: 'tab' },
        'add-tab': { parent: 'root', order: 1, catalog: 'tab' },
      },
    };
    const planning = minimalPlanning([
      { name: 'HomeTab', props: [], children: [], navigateTo: 'dashboard' },
      { name: 'AddTab', props: [], children: [], navigateTo: 'add-expense' },
    ]);
    const { stillMissing, applied } = injectMissingNavigateToInPlace(spec, planning);
    expect(stillMissing).toHaveLength(0);
    expect(applied).toHaveLength(2);
    expect(spec.nodes['home-tab']?.navigateTo).toBe('dashboard');
    expect(spec.nodes['add-tab']?.navigateTo).toBe('add-expense');
  });

  it('records stillMissing when no node can be matched', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const spec: DesignSpecV2 = {
      screen: 'd',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
      },
    };
    const planning = minimalPlanning([
      { name: 'OnlyNav', props: [], children: [], navigateTo: 'nowhere' },
    ]);
    const { stillMissing } = injectMissingNavigateToInPlace(spec, planning);
    expect(stillMissing.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });
});
