import { NextResponse } from 'next/server';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getActiveProjectRoot, readYamlFile } from '../_lib/project-reader';
import {
  loadCatalogForRenderer,
  findPageChromeRootIds,
  stripChromeFromSpec,
  stripPersistentOverlays,
  type DesignSpecV2,
  type SharedChromeSpec,
} from '@agentforge/designspec-renderer';
import { extractNavigationFromChromeSpec } from '@agentforge/agents-ux';

const PREVIEW_DIR = '.agentforge/previews';

interface PageEntry {
  id: string;
  name: string;
  route: string;
  screen_type?: 'page' | 'modal' | 'drawer' | 'sheet';
  navigates_to?: Array<{ target: string; trigger: string; source_node?: string; mode?: 'navigate' | 'overlay' }>;
}

interface PrototypeScreen {
  screenId: string;
  name: string;
  route: string;
  specPath: string;
  isDefault?: boolean;
  screenType?: 'page' | 'modal' | 'drawer' | 'sheet';
}

interface NavigationBindingEntry {
  sourceScreenId: string;
  sourceNodeId: string;
  targetScreenId: string;
  reason: string;
  mode?: 'navigate' | 'overlay';
}

interface PrototypeManifest {
  version: string;
  projectName: string;
  screens: PrototypeScreen[];
  navigation: NavigationBindingEntry[];
}

/**
 * GET /api/prototype
 *
 * Returns the prototype manifest, all screen specs, tokens, and catalog
 * in a single payload ready for the renderer's PrototypeApp.
 *
 * If a saved prototype.json exists (created by `design:page:all`), uses
 * its navigation bindings. Otherwise builds a basic manifest from
 * available designed screens (no navigation).
 */
export async function GET() {
  const projectRoot = getActiveProjectRoot();
  const previewsDir = join(projectRoot, PREVIEW_DIR);
  const agentforgeDir = join(projectRoot, 'agentforge');
  const designsDir = join(agentforgeDir, 'designs');

  if (!existsSync(previewsDir) && !existsSync(designsDir)) {
    return NextResponse.json({ error: 'No designs found' }, { status: 404 });
  }

  const pagesFile = readYamlFile<{ pages: PageEntry[] }>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const pageMap = new Map(pages.map(p => [p.id, p]));

  // Read prototype.json (from CLI pipeline)
  const savedManifestPath = join(agentforgeDir, 'prototype.json');
  let manifest: PrototypeManifest | null = null;

  if (existsSync(savedManifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(savedManifestPath, 'utf-8'));
    } catch {
      manifest = null;
    }
  }

  /**
   * The CLI pipeline writes `__shared-chrome__` (a.k.a. `__chrome__`) into
   * `prototype.json` as a pseudo-screen so the frozen-chrome pass can find
   * its spec. It is NOT a navigation destination and must never render as
   * a page — if it did, it would (a) appear in the ScreenSelectorBar and
   * (b) get picked as the default screen whenever it sorts ahead of the
   * real default (the saved manifest sometimes sets isDefault=true on both).
   *
   * Strip any screen whose id begins with `__` and any navigation bindings
   * that reference such a screen. The chrome spec itself is delivered to
   * the renderer via `chromeSpec` below, not via `manifest.screens`.
   */
  if (manifest) {
    const isPseudoScreen = (id: string) => id.startsWith('__');
    const filteredScreens = manifest.screens.filter(s => !isPseudoScreen(s.screenId));
    if (filteredScreens.length !== manifest.screens.length) {
      manifest = {
        ...manifest,
        screens: filteredScreens,
        navigation: manifest.navigation.filter(
          b => !isPseudoScreen(b.sourceScreenId) && !isPseudoScreen(b.targetScreenId),
        ),
      };
    }

    // After filtering pseudo-screens, ensure exactly one default screen exists.
    // Prefer route '/' or '/dashboard'; fall back to first page-type screen.
    const hasDefault = manifest.screens.some(s => s.isDefault);
    if (!hasDefault && manifest.screens.length > 0) {
      const best =
        manifest.screens.find(s => s.route === '/' || s.route === '/dashboard') ??
        manifest.screens.find(s => !s.screenType || s.screenType === 'page') ??
        manifest.screens[0];
      best.isDefault = true;
    }
  }

  // Build manifest from available screens if none saved
  if (!manifest) {
    const screens: PrototypeScreen[] = [];

    // Source 1: CLI pipeline outputs (.agentforge/previews/*/scripts/designspec-v2.json)
    if (existsSync(previewsDir)) {
      const entries = readdirSync(previewsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const specPath = join(previewsDir, entry.name, 'scripts', 'designspec-v2.json');
        if (!existsSync(specPath)) continue;

        const pageId = entry.name.replace(/^bookshelf-/, '');
        const page = pageMap.get(pageId);

        const screenType = page?.screen_type;
        screens.push({
          screenId: pageId,
          name: page?.name ?? pageId,
          route: page?.route ?? `/${pageId}`,
          specPath: join(PREVIEW_DIR, entry.name, 'scripts', 'designspec-v2.json'),
          isDefault: page?.route === '/' || page?.route === '/dashboard' || screens.length === 0,
          ...(screenType && screenType !== 'page' ? { screenType } : {}),
        });
      }
    }

    // Source 2: Dashboard-generated designs (agentforge/designs/{pageId}.json)
    const designsDir = join(projectRoot, 'agentforge', 'designs');
    if (existsSync(designsDir)) {
      const designedIds = new Set(screens.map(s => s.screenId));
      const designFiles = readdirSync(designsDir).filter(f => f.endsWith('.json') && !f.includes('.issues.'));
      for (const file of designFiles) {
        const pageId = file.replace(/\.json$/, '');
        if (designedIds.has(pageId)) continue;

        const specPath = join(designsDir, file);
        try {
          const content = JSON.parse(readFileSync(specPath, 'utf-8'));
          if (!content.nodes || typeof content.nodes !== 'object') continue;
        } catch { continue; }

        const page = pageMap.get(pageId);
        const designScreenType = page?.screen_type;
        screens.push({
          screenId: pageId,
          name: page?.name ?? pageId,
          route: page?.route ?? `/${pageId}`,
          specPath: join('agentforge', 'designs', file),
          isDefault: page?.route === '/' || page?.route === '/dashboard' || screens.length === 0,
          ...(designScreenType && designScreenType !== 'page' ? { screenType: designScreenType } : {}),
        });
      }
    }

    if (screens.length === 0) {
      return NextResponse.json({ error: 'No designed screens found' }, { status: 404 });
    }

    manifest = {
      version: '1.0',
      projectName: pages[0]?.name ?? 'Project',
      screens,
      navigation: [],
    };
  }

  // Augment manifest with screens from agentforge/designs/ not already present.
  // A user may create new pages in the dashboard after the CLI pipeline ran.
  {
    const existingIds = new Set(manifest.screens.map(s => s.screenId));
    if (existsSync(designsDir)) {
      const designFiles = readdirSync(designsDir).filter(f => f.endsWith('.json') && !f.includes('.issues.'));
      for (const file of designFiles) {
        const pageId = file.replace(/\.json$/, '');
        if (existingIds.has(pageId)) continue;

        const specPath = join(designsDir, file);
        try {
          const content = JSON.parse(readFileSync(specPath, 'utf-8'));
          if (!content.nodes || typeof content.nodes !== 'object') continue;
        } catch { continue; }

        const page = pageMap.get(pageId);
        const st = page?.screen_type;
        manifest = {
          ...manifest,
          screens: [
            ...manifest.screens,
            {
              screenId: pageId,
              name: page?.name ?? pageId,
              route: page?.route ?? `/${pageId}`,
              specPath: join('agentforge', 'designs', file),
              ...(st && st !== 'page' ? { screenType: st } : {}),
            },
          ],
        };
        existingIds.add(pageId);
      }
    }
  }

  // Prefer agentforge/designs/ specs (design canvas source of truth) over
  // .agentforge/previews/ specs so the prototype always matches the design canvas.
  for (const screen of manifest.screens) {
    const designPath = join('agentforge', 'designs', `${screen.screenId}.json`);
    const absDesignPath = join(projectRoot, designPath);
    if (existsSync(absDesignPath)) {
      screen.specPath = designPath;
    }
  }

  // Load all screen specs
  const specs: Record<string, unknown> = {};
  for (const screen of manifest.screens) {
    const specPath = join(projectRoot, screen.specPath);
    if (existsSync(specPath)) {
      try {
        specs[screen.screenId] = JSON.parse(readFileSync(specPath, 'utf-8'));
      } catch {
        // skip unreadable specs
      }
    }
  }

  // Backfill missing screenType from design spec JSON.
  // Matches CLI's build-manifest.ts:51 fallback: page.screen_type ?? spec.screenType ?? 'page'
  for (const screen of manifest.screens) {
    if (screen.screenType) continue;
    const spec = specs[screen.screenId] as Record<string, unknown> | undefined;
    if (spec?.screenType && spec.screenType !== 'page') {
      screen.screenType = spec.screenType as PrototypeScreen['screenType'];
    }
  }

  // Inject navigation bindings from pages.yaml navigates_to (user-defined).
  // Computed after screenType backfill so mode derivation uses correct screenTypes.
  const screenIds = new Set(manifest.screens.map(s => s.screenId));
  const screenTypeMap = new Map(manifest.screens.map(s => [s.screenId, s.screenType]));
  const userBindings: NavigationBindingEntry[] = [];
  for (const page of pages) {
    if (!page.navigates_to) continue;
    const screenId = page.id;
    if (!screenIds.has(screenId)) continue;
    for (const nav of page.navigates_to) {
      if (!nav.source_node || !screenIds.has(nav.target)) continue;
      const targetType = screenTypeMap.get(nav.target);
      const derivedMode = targetType && targetType !== 'page' ? 'overlay' : 'navigate';
      userBindings.push({
        sourceScreenId: screenId,
        sourceNodeId: nav.source_node,
        targetScreenId: nav.target,
        reason: nav.trigger,
        mode: nav.mode ?? derivedMode,
      });
    }
  }
  if (userBindings.length > 0) {
    manifest = {
      ...manifest,
      navigation: [...manifest.navigation, ...userBindings],
    };
  }

  if (Object.keys(specs).length === 0) {
    return NextResponse.json({ error: 'No valid screen specs found' }, { status: 404 });
  }

  function tryReadSharedChrome(path: string): SharedChromeSpec | null {
    if (!existsSync(path)) return null;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw && typeof raw === 'object' && raw.nodes && typeof raw.nodes === 'object') {
        return raw as SharedChromeSpec;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Pipeline output first; committed fallback (`shared-chrome.e2e.json`) for E2E without a local generate step. */
  const chromeSpec =
    tryReadSharedChrome(join(agentforgeDir, 'shared-chrome.json'))
    ?? tryReadSharedChrome(join(projectRoot, 'shared-chrome.e2e.json'));

  // Extract chrome navigation bindings (bell icon, logo, etc.) — apply on ALL pages
  if (chromeSpec) {
    const chromeBindings = extractNavigationFromChromeSpec(
      chromeSpec as DesignSpecV2,
      manifest.screens,
    );
    if (chromeBindings.length > 0) {
      manifest = {
        ...manifest,
        navigation: [...manifest.navigation, ...chromeBindings],
      };
    }
  }

  /**
   * Scrub duplicates from page specs before serving them to the renderer:
   *
   * 1. Shared chrome duplicate — When the Chrome Pass runs independently from
   *    the per-page design passes, the two LLM runs can produce mismatched
   *    IDs for the same component (e.g. chrome uses `topbar`, page uses
   *    `top-bar`). LayoutShell renders the chrome; without stripping, the
   *    page spec also renders its own copy, and the user sees a double
   *    header / footer. Resolve the page-side ids by pattern and strip them.
   *
   * 2. Persistent overlay backdrops — LLM page specs sometimes embed a modal
   *    dialog as a root-level absolute-positioned container with
   *    `background: 'overlay'`. There is no open/close state in DesignSpec,
   *    so it renders on top of the real content every time. Strip these out
   *    for the prototype view; overlay screens that should be visible come
   *    through via `screen_type: modal|drawer|sheet` and navigation bindings.
   */
  for (const [screenId, raw] of Object.entries(specs)) {
    const pageSpec = raw as DesignSpecV2;
    let cleaned = pageSpec;
    if (chromeSpec) {
      const duplicateRoots = findPageChromeRootIds(pageSpec, chromeSpec.regions);
      if (duplicateRoots.length > 0) {
        cleaned = stripChromeFromSpec(cleaned, duplicateRoots);
      }
    }
    cleaned = stripPersistentOverlays(cleaned);
    specs[screenId] = cleaned;
  }

  // Load tokens and catalog
  const rawTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
  const rawCatalog = readYamlFile<unknown>('agentforge/spec/component-catalog.yaml');

  const tokens = rawTokens
    ? (() => { const { version: _, created_by: __, ...rest } = rawTokens as Record<string, unknown>; void _; void __; return rest; })()
    : {};
  const catalog = loadCatalogForRenderer(
    (rawCatalog ?? undefined) as import('@agentforge/designspec-renderer').RawCatalogSpec | undefined,
    tokens as import('@agentforge/designspec-renderer').RendererTokens,
  );

  return NextResponse.json({
    manifest,
    specs,
    tokens,
    catalog,
    chromeSpec,
  });
}
