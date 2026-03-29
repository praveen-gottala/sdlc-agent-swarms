import { generateProjectCatalog } from './generate-project-catalog.js';
import { loadBaseCatalog } from './index.js';
import { validateComponentCatalog } from '../state/design-system-reader.js';
import type { ComponentCatalogSpec, DesignTokensSpec } from '../types/design-system.js';

/** Minimal design tokens for testing. */
const MOCK_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: { white: '#FFFFFF', black: '#000000', blue500: '#3B82F6' },
    semantic: {
      'surface-primary': 'white',
      'text-primary': 'black',
      'cta-primary': 'blue500',
    },
  },
  typography: {
    font_families: { sans: 'Inter' },
    scale: [{ role: 'body', size: 16, weight: 400, family: 'sans' }],
  },
  spacing: { unit: 4, scale: [4, 8, 12, 16, 24, 32] },
  borders: { radius: { small: 4, medium: 8, large: 16 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: { levels: [{ level: 0, shadow: 'none', description: 'flat' }] },
  layout: {
    grid: { columns: 12, gutter: 16, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
  opacity: { scale: { subtle: 0.1, muted: 0.3, disabled: 0.38, overlay: 0.5 } },
  motion: {
    durations: { fast: 100, normal: 200, slow: 400, page: 600 },
    easings: { default: 'ease-out', emphasized: 'cubic-bezier(0.2,0,0,1)' },
  },
  state: {
    hover_opacity: 0.08,
    disabled_opacity: 0.38,
    focus_ring: { color: 'cta-primary', width: 2, offset: 2 },
  },
};

/** Minimal base catalog for unit tests. */
const MINI_CATALOG: ComponentCatalogSpec = {
  version: '1.0',
  created_by: 'test',
  components: {
    Button: {
      description: 'A button',
      category: 'input',
      anatomy: [{ name: 'label', contents: 'text' }],
      states: { default: { bg: 'surface-primary', text: 'text-primary' } },
      token_bindings: { background: 'surface-primary', text: 'text-primary', 'border-radius': 'medium' },
      spacing: { padding: '8 16', internal_gap: '8' },
      library_mapping: {
        shadcn: { component_name: 'Button', import_path: '@/components/ui/button', variant_prop: 'variant' },
        mui: { component_name: 'Button', import_path: '@mui/material/Button', variant_prop: 'variant' },
      },
      accessibility: { focus_visible: true, aria_labels: ['button'] },
    },
    Card: {
      description: 'A card',
      category: 'layout',
      anatomy: [{ name: 'body', contents: 'content' }],
      states: { default: { bg: 'surface-primary', text: 'text-primary' } },
      spacing: { padding: '16 20', internal_gap: '12' },
      library_mapping: {
        shadcn: { component_name: 'Card', import_path: '@/components/ui/card' },
      },
      accessibility: { focus_visible: false, aria_labels: [] },
    },
    NavBar: {
      description: 'Navigation bar',
      category: 'navigation',
      anatomy: [{ name: 'links', contents: 'nav items' }],
      states: { default: { bg: 'surface-primary', text: 'text-primary' } },
      spacing: { padding: '8 16', internal_gap: '8' },
      library_mapping: {
        mui: { component_name: 'AppBar', import_path: '@mui/material/AppBar' },
      },
      accessibility: { focus_visible: true, aria_labels: ['navigation'] },
    },
  },
};

describe('generateProjectCatalog', () => {
  it('filters to only shadcn mappings', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    // Button has shadcn mapping
    expect(Object.keys(result.components.Button.library_mapping)).toEqual(['shadcn']);
    // Card has shadcn mapping
    expect(Object.keys(result.components.Card.library_mapping)).toEqual(['shadcn']);
  });

  it('filters to only mui mappings', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'mui', MOCK_TOKENS);
    expect(Object.keys(result.components.Button.library_mapping)).toEqual(['mui']);
    expect(Object.keys(result.components.NavBar.library_mapping)).toEqual(['mui']);
  });

  it('components without mapping for chosen library get empty library_mapping', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    // NavBar only has mui, not shadcn
    expect(result.components.NavBar.library_mapping).toEqual({});
  });

  it('sets min_height from tokens for input category', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    expect(result.components.Button.min_height).toBe(44);
  });

  it('sets min_height from tokens for navigation category', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    expect(result.components.NavBar.min_height).toBe(44);
  });

  it('does not set min_height for layout category', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    expect(result.components.Card.min_height).toBeUndefined();
  });

  it('warns on unresolvable token_bindings', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const catalogWithBadTokens: ComponentCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Widget: {
          description: 'A widget',
          category: 'input',
          anatomy: [{ name: 'body', contents: 'content' }],
          states: { default: { bg: 'surface-primary', text: 'text-primary' } },
          token_bindings: { background: 'nonexistent-color', 'border-radius': 'nonexistent-radius' },
          spacing: { padding: '8', internal_gap: '4' },
          library_mapping: {},
          accessibility: { focus_visible: true, aria_labels: [] },
        },
      },
    };

    generateProjectCatalog(catalogWithBadTokens, 'shadcn', MOCK_TOKENS);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-color'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-radius'),
    );
    warnSpy.mockRestore();
  });

  it('throws on empty baseCatalog', () => {
    const empty: ComponentCatalogSpec = { version: '1.0', created_by: 'test', components: {} };
    expect(() => generateProjectCatalog(empty, 'shadcn', MOCK_TOKENS)).toThrow('no components');
  });

  it('throws on empty libraryId', () => {
    expect(() => generateProjectCatalog(MINI_CATALOG, '', MOCK_TOKENS)).toThrow('non-empty string');
  });

  it('throws on missing touch_targets', () => {
    const badTokens = { ...MOCK_TOKENS, touch_targets: { minimum_height: 0, minimum_width: 0 } } as DesignTokensSpec;
    expect(() => generateProjectCatalog(MINI_CATALOG, 'shadcn', badTokens)).toThrow('touch_targets');
  });

  it('output passes validateComponentCatalog()', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    const validation = validateComponentCatalog(result);
    expect(validation.ok).toBe(true);
  });

  it('sets created_by to agentforge-init', () => {
    const result = generateProjectCatalog(MINI_CATALOG, 'shadcn', MOCK_TOKENS);
    expect(result.created_by).toBe('agentforge-init');
  });

  it('works with the real base catalog for shadcn', () => {
    const baseCatalog = loadBaseCatalog();
    const result = generateProjectCatalog(baseCatalog, 'shadcn', MOCK_TOKENS);

    // Should have all components from base
    expect(Object.keys(result.components).length).toBe(Object.keys(baseCatalog.components).length);

    // No component should have mui or chakra in its mapping
    for (const [, entry] of Object.entries(result.components)) {
      expect(entry.library_mapping['mui']).toBeUndefined();
      expect(entry.library_mapping['chakra']).toBeUndefined();
    }

    // Validation should pass
    const validation = validateComponentCatalog(result);
    expect(validation.ok).toBe(true);
  });
});
