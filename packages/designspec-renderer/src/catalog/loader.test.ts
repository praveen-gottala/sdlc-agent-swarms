import { loadCatalogForRenderer, RawCatalogSpec } from './loader.js';

describe('loadCatalogForRenderer', () => {
  it('returns V2 built-ins when called with no args', () => {
    const catalog = loadCatalogForRenderer();
    expect(Object.keys(catalog)).toHaveLength(15);
  });

  it('contains expected built-in entry keys', () => {
    const catalog = loadCatalogForRenderer();
    expect(catalog['input-text']).toBeDefined();
    expect(catalog['button-primary']).toBeDefined();
    expect(catalog['card']).toBeDefined();
    expect(catalog['segmented-control']).toBeDefined();
    expect(catalog['stepper']).toBeDefined();
    expect(catalog['display-readonly']).toBeDefined();
    expect(catalog['badge']).toBeDefined();
    expect(catalog['stat']).toBeDefined();
    expect(catalog['avatar']).toBeDefined();
    expect(catalog['tooltip']).toBeDefined();
    expect(catalog['checkbox']).toBeDefined();
    expect(catalog['select']).toBeDefined();
    expect(catalog['input-currency']).toBeDefined();
    expect(catalog['button-secondary']).toBeDefined();
    expect(catalog['button-ghost']).toBeDefined();
  });

  it('converts PascalCase component names to kebab-case keys', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Card: {
          description: 'A card',
          category: 'layout',
          anatomy: [],
          states: {
            default: { bg: 'white', text: 'black' },
          },
          spacing: { padding: '16px', internal_gap: '8px' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
        NavigationBar: {
          description: 'A nav bar',
          category: 'navigation',
          anatomy: [],
          states: {
            default: { bg: 'blue', text: 'white' },
          },
          spacing: { padding: '8px', internal_gap: '4px' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    expect(catalog['card']).toBeDefined();
    expect(catalog['navigation-bar']).toBeDefined();
    expect(catalog['card'].type).toBe('card');
    expect(catalog['navigation-bar'].type).toBe('navigation-bar');
  });

  it('project entries override built-in defaults', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Card: {
          description: 'Custom card',
          category: 'layout',
          anatomy: [],
          states: {
            default: { bg: 'custom-bg', text: 'custom-text', border: 'custom-border', border_width: 3, shadow: 'xl' },
          },
          spacing: { padding: '32px', internal_gap: '16px' },
          library_mapping: {},
          accessibility: { focus_visible: true, aria_labels: ['card'] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    expect(catalog['card'].background).toBe('custom-bg');
    expect(catalog['card'].text_color).toBe('custom-text');
    expect(catalog['card'].border_color).toBe('custom-border');
    expect(catalog['card'].border_width).toBe(3);
    expect(catalog['card'].shadow).toBe('xl');
    expect(catalog['card'].radius).toBeUndefined();
  });

  it('transforms states.default.bg to background and text to text_color', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        MyWidget: {
          description: 'test',
          category: 'ui',
          anatomy: [],
          states: {
            default: { bg: 'surface-primary', text: 'text-primary' },
          },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    const entry = catalog['my-widget'];
    expect(entry.background).toBe('surface-primary');
    expect(entry.text_color).toBe('text-primary');
  });

  it('transforms token_bindings.font to text_typography', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Input: {
          description: 'test',
          category: 'form',
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          token_bindings: { font: 'body', 'border-radius': 8, 'padding-x': 12, 'padding-y': 6 },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    const entry = catalog['input'];
    expect(entry.text_typography).toBe('body');
    expect(entry.radius).toBe(8);
    expect(entry.padding_x).toBe(12);
    expect(entry.padding_y).toBe(6);
  });

  it('transforms library_mapping to library', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Button: {
          description: 'test',
          category: 'form',
          anatomy: [],
          states: { default: { bg: 'blue', text: 'white' } },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {
            shadcn: {
              component_name: 'Button',
              import_path: '@/components/ui/button',
              variant_prop: 'variant',
              size_prop: 'size',
            },
            mui: {
              component_name: 'MuiButton',
              import_path: '@mui/material/Button',
              slot_mapping: { icon: 'startIcon' },
            },
          },
          accessibility: { focus_visible: true, aria_labels: ['button'] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    const lib = catalog['button'].library as Record<string, Record<string, unknown>>;
    expect(lib.shadcn.component).toBe('Button');
    expect(lib.shadcn.import).toBe('@/components/ui/button');
    expect(lib.shadcn.variant_prop).toBe('variant');
    expect(lib.shadcn.size_prop).toBe('size');
    expect(lib.mui.component).toBe('MuiButton');
    expect(lib.mui.import).toBe('@mui/material/Button');
    expect(lib.mui.slot_mapping).toEqual({ icon: 'startIcon' });
  });

  it('transforms spacing.internal_gap to gap', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        List: {
          description: 'test',
          category: 'layout',
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          spacing: { padding: '16px', internal_gap: '12px' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    expect((catalog['list'] as Record<string, unknown>).gap).toBe(12);
  });

  it('transforms min_height', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        Touchable: {
          description: 'test',
          category: 'ui',
          min_height: 44,
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    expect(catalog['touchable'].min_height).toBe(44);
  });

  it('resolves border-radius string token to numeric value', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        MyWidget: {
          description: 'test',
          category: 'ui',
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          token_bindings: { 'border-radius': 'medium' },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const tokens = {
      colors: { primitive: {}, semantic: {} },
      typography: { font_families: {}, scale: [] },
      elevation: { levels: [] },
      borders: { radius: { small: 4, medium: 12, large: 24 } },
      spacing: { unit: 4, scale: [] },
    } as const;

    const catalog = loadCatalogForRenderer(raw, tokens);
    expect(catalog['my-widget'].radius).toBe(12);
  });

  it('passes through numeric border-radius as-is', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        MyWidget: {
          description: 'test',
          category: 'ui',
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          token_bindings: { 'border-radius': 8 },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const catalog = loadCatalogForRenderer(raw);
    expect(catalog['my-widget'].radius).toBe(8);
  });

  it('keeps unresolvable string border-radius as-is', () => {
    const raw: RawCatalogSpec = {
      version: '1.0',
      created_by: 'test',
      components: {
        MyWidget: {
          description: 'test',
          category: 'ui',
          anatomy: [],
          states: { default: { bg: 'white', text: 'black' } },
          token_bindings: { 'border-radius': 'unknown' },
          spacing: { padding: '0', internal_gap: '0' },
          library_mapping: {},
          accessibility: { focus_visible: false, aria_labels: [] },
        },
      },
    };

    const tokens = {
      colors: { primitive: {}, semantic: {} },
      typography: { font_families: {}, scale: [] },
      elevation: { levels: [] },
      borders: { radius: { small: 4, medium: 12 } },
      spacing: { unit: 4, scale: [] },
    } as const;

    const catalog = loadCatalogForRenderer(raw, tokens);
    expect(catalog['my-widget'].radius).toBe('unknown');
  });
});
