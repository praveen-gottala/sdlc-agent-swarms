import {
  extractScreenSubtree,
  inferSingleScreen,
  flattenTree,
  groupMissingByScreen,
  screenGridPosition,
} from './screen-partitioner.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import type { ScreenDefinition } from '../types.js';

// ============================================================================
// Fixtures
// ============================================================================

const makePlanningOutput = (overrides?: Partial<UXPlanningOutput>): UXPlanningOutput => ({
  specRef: 'spec-001',
  moduleId: 'mod-001',
  componentTree: [
    { name: 'AppLayout', props: ['columns'], children: [
      { name: 'NavHeader', props: [], children: [] },
    ]},
    { name: 'MetricsRow', props: [], children: [] },
    { name: 'AgentList', props: [], children: [
      { name: 'AgentCard', props: ['name'], children: [] },
    ]},
    { name: 'SettingsPanel', props: [], children: [] },
  ],
  tokenBindings: { 'AppLayout.bg': 'surface-primary' },
  responsiveRules: [{ breakpoint: 'desktop', behavior: '1440px' }],
  implementationStages: [{ stage: 'layout', tasks: ['grid'] }],
  ...overrides,
});

const TWO_SCREENS: readonly ScreenDefinition[] = [
  { screenId: 'home', name: 'Home', componentNames: ['AppLayout', 'MetricsRow'] },
  { screenId: 'agents', name: 'Agents', componentNames: ['AgentList', 'SettingsPanel'] },
];

// ============================================================================
// flattenTree
// ============================================================================

describe('flattenTree', () => {
  it('flattens nested componentTree into a flat name list', () => {
    const planningOutput = makePlanningOutput();
    const names = flattenTree(planningOutput.componentTree);
    expect(names).toEqual(['AppLayout', 'NavHeader', 'MetricsRow', 'AgentList', 'AgentCard', 'SettingsPanel']);
  });

  it('returns empty for empty tree', () => {
    expect(flattenTree([])).toEqual([]);
  });
});

// ============================================================================
// extractScreenSubtree
// ============================================================================

describe('extractScreenSubtree', () => {
  it('filters componentTree to only screen components', () => {
    const planning = makePlanningOutput();
    const result = extractScreenSubtree(planning, TWO_SCREENS[0]);
    expect(result.componentTree.map((n) => n.name)).toEqual(['AppLayout', 'MetricsRow']);
    // Children of matching nodes are preserved
    expect(result.componentTree[0].children[0].name).toBe('NavHeader');
  });

  it('preserves tokenBindings and responsiveRules', () => {
    const planning = makePlanningOutput();
    const result = extractScreenSubtree(planning, TWO_SCREENS[0]);
    expect(result.tokenBindings).toEqual(planning.tokenBindings);
    expect(result.responsiveRules).toEqual(planning.responsiveRules);
  });

  it('ignores component names not in tree gracefully', () => {
    const planning = makePlanningOutput();
    const screen: ScreenDefinition = { screenId: 'x', name: 'X', componentNames: ['NonExistent', 'AppLayout'] };
    const result = extractScreenSubtree(planning, screen);
    expect(result.componentTree.map((n) => n.name)).toEqual(['AppLayout']);
  });

  it('returns empty tree if no components match', () => {
    const planning = makePlanningOutput();
    const screen: ScreenDefinition = { screenId: 'x', name: 'X', componentNames: ['NonExistent'] };
    const result = extractScreenSubtree(planning, screen);
    expect(result.componentTree).toEqual([]);
  });
});

// ============================================================================
// inferSingleScreen
// ============================================================================

describe('inferSingleScreen', () => {
  it('wraps all top-level components into one screen', () => {
    const planning = makePlanningOutput();
    const screens = inferSingleScreen(planning);
    expect(screens).toHaveLength(1);
    expect(screens[0].screenId).toBe('main');
    expect(screens[0].componentNames).toEqual(['AppLayout', 'MetricsRow', 'AgentList', 'SettingsPanel']);
  });

  it('returns single screen for single-component tree', () => {
    const planning = makePlanningOutput({ componentTree: [{ name: 'Only', props: [], children: [] }] });
    const screens = inferSingleScreen(planning);
    expect(screens).toHaveLength(1);
    expect(screens[0].componentNames).toEqual(['Only']);
  });
});

// ============================================================================
// groupMissingByScreen
// ============================================================================

describe('groupMissingByScreen', () => {
  it('maps missing components to their owning screen', () => {
    const result = groupMissingByScreen(['AgentList', 'MetricsRow'], TWO_SCREENS);
    expect(result).toEqual({
      home: ['MetricsRow'],
      agents: ['AgentList'],
    });
  });

  it('assigns unmatched components to the last screen', () => {
    const result = groupMissingByScreen(['Unknown'], TWO_SCREENS);
    expect(result).toEqual({ agents: ['Unknown'] });
  });

  it('returns empty for no missing components', () => {
    expect(groupMissingByScreen([], TWO_SCREENS)).toEqual({});
  });
});

// ============================================================================
// screenGridPosition
// ============================================================================

describe('screenGridPosition', () => {
  it('returns origin for first screen', () => {
    expect(screenGridPosition(0)).toEqual({ x: 0, y: 0 });
  });

  it('places screens in a grid (default 4 cols)', () => {
    expect(screenGridPosition(1)).toEqual({ x: 1500, y: 0 });
    expect(screenGridPosition(3)).toEqual({ x: 4500, y: 0 });
    expect(screenGridPosition(4)).toEqual({ x: 0, y: 1200 });
    expect(screenGridPosition(5)).toEqual({ x: 1500, y: 1200 });
  });

  it('respects custom colsPerRow', () => {
    expect(screenGridPosition(2, 2)).toEqual({ x: 0, y: 1200 });
    expect(screenGridPosition(3, 2)).toEqual({ x: 1500, y: 1200 });
  });
});
