/**
 * @module @agentforge/agents-ux/prototype/build-manifest
 *
 * Auto-builds a PrototypeManifest by scanning the previews directory
 * for designed screens and matching them against pages.yaml.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PageEntry } from '@agentforge/core';
import { PREVIEW_DIR_REL } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { PrototypeManifest, PrototypeScreen, NavigationBinding } from '@agentforge/designspec-renderer';

function normalizeDesignSpecShape(raw: unknown): DesignSpecV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.nodes && typeof record.nodes === 'object') return record as unknown as DesignSpecV2;
  if (record.spec && typeof record.spec === 'object') {
    const nested = record.spec as Record<string, unknown>;
    if (nested.nodes && typeof nested.nodes === 'object') return nested as unknown as DesignSpecV2;
  }
  return null;
}

/**
 * Scan the previews directory for all designed screens and build a manifest.
 * Matches each designspec-v2.json to pages.yaml entries for route/name metadata.
 */
export function buildPrototypeManifest(
  projectRoot: string,
  projectName: string,
  pages: readonly PageEntry[],
  navigation: readonly NavigationBinding[] = [],
): PrototypeManifest {
  const previewsDir = join(projectRoot, PREVIEW_DIR_REL);
  const screens: PrototypeScreen[] = [];

  if (!existsSync(previewsDir)) {
    return { version: '1.0', projectName, screens, navigation };
  }

  const pageMap = new Map(pages.map(p => [p.id, p]));
  const entries = readdirSync(previewsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const specPath = join(previewsDir, entry.name, 'scripts', 'designspec-v2.json');
    if (!existsSync(specPath)) continue;

    let spec: DesignSpecV2;
    try {
      const parsed = JSON.parse(readFileSync(specPath, 'utf-8'));
      const normalized = normalizeDesignSpecShape(parsed);
      if (!normalized) continue;
      spec = normalized;
    } catch {
      continue;
    }

    const pageId = entry.name.replace(/^bookshelf-/, '');
    const page = pageMap.get(pageId);

    const screenType = page?.screen_type ?? spec.screenType ?? 'page';
    screens.push({
      screenId: pageId,
      name: page?.name ?? spec.screen ?? pageId,
      route: page?.route ?? `/${pageId}`,
      specPath: join(PREVIEW_DIR_REL, entry.name, 'scripts', 'designspec-v2.json'),
      isDefault: page?.route === '/' || page?.route === '/dashboard' || screens.length === 0,
      ...(screenType !== 'page' ? { screenType } : {}),
    });
  }

  return { version: '1.0', projectName, screens, navigation };
}

/**
 * Extract a condensed summary of interactive nodes from a DesignSpecV2.
 * Used as input for LLM navigation analysis — sends ~2-3KB per screen
 * instead of the full 10-20KB spec.
 */
export interface ScreenSummary {
  readonly screenId: string;
  readonly route: string;
  readonly interactiveNodes: readonly InteractiveNode[];
}

export interface InteractiveNode {
  readonly nodeId: string;
  readonly catalog: string;
  readonly label?: string;
  readonly options?: readonly string[];
}

/**
 * Extract NavigationBindings directly from DesignSpec v2 nodes
 * that have navigateTo set. Deterministic — no LLM needed.
 */
export function extractNavigationFromSpecs(
  screens: readonly PrototypeScreen[],
  specs: Readonly<Record<string, DesignSpecV2>>,
): NavigationBinding[] {
  const bindings: NavigationBinding[] = [];
  const validScreenIds = new Set(screens.map(s => s.screenId));

  const screenTypeMap = new Map(screens.map(s => [s.screenId, s.screenType]));

  for (const screen of screens) {
    const spec = specs[screen.screenId];
    if (!spec?.nodes) continue;

    for (const [nodeId, node] of Object.entries(spec.nodes)) {
      if (node.navigateTo && validScreenIds.has(node.navigateTo)) {
        const targetType = screenTypeMap.get(node.navigateTo);
        const mode = targetType && targetType !== 'page' ? 'overlay' as const : 'navigate' as const;
        bindings.push({
          sourceScreenId: screen.screenId,
          sourceNodeId: nodeId,
          targetScreenId: node.navigateTo,
          reason: `spec-driven: ${node.catalog ?? node.type ?? 'node'} navigates to ${node.navigateTo}`,
          mode,
        });
      }
    }
  }

  return bindings;
}

/**
 * Extract NavigationBindings from shared chrome spec nodes that have navigateTo.
 * Chrome bindings use sourceScreenId: '__chrome__' to indicate they apply on ALL pages.
 */
export function extractNavigationFromChromeSpec(
  chromeSpec: DesignSpecV2,
  screens: readonly PrototypeScreen[],
): NavigationBinding[] {
  const bindings: NavigationBinding[] = [];
  const validScreenIds = new Set(screens.map(s => s.screenId));
  const screenTypeMap = new Map(screens.map(s => [s.screenId, s.screenType]));

  for (const [nodeId, node] of Object.entries(chromeSpec.nodes)) {
    if (node.navigateTo && validScreenIds.has(node.navigateTo)) {
      const targetType = screenTypeMap.get(node.navigateTo);
      const mode = targetType && targetType !== 'page' ? 'overlay' as const : 'navigate' as const;
      bindings.push({
        sourceScreenId: '__chrome__',
        sourceNodeId: nodeId,
        targetScreenId: node.navigateTo,
        reason: `chrome: ${node.catalog ?? node.type ?? 'node'} navigates to ${node.navigateTo}`,
        mode,
      });
    }
  }

  return bindings;
}

export function extractScreenSummary(
  screenId: string,
  route: string,
  spec: DesignSpecV2,
): ScreenSummary {
  const interactiveNodes: InteractiveNode[] = [];

  for (const [nodeId, node] of Object.entries(spec.nodes)) {
    if (!('catalog' in node) || !node.catalog) continue;

    const catalog = node.catalog as string;
    const isInteractive = /^(tabs|button|link|navbar|nav|menu|breadcrumb|icon-button)/i.test(catalog);
    if (!isInteractive) continue;

    interactiveNodes.push({
      nodeId,
      catalog,
      ...(node.label ? { label: node.label as string } : {}),
      ...(node.options ? { options: (node.options as unknown as Array<{ label: string }>).map(o => o.label) } : {}),
    });
  }

  return { screenId, route, interactiveNodes };
}
