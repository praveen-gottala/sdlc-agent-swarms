import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { SharedChromeSpec } from '../../types/shared-chrome.js';
import {
  applyChromeActiveForPage,
  collectChromeRootIds,
  filterSpecToNodes,
  findPageChromeRootIds,
  isPersistentOverlayBackdrop,
  stripChromeFromSpec,
  stripPersistentOverlays,
} from './spec-split.js';

function minimalSpec(overrides: Partial<DesignSpecV2> = {}): DesignSpecV2 {
  return {
    screen: 'test',
    width: 1440,
    nodes: {},
    ...overrides,
  };
}

describe('filterSpecToNodes', () => {
  const base: DesignSpecV2 = minimalSpec({
    nodes: {
      root: { parent: null, order: 0, type: 'page' },
      a: { parent: 'root', order: 0, type: 'container' },
      a1: { parent: 'a', order: 0, type: 'text', content: 'x' },
      b: { parent: 'root', order: 1, type: 'container' },
      b1: { parent: 'b', order: 0, type: 'text', content: 'y' },
    },
  });

  it('keeps root, listed roots, and nested descendants', () => {
    const out = filterSpecToNodes(base, ['a']);
    expect(Object.keys(out.nodes).sort()).toEqual(['a', 'a1', 'root']);
  });

  it('empty keepRootChildren keeps only root', () => {
    const out = filterSpecToNodes(base, []);
    expect(Object.keys(out.nodes)).toEqual(['root']);
  });

  it('multiple root children', () => {
    const out = filterSpecToNodes(base, ['a', 'b']);
    expect(Object.keys(out.nodes).sort()).toEqual(['a', 'a1', 'b', 'b1', 'root']);
  });

  it('non-existent id in keep list does not throw', () => {
    const out = filterSpecToNodes(base, ['missing']);
    expect(Object.keys(out.nodes)).toEqual(['root']);
  });

  it('coerces root from page to container so region fragments do not claim 100vh', () => {
    const out = filterSpecToNodes(base, ['a']);
    expect((out.nodes.root as { type?: string }).type).toBe('container');
  });

  it('leaves non-page root types untouched', () => {
    const spec = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'container' },
        a: { parent: 'root', order: 0, type: 'container' },
      },
    });
    const out = filterSpecToNodes(spec, ['a']);
    expect((out.nodes.root as { type?: string }).type).toBe('container');
  });
});

describe('stripChromeFromSpec', () => {
  const base: DesignSpecV2 = minimalSpec({
    nodes: {
      root: { parent: null, order: 0, type: 'page' },
      chrome: { parent: 'root', order: 0, type: 'container' },
      chromeChild: { parent: 'chrome', order: 0, type: 'text', content: 'c' },
      main: { parent: 'root', order: 1, type: 'container' },
      mainChild: { parent: 'main', order: 0, type: 'text', content: 'm' },
    },
  });

  it('removes subtree under dropped root children', () => {
    const out = stripChromeFromSpec(base, ['chrome']);
    expect(Object.keys(out.nodes).sort()).toEqual(['main', 'mainChild', 'root']);
  });

  it('empty drop list returns same structure (new object)', () => {
    const out = stripChromeFromSpec(base, []);
    expect(out).toBe(base);
  });

  it('non-existent drop id is no-op', () => {
    const out = stripChromeFromSpec(base, ['nope']);
    expect(Object.keys(out.nodes).sort()).toEqual(Object.keys(base.nodes).sort());
  });

  it('drops multiple roots', () => {
    const out = stripChromeFromSpec(base, ['chrome', 'main']);
    expect(Object.keys(out.nodes)).toEqual(['root']);
  });

  it('strips empty root-level spacers but coerces non-empty spacers to container', () => {
    const specWithSpacers = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        chrome: { parent: 'root', order: 0, type: 'container' },
        'empty-spacer': { parent: 'root', order: 1, type: 'spacer' },
        'page-body-spacer': { parent: 'root', order: 2, type: 'spacer' },
        'content-1': { parent: 'page-body-spacer', order: 0, type: 'text', content: 'data' },
        main: { parent: 'root', order: 3, type: 'container' },
      },
    });
    const out = stripChromeFromSpec(specWithSpacers, ['chrome']);
    expect(out.nodes['empty-spacer']).toBeUndefined();
    expect(out.nodes['page-body-spacer']).toBeDefined();
    expect((out.nodes['page-body-spacer'] as { type?: string }).type).toBe('container');
    expect(out.nodes['content-1']).toBeDefined();
  });
});

describe('collectChromeRootIds', () => {
  it('flattens regions in order without duplicates', () => {
    const ids = collectChromeRootIds({
      header: ['top-bar'],
      footer: ['tabs', 'top-bar'],
    });
    expect(ids).toEqual(['top-bar', 'tabs']);
  });
});

describe('findPageChromeRootIds', () => {
  it('matches exact id', () => {
    const page = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        topbar: { parent: 'root', order: 0, type: 'container' },
        main: { parent: 'root', order: 1, type: 'container' },
      },
    });
    expect(findPageChromeRootIds(page, { header: ['topbar'] })).toEqual(['topbar']);
  });

  it('matches compact (hyphen-insensitive) id', () => {
    const page = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'top-bar': { parent: 'root', order: 0, type: 'container' },
        main: { parent: 'root', order: 1, type: 'container' },
      },
    });
    expect(findPageChromeRootIds(page, { header: ['topbar'] })).toEqual(['top-bar']);
  });

  it('falls back to region id pattern when no direct match', () => {
    const page = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'header-bar': { parent: 'root', order: 0, type: 'container' },
        'nav-tabs-footer': { parent: 'root', order: 1, type: 'container' },
      },
    });
    const ids = findPageChromeRootIds(page, {
      header: ['appShell-top'],
      footer: ['appShell-bottom'],
    });
    expect(ids.sort()).toEqual(['header-bar', 'nav-tabs-footer'].sort());
  });

  it('falls back to node.type when id does not hint the region', () => {
    const page = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'xyz-123': { parent: 'root', order: 0, type: 'header' } as never,
        main: { parent: 'root', order: 1, type: 'container' },
      },
    });
    expect(findPageChromeRootIds(page, { header: ['unrelated'] })).toEqual(['xyz-123']);
  });

  it('returns empty array when regions is undefined or empty', () => {
    const page = minimalSpec({
      nodes: { root: { parent: null, order: 0, type: 'page' } },
    });
    expect(findPageChromeRootIds(page, undefined)).toEqual([]);
    expect(findPageChromeRootIds(page, {})).toEqual([]);
  });
});

describe('isPersistentOverlayBackdrop / stripPersistentOverlays', () => {
  const specWithOverlay = minimalSpec({
    nodes: {
      root: { parent: null, order: 0, type: 'page' },
      main: { parent: 'root', order: 0, type: 'container' },
      'settings-dialog-overlay': {
        parent: 'root',
        order: 1,
        type: 'container',
        background: 'overlay',
        overrides: { position: 'absolute', zIndex: 100 },
      } as never,
      'dialog-child': { parent: 'settings-dialog-overlay', order: 0, type: 'text', content: 'x' },
    },
  });

  it('detects absolute + overlay background as persistent backdrop', () => {
    expect(isPersistentOverlayBackdrop(specWithOverlay.nodes['settings-dialog-overlay']!)).toBe(true);
  });

  it('does not detect plain containers', () => {
    expect(isPersistentOverlayBackdrop(specWithOverlay.nodes.main!)).toBe(false);
  });

  it('strips root-level overlays and their children', () => {
    const out = stripPersistentOverlays(specWithOverlay);
    expect(Object.keys(out.nodes).sort()).toEqual(['main', 'root']);
  });

  it('returns input unchanged when no overlays present', () => {
    const clean = minimalSpec({
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        main: { parent: 'root', order: 0, type: 'container' },
      },
    });
    expect(stripPersistentOverlays(clean)).toBe(clean);
  });
});

describe('applyChromeActiveForPage', () => {
  const chrome: SharedChromeSpec = {
    screen: '__chrome__',
    width: 1440,
    regions: { footer: ['tabs'] },
    nodes: {
      root: { parent: null, order: 0, type: 'page' },
      tabs: { parent: 'root', order: 0, catalog: 'navigation-tabs' },
      t1: { parent: 'tabs', order: 0, catalog: 'tab', navigateTo: 'dashboard' },
      t2: { parent: 'tabs', order: 1, catalog: 'tab', navigateTo: 'other' },
    },
  };

  it('sets active on matching navigateTo tab', () => {
    const out = applyChromeActiveForPage(chrome, 'other');
    expect((out.nodes.t1 as { active?: boolean }).active).toBe(false);
    expect((out.nodes.t2 as { active?: boolean }).active).toBe(true);
  });

  it('detects tabs by navigateTo even without catalog: tab (realistic chrome IDs)', () => {
    const realisticChrome: SharedChromeSpec = {
      screen: '__chrome__',
      width: 1440,
      regions: { header: ['top-bar', 'nav-tabs'] },
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'top-bar': { parent: 'root', order: 0, type: 'container' },
        'nav-tabs': { parent: 'root', order: 1, type: 'container' },
        'nav-tab-dashboard': { parent: 'nav-tabs', order: 0, type: 'container', navigateTo: 'dashboard' },
        'nav-tab-insights': { parent: 'nav-tabs', order: 1, type: 'container', navigateTo: 'spending-insights' },
        'nav-tab-add': { parent: 'nav-tabs', order: 2, type: 'container', navigateTo: 'add-expense' },
      },
    };
    const out = applyChromeActiveForPage(realisticChrome, 'spending-insights');
    expect((out.nodes['nav-tab-dashboard'] as { active?: boolean }).active).toBe(false);
    expect((out.nodes['nav-tab-insights'] as { active?: boolean }).active).toBe(true);
    expect((out.nodes['nav-tab-add'] as { active?: boolean }).active).toBe(false);
  });

  it('does not set active on nodes without navigateTo', () => {
    const out = applyChromeActiveForPage(chrome, 'dashboard');
    expect((out.nodes.root as { active?: boolean }).active).toBeUndefined();
    expect((out.nodes.tabs as { active?: boolean }).active).toBeUndefined();
  });
});
