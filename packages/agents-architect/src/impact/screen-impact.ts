/**
 * @module @agentforge/agents-architect/impact/screen-impact
 *
 * Deterministic screen-impact classifier — R9 §2 algorithm.
 * Compares post-change PRD screens against existing design spec files
 * to classify each screen as new/modified/unchanged.
 *
 * No LLM calls — pure data comparison. The change-classifier node
 * enriches these results with LLM-generated changeDescription + confidence.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AffectedScreen, ScreenRef } from '@agentforge/core';
import { readDesignSpec } from '@agentforge/core';

const DESIGNS_DIR = 'agentforge/designs';
const EXCLUDED_FILES = new Set([
  'prototype.json',
  'shared-chrome.json',
]);

export interface ScreenImpactInput {
  readonly projectRoot: string;
  readonly prdScreens: readonly ScreenRef[];
}

export interface ScreenImpactResult {
  readonly affectedScreens: AffectedScreen[];
}

/** Normalize a string to lowercase kebab-case for fuzzy matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** List existing design spec page IDs from disk. */
function listExistingDesignPageIds(projectRoot: string): string[] {
  const designsDir = join(projectRoot, DESIGNS_DIR);
  try {
    return readdirSync(designsDir)
      .filter(f => f.endsWith('.json'))
      .filter(f => !EXCLUDED_FILES.has(f))
      .filter(f => !f.endsWith('.backup.json'))
      .filter(f => !f.endsWith('.bak'))
      .filter(f => !f.endsWith('.issues.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/** Count nodes in a design spec. */
function countNodes(projectRoot: string, pageId: string): number {
  const spec = readDesignSpec(projectRoot, pageId);
  if (!spec?.nodes || typeof spec.nodes !== 'object') return 0;
  return Object.keys(spec.nodes as Record<string, unknown>).length;
}

/** Split into lowercase words. */
function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Check if word `a` is a prefix of word `b` or vice versa (min 4 chars). */
function wordPrefixMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Match PRD screen names to existing design page IDs.
 *
 * Two-pass matching:
 * 1. Substring — "Dashboard — Upcoming Card" contains "dashboard"
 * 2. Word-overlap — all words in pageId appear (as prefixes) in screen name.
 *    Catches cases like "confirm-delete" → "Delete Recurring Expense Confirmation"
 *    where "confirm" prefix-matches "confirmation" and "delete" matches exactly.
 */
function matchScreenToPageId(
  screenName: string,
  existingPageIds: string[],
): string | undefined {
  const normalized = normalize(screenName);

  for (const pageId of existingPageIds) {
    const normalizedPageId = normalize(pageId);
    if (normalized.startsWith(normalizedPageId) || normalized.includes(normalizedPageId)) {
      return pageId;
    }
  }

  const screenWords = words(screenName);
  for (const pageId of existingPageIds) {
    const pageWords = words(pageId);
    if (pageWords.length === 0) continue;
    const allMatch = pageWords.every(pw =>
      screenWords.some(sw => wordPrefixMatch(pw, sw)),
    );
    if (allMatch) return pageId;
  }

  return undefined;
}

/**
 * Classify per-screen impact — deterministic, no LLM.
 *
 * Algorithm (R9 §2):
 * 1. List existing design spec files on disk.
 * 2. For each PRD screen: match to existing spec by normalized name.
 *    - Match found → 'modified'
 *    - No match → 'new'
 * 3. Existing specs not referenced by any PRD screen → 'unchanged'.
 * 4. Multiple PRD screens targeting the same spec are collapsed to one entry.
 */
export function classifyScreenImpact(input: ScreenImpactInput): ScreenImpactResult {
  const { projectRoot, prdScreens } = input;
  const existingPageIds = listExistingDesignPageIds(projectRoot);
  const matchedPageIds = new Set<string>();
  const affectedScreens: AffectedScreen[] = [];
  const seenModified = new Set<string>();

  for (const screen of prdScreens) {
    const pageId = matchScreenToPageId(screen.name, existingPageIds);

    if (pageId) {
      matchedPageIds.add(pageId);
      if (!seenModified.has(pageId)) {
        seenModified.add(pageId);
        affectedScreens.push({
          screenId: pageId,
          impact: 'modified',
          existingSpecPath: join(DESIGNS_DIR, `${pageId}.json`),
          existingNodeCount: countNodes(projectRoot, pageId),
          confidence: 0.9,
        });
      }
    } else {
      const newScreenId = normalize(screen.name) || screen.id;
      affectedScreens.push({
        screenId: newScreenId,
        impact: 'new',
        confidence: 0.9,
      });
    }
  }

  for (const pageId of existingPageIds) {
    if (!matchedPageIds.has(pageId)) {
      affectedScreens.push({
        screenId: pageId,
        impact: 'unchanged',
        existingSpecPath: join(DESIGNS_DIR, `${pageId}.json`),
        existingNodeCount: countNodes(projectRoot, pageId),
        confidence: 0.95,
      });
    }
  }

  return { affectedScreens };
}
