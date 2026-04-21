import { extractNavigationFromSpecs, extractScreenSummary } from './build-manifest.js';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { PrototypeScreen } from '@agentforge/designspec-renderer';

describe('extractNavigationFromSpecs', () => {
  const screens: PrototypeScreen[] = [
    { screenId: 'dashboard', name: 'Dashboard', route: '/', specPath: '', isDefault: true },
    { screenId: 'claims', name: 'Claims', route: '/claims', specPath: '' },
    { screenId: 'settings', name: 'Settings', route: '/settings', specPath: '' },
  ];

  it('extracts bindings from nodes with navigateTo', () => {
    const specs: Record<string, DesignSpecV2> = {
      dashboard: {
        screen: 'Dashboard',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          tabs: { parent: 'root', order: 0, catalog: 'tabs', navigateTo: 'claims' },
          settingsBtn: { parent: 'root', order: 1, catalog: 'button', label: 'Settings', navigateTo: 'settings' },
        },
      },
      claims: {
        screen: 'Claims',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          backBtn: { parent: 'root', order: 0, catalog: 'button', navigateTo: 'dashboard' },
        },
      },
    };

    const bindings = extractNavigationFromSpecs(screens, specs);

    expect(bindings).toHaveLength(3);
    expect(bindings[0]).toEqual({
      sourceScreenId: 'dashboard',
      sourceNodeId: 'tabs',
      targetScreenId: 'claims',
      reason: expect.stringContaining('tabs'),
      mode: 'navigate',
    });
    expect(bindings[1]).toEqual({
      sourceScreenId: 'dashboard',
      sourceNodeId: 'settingsBtn',
      targetScreenId: 'settings',
      reason: expect.stringContaining('button'),
      mode: 'navigate',
    });
    expect(bindings[2]).toEqual({
      sourceScreenId: 'claims',
      sourceNodeId: 'backBtn',
      targetScreenId: 'dashboard',
      reason: expect.stringContaining('button'),
      mode: 'navigate',
    });
  });

  it('derives mode=overlay when target screen has non-page screenType', () => {
    const overlayScreens: PrototypeScreen[] = [
      { screenId: 'dashboard', name: 'Dashboard', route: '/', specPath: '', isDefault: true },
      { screenId: 'settings', name: 'Settings', route: '/settings', specPath: '', screenType: 'drawer' },
      { screenId: 'confirm', name: 'Confirm', route: '/confirm', specPath: '', screenType: 'modal' },
    ];

    const specs: Record<string, DesignSpecV2> = {
      dashboard: {
        screen: 'Dashboard',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          settingsBtn: { parent: 'root', order: 0, catalog: 'button', navigateTo: 'settings' },
          confirmBtn: { parent: 'root', order: 1, catalog: 'button', navigateTo: 'confirm' },
        },
      },
    };

    const bindings = extractNavigationFromSpecs(overlayScreens, specs);

    expect(bindings).toHaveLength(2);
    expect(bindings[0].mode).toBe('overlay');
    expect(bindings[1].mode).toBe('overlay');
  });

  it('filters out bindings targeting non-existent screens', () => {
    const specs: Record<string, DesignSpecV2> = {
      dashboard: {
        screen: 'Dashboard',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          btn: { parent: 'root', order: 0, catalog: 'button', navigateTo: 'nonexistent' },
        },
      },
    };

    const bindings = extractNavigationFromSpecs(screens, specs);
    expect(bindings).toHaveLength(0);
  });

  it('returns empty array when no nodes have navigateTo', () => {
    const specs: Record<string, DesignSpecV2> = {
      dashboard: {
        screen: 'Dashboard',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          text: { parent: 'root', order: 0, content: 'Hello' },
        },
      },
    };

    const bindings = extractNavigationFromSpecs(screens, specs);
    expect(bindings).toHaveLength(0);
  });

  it('handles missing specs for some screens', () => {
    const specs: Record<string, DesignSpecV2> = {
      dashboard: {
        screen: 'Dashboard',
        width: 1440,
        nodes: {
          root: { parent: null, order: 0 },
          btn: { parent: 'root', order: 0, catalog: 'button', navigateTo: 'claims' },
        },
      },
      // claims and settings specs are missing
    };

    const bindings = extractNavigationFromSpecs(screens, specs);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].sourceScreenId).toBe('dashboard');
  });
});

describe('extractScreenSummary', () => {
  it('extracts interactive nodes from a spec', () => {
    const spec: DesignSpecV2 = {
      screen: 'Dashboard',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0 },
        tabs: { parent: 'root', order: 0, catalog: 'tabs', label: 'Main Nav' },
        card: { parent: 'root', order: 1, catalog: 'card', label: 'Info' },
        btn: { parent: 'root', order: 2, catalog: 'button', label: 'Submit' },
        text: { parent: 'root', order: 3, content: 'Hello world' },
      },
    };

    const summary = extractScreenSummary('dashboard', '/', spec);

    expect(summary.screenId).toBe('dashboard');
    expect(summary.route).toBe('/');
    expect(summary.interactiveNodes).toHaveLength(2);
    expect(summary.interactiveNodes[0].catalog).toBe('tabs');
    expect(summary.interactiveNodes[1].catalog).toBe('button');
  });
});
