import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { PageEntry } from '@agentforge/core';
import { deriveRegionsFromPageSpec, propagateNavigateToChromeTabs } from './merge-frozen-chrome.js';

function makeSpec(
  rootChildren: Array<{ id: string; order: number; catalog?: string; type?: string }>,
): DesignSpecV2 {
  const nodes: Record<string, Record<string, unknown>> = {
    root: { parent: null, order: 0, type: 'page' },
  };
  for (const c of rootChildren) {
    nodes[c.id] = {
      parent: 'root',
      order: c.order,
      ...(c.catalog ? { catalog: c.catalog } : {}),
      ...(c.type ? { type: c.type } : {}),
    };
  }
  return { screen: 'test', width: 1440, nodes } as unknown as DesignSpecV2;
}

describe('deriveRegionsFromPageSpec', () => {
  it('places topbar and nav-tabs in header when both precede content (PET case)', () => {
    const pageSpec = makeSpec([
      { id: 'topbar', order: 0, type: 'header' },
      { id: 'nav-tabs', order: 1, type: 'container' },
      { id: 'dashboard-body', order: 2, type: 'container' },
    ]);
    const chromeSpec = makeSpec([
      { id: 'topbar', order: 0, type: 'header' },
      { id: 'nav-tabs', order: 1, type: 'container' },
    ]);

    const result = deriveRegionsFromPageSpec(pageSpec, chromeSpec, ['TopBar', 'NavigationTabs']);

    expect(result).not.toBeNull();
    expect(result!.header).toEqual(['topbar', 'nav-tabs']);
    expect(result!.footer).toBeUndefined();
  });

  it('splits header and footer when content is between chrome (mobile case)', () => {
    const pageSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'main-content', order: 1, type: 'container' },
      { id: 'bottom-tabs', order: 2, catalog: 'tab-bar' },
    ]);
    const chromeSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'bottom-tabs', order: 1, catalog: 'tab-bar' },
    ]);

    const result = deriveRegionsFromPageSpec(pageSpec, chromeSpec, ['TopBar', 'BottomTabs']);

    expect(result).not.toBeNull();
    expect(result!.header).toEqual(['top-bar']);
    expect(result!.footer).toEqual(['bottom-tabs']);
  });

  it('places all chrome in header when no content nodes exist', () => {
    const pageSpec = makeSpec([
      { id: 'topbar', order: 0, type: 'header' },
      { id: 'nav-tabs', order: 1, type: 'container' },
    ]);
    const chromeSpec = makeSpec([
      { id: 'topbar', order: 0, type: 'header' },
      { id: 'nav-tabs', order: 1, type: 'container' },
    ]);

    const result = deriveRegionsFromPageSpec(pageSpec, chromeSpec, ['TopBar', 'NavigationTabs']);

    expect(result).not.toBeNull();
    expect(result!.header).toEqual(['topbar', 'nav-tabs']);
    expect(result!.footer).toBeUndefined();
  });

  it('handles multiple content nodes between header and footer chrome', () => {
    const pageSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'nav', order: 1, catalog: 'nav' },
      { id: 'content-1', order: 2, type: 'container' },
      { id: 'content-2', order: 3, type: 'container' },
      { id: 'footer-links', order: 4, catalog: 'footer-links' },
    ]);
    const chromeSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'nav', order: 1, catalog: 'nav' },
      { id: 'footer-links', order: 4, catalog: 'footer-links' },
    ]);

    const result = deriveRegionsFromPageSpec(
      pageSpec,
      chromeSpec,
      ['TopBar', 'Nav', 'FooterLinks'],
    );

    expect(result).not.toBeNull();
    expect(result!.header).toEqual(['top-bar', 'nav']);
    expect(result!.footer).toEqual(['footer-links']);
  });

  it('returns null when no shared component names resolve to node IDs', () => {
    const pageSpec = makeSpec([{ id: 'main', order: 0, type: 'container' }]);
    const chromeSpec = makeSpec([]);

    const result = deriveRegionsFromPageSpec(pageSpec, chromeSpec, ['UnknownComponent']);

    expect(result).toBeNull();
  });

  it('classifies chrome interspersed with content as header (structural chrome)', () => {
    const pageSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'content-a', order: 1, type: 'container' },
      { id: 'breadcrumbs', order: 2, catalog: 'breadcrumbs' },
      { id: 'content-b', order: 3, type: 'container' },
    ]);
    const chromeSpec = makeSpec([
      { id: 'top-bar', order: 0, type: 'header' },
      { id: 'breadcrumbs', order: 1, catalog: 'breadcrumbs' },
    ]);

    const result = deriveRegionsFromPageSpec(
      pageSpec,
      chromeSpec,
      ['TopBar', 'Breadcrumbs'],
    );

    expect(result).not.toBeNull();
    expect(result!.header).toEqual(['top-bar', 'breadcrumbs']);
    expect(result!.footer).toBeUndefined();
  });
});

describe('propagateNavigateToChromeTabs', () => {
  const pages: PageEntry[] = [
    { id: 'dashboard', name: 'Dashboard', description: '', route: '/', status: 'approved', components: [] },
    { id: 'add-expense', name: 'Add Expense', description: '', route: '/add', status: 'approved', components: [] },
    { id: 'spending-insights', name: 'Spending Insights', description: '', route: '/insights', status: 'approved', components: [] },
  ] as PageEntry[];

  function makeChromeSpec(): DesignSpecV2 {
    return {
      screen: '__chrome__', width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page' },
        'nav-tabs': { parent: 'root', order: 1, type: 'container' },
        'nav-tab-dashboard': { parent: 'nav-tabs', order: 0, type: 'container' },
        'nav-tab-dashboard-text': { parent: 'nav-tab-dashboard', order: 0, type: 'text', content: 'Dashboard' },
        'nav-tab-insights': { parent: 'nav-tabs', order: 1, type: 'container' },
        'nav-tab-insights-text': { parent: 'nav-tab-insights', order: 0, type: 'text', content: 'Insights' },
        'nav-tab-add': { parent: 'nav-tabs', order: 2, type: 'container' },
        'nav-tab-add-text': { parent: 'nav-tab-add', order: 0, type: 'text', content: 'Add Expense' },
      },
    } as unknown as DesignSpecV2;
  }

  it('sets navigateTo on chrome tab nodes by matching text to page names', () => {
    const result = propagateNavigateToChromeTabs(makeChromeSpec(), pages);
    const nodes = result.nodes as Record<string, { navigateTo?: string }>;
    expect(nodes['nav-tab-dashboard'].navigateTo).toBe('dashboard');
    expect(nodes['nav-tab-add'].navigateTo).toBe('add-expense');
    expect(nodes['nav-tab-insights'].navigateTo).toBe('spending-insights');
  });

  it('does not overwrite existing navigateTo', () => {
    const spec = makeChromeSpec();
    (spec.nodes as unknown as Record<string, Record<string, unknown>>)['nav-tab-dashboard'].navigateTo = 'custom';
    const result = propagateNavigateToChromeTabs(spec, pages);
    const nodes = result.nodes as Record<string, { navigateTo?: string }>;
    expect(nodes['nav-tab-dashboard'].navigateTo).toBe('custom');
  });

  it('returns same reference when no tabs match', () => {
    const spec = makeChromeSpec();
    const noPages: PageEntry[] = [];
    const result = propagateNavigateToChromeTabs(spec, noPages);
    expect(result).toBe(spec);
  });
});
