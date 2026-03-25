/**
 * @module @agentforge/agents-ux/ux-design/screen-partitioner
 *
 * Helpers for partitioning a planning output into per-screen slices.
 * Used by the design agent to generate one screen at a time,
 * reducing per-LLM-call token usage.
 */

import type { ComponentTreeNode, ScreenDefinition } from '../types.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';

// ============================================================================
// Tree helpers
// ============================================================================

/**
 * Flatten a ComponentTreeNode[] into a list of all node names (recursive).
 * Exported so callers can avoid reimplementing the same traversal.
 */
export const flattenTree = (nodes: readonly ComponentTreeNode[]): string[] => {
  const names: string[] = [];
  for (const node of nodes) {
    names.push(node.name);
    if (node.children && node.children.length > 0) {
      names.push(...flattenTree(node.children));
    }
  }
  return names;
};

// ============================================================================
// Screen partitioning
// ============================================================================

/**
 * Extract a sliced UXPlanningOutput containing only the components
 * belonging to a given screen. Filters `componentTree` by matching top-level
 * node names against `screen.componentNames`. Token bindings and responsive
 * rules are kept intact (they're lightweight and may reference cross-screen tokens).
 */
export const extractScreenSubtree = (
  planningOutput: UXPlanningOutput,
  screen: ScreenDefinition,
): UXPlanningOutput => {
  const nameSet = new Set(screen.componentNames);
  const filteredTree = planningOutput.componentTree.filter((node) => nameSet.has(node.name));

  return {
    ...planningOutput,
    componentTree: filteredTree,
  };
};

/**
 * Fallback when `screens` is undefined on the planning output.
 * Wraps the entire componentTree into a single ScreenDefinition so the
 * per-screen loop runs exactly once — identical behavior to the old code path.
 */
export const inferSingleScreen = (
  planningOutput: UXPlanningOutput,
): readonly ScreenDefinition[] => {
  const allNames = planningOutput.componentTree.map((node) => node.name);
  return [
    {
      screenId: 'main',
      name: 'Main',
      componentNames: allNames,
    },
  ];
};

/**
 * Map each missing component name back to its owning screen by looking up
 * `screen.componentNames`. Components that don't match any screen are
 * assigned to the last screen (defensive fallback).
 */
export const groupMissingByScreen = (
  missingNames: readonly string[],
  screens: readonly ScreenDefinition[],
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};

  for (const name of missingNames) {
    let assigned = false;
    for (const screen of screens) {
      if (screen.componentNames.includes(name)) {
        if (!result[screen.screenId]) result[screen.screenId] = [];
        result[screen.screenId].push(name);
        assigned = true;
        break;
      }
    }
    if (!assigned && screens.length > 0) {
      const lastScreen = screens[screens.length - 1];
      if (!result[lastScreen.screenId]) result[lastScreen.screenId] = [];
      result[lastScreen.screenId].push(name);
    }
  }

  return result;
};

/**
 * Compute the canvas position for a screen's root frame using a grid layout.
 * Prevents the canvas from becoming an unwieldy horizontal strip with many screens.
 *
 * @param screenIndex - Zero-based index of the screen
 * @param colsPerRow - Number of screens per row (default 4)
 * @returns `{ x, y }` position for the root frame
 */
export const screenGridPosition = (
  screenIndex: number,
  colsPerRow = 4,
): { x: number; y: number } => {
  const X_SPACING = 1500; // 1440px frame + 60px gap
  const Y_SPACING = 1200; // enough for tall screens + gap
  const col = screenIndex % colsPerRow;
  const row = Math.floor(screenIndex / colsPerRow);
  return { x: col * X_SPACING, y: row * Y_SPACING };
};
