import {
  loadDesignTokens,
  loadBrandSpec,
  saveDesignTokens,
  toDesignTokens,
  validateDesignTokens,
  validateBrandSpec,
  loadComponentCatalog,
  saveComponentCatalog,
  validateComponentCatalog,
} from './design-system-reader.js';
import type { DesignTokensSpec, BrandSpec, ComponentCatalogSpec } from '../types/design-system.js';
import type { FileSystem } from '../fs/file-system.js';
import { stringify as yamlStringify } from 'yaml';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true as const, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir() {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
}

const VALID_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: {
      white: '#FFFFFF',
      slate: '#334155',
      blue: '#2563EB',
    },
    semantic: {
      'background-primary': 'white',
      'text-primary': 'slate',
      'cta-primary': 'blue',
      error: '#DC2626',
    },
  },
  typography: {
    font_families: { display: 'DM Sans', body: 'Inter' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
    ],
  },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
};

const VALID_BRAND: BrandSpec = {
  version: '1.0',
  created_by: 'test',
  identity: { tone: 'professional', audience: 'developers' },
  illustration_style: { direction: 'minimal', description: 'Clean lines' },
  motion_principles: {
    page_transitions: 'fade',
    interaction_feel: 'snappy',
    easing: 'ease-out',
    duration_base_ms: 200,
  },
  accessibility: { wcag_level: 'AA' },
};

const VALID_CATALOG: ComponentCatalogSpec = {
  version: '1.0',
  created_by: 'test',
  components: {
    Card: {
      description: 'Content container',
      category: 'layout',
      anatomy: [
        { name: 'header', contents: 'title (heading-3)', optional: true },
        { name: 'body', contents: 'Primary content area' },
      ],
      states: {
        default: { bg: 'surface-primary', text: 'text-primary', border: 'border-default' },
        hover: { bg: 'surface-primary', text: 'text-primary', shadow: 'shadow-md' },
      },
      spacing: { padding: '16 20', internal_gap: '12' },
      library_mapping: {
        shadcn: {
          component_name: 'Card',
          import_path: '@/components/ui/card',
          slot_mapping: { header: 'CardHeader', body: 'CardContent' },
        },
      },
      accessibility: { focus_visible: true, aria_labels: ['role=article'] },
    },
  },
};

describe('loadDesignTokens', () => {
  it('reads valid design-tokens.yaml', () => {
    const fs = createMockFs();
    const yaml = require('yaml');
    fs.files.set('/project/agentforge/spec/design-tokens.yaml', yaml.stringify(VALID_TOKENS));

    const result = loadDesignTokens('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('1.0');
      expect(result.value.colors.primitive.white).toBe('#FFFFFF');
      expect(result.value.typography.font_families.display).toBe('DM Sans');
    }
  });

  it('returns Err when file missing', () => {
    const fs = createMockFs();

    const result = loadDesignTokens('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Design tokens not found');
      expect(result.error.message).toContain('agentforge init');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

describe('saveDesignTokens / round-trip', () => {
  it('round-trips correctly', () => {
    const fs = createMockFs();

    const saveResult = saveDesignTokens('/project', VALID_TOKENS, fs);
    expect(saveResult.ok).toBe(true);

    const loadResult = loadDesignTokens('/project', fs);
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.version).toBe(VALID_TOKENS.version);
      expect(loadResult.value.colors.primitive.white).toBe(VALID_TOKENS.colors.primitive.white);
      expect(loadResult.value.typography.scale).toHaveLength(VALID_TOKENS.typography.scale.length);
    }
  });
});

describe('loadBrandSpec', () => {
  it('reads valid brand.yaml', () => {
    const fs = createMockFs();
    const yaml = require('yaml');
    fs.files.set('/project/agentforge/spec/brand.yaml', yaml.stringify(VALID_BRAND));

    const result = loadBrandSpec('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.identity.tone).toBe('professional');
      expect(result.value.accessibility.wcag_level).toBe('AA');
    }
  });

  it('returns Err when file missing', () => {
    const fs = createMockFs();

    const result = loadBrandSpec('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Brand spec not found');
      expect(result.error.message).toContain('agentforge init');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

describe('toDesignTokens', () => {
  it('maps spec to DesignTokens type', () => {
    const flat = toDesignTokens(VALID_TOKENS);

    expect(Object.keys(flat.colors).length).toBeGreaterThan(0);
    expect(flat.colors.white).toBe('#FFFFFF');
    expect(Object.keys(flat.typography).length).toBeGreaterThan(0);
    expect(Object.keys(flat.spacing).length).toBeGreaterThan(0);
    expect(flat.spacing['8']).toBe('8px');
  });

  it('flattens elevation levels', () => {
    const flat = toDesignTokens(VALID_TOKENS);
    expect(flat.elevation['0']).toBe('none');
    expect(flat.elevation['1']).toBe('0 1px 3px rgba(0,0,0,0.08)');
  });

  it('flattens layout', () => {
    const flat = toDesignTokens(VALID_TOKENS);
    expect(flat.layout.columns).toBe(12);
    expect(flat.layout.gutter).toBe('24px');
    expect(flat.layout.content_max_width).toBe('1280px');
    expect(flat.layout.breakpoints).toEqual({ mobile: 640, tablet: 768, desktop: 1024, wide: 1440 });
  });

  it('flattens z_index', () => {
    const flat = toDesignTokens(VALID_TOKENS);
    expect(flat.z_index.dropdown).toBe(1000);
    expect(flat.z_index.modal).toBe(1200);
  });
});

describe('validateDesignTokens', () => {
  it('passes for valid spec', () => {
    const result = validateDesignTokens(VALID_TOKENS);
    expect(result.ok).toBe(true);
  });

  it('catches semantic color referencing nonexistent primitive', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      colors: {
        primitive: { white: '#FFFFFF' },
        semantic: { 'bg-primary': 'midnight' },
      },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('midnight');
    }
  });

  it('catches typography referencing nonexistent font family', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      typography: {
        font_families: { body: 'Inter' },
        scale: [{ role: 'heading', size: 32, weight: 700, family: 'display' }],
      },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('display');
    }
  });

  it('catches unsorted spacing scale', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      spacing: { unit: 8, scale: [8, 4, 16] },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not sorted');
    }
  });

  it('validates component token color references', () => {
    const withComponents: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'slate' },
        },
      },
    };

    const result = validateDesignTokens(withComponents);
    expect(result.ok).toBe(true);
  });

  it('catches component token referencing nonexistent color', () => {
    const withBadComponents: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          primary: { bg: 'nonexistent-color', text: 'background-primary' },
        },
      },
    };

    const result = validateDesignTokens(withBadComponents);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('nonexistent-color');
      expect(result.error.message).toContain('button.primary.bg');
    }
  });

  it('catches component token referencing nonexistent border radius', () => {
    const withBadRadius: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        card: {
          default: { bg: 'background-primary', radius: 'extra-large' },
        },
      },
    };

    const result = validateDesignTokens(withBadRadius);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('extra-large');
      expect(result.error.message).toContain('card.default.radius');
    }
  });

  it('allows transparent and special values in component tokens', () => {
    const withSpecialValues: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'small' },
        },
        card: {
          default: { bg: 'background-primary', border_style: 'solid', radius: 'medium' },
        },
      },
    };

    const result = validateDesignTokens(withSpecialValues);
    expect(result.ok).toBe(true);
  });

  it('passes validation when components is undefined (backward compat)', () => {
    const result = validateDesignTokens(VALID_TOKENS);
    expect(result.ok).toBe(true);
  });

  it('catches non-sequential elevation levels', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      elevation: {
        levels: [
          { level: 0, shadow: 'none', description: 'Flat' },
          { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Skipped 1' },
        ],
      },
    };
    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('level 2');
      expect(result.error.message).toContain('expected 1');
    }
  });

  it('catches negative z_index', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      z_index: { ...VALID_TOKENS.z_index, dropdown: -1 },
    };
    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('negative');
    }
  });

  it('catches non-ascending layout breakpoints', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      layout: {
        ...VALID_TOKENS.layout,
        breakpoints: { mobile: 768, tablet: 640, desktop: 1024, wide: 1440 },
      },
    };
    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('strictly ascending');
    }
  });
});

describe('validateBrandSpec', () => {
  it('passes for valid spec', () => {
    const result = validateBrandSpec(VALID_BRAND);
    expect(result.ok).toBe(true);
  });
});

describe('loadComponentCatalog', () => {
  it('returns Ok for valid YAML', () => {
    const fs = createMockFs();
    fs.files.set('/project/agentforge/spec/component-catalog.yaml', yamlStringify(VALID_CATALOG));
    const result = loadComponentCatalog('/project', fs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('1.0');
      expect(result.value.components.Card.category).toBe('layout');
    }
  });

  it('returns recoverable Err when file missing', () => {
    const fs = createMockFs();
    const result = loadComponentCatalog('/project', fs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.recoverable).toBe(true);
      expect(result.error.message).toContain('Component catalog not found');
    }
  });
});

describe('saveComponentCatalog', () => {
  it('writes to correct path', () => {
    const fs = createMockFs();
    const result = saveComponentCatalog('/project', VALID_CATALOG, fs);
    expect(result.ok).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/component-catalog.yaml')).toBe(true);
  });
});

describe('validateComponentCatalog', () => {
  it('passes for valid catalog', () => {
    const result = validateComponentCatalog(VALID_CATALOG);
    expect(result.ok).toBe(true);
  });

  it('catches missing default state', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadComponent: {
          ...VALID_CATALOG.components.Card,
          states: { hover: { bg: 'surface-primary', text: 'text-primary' } },
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('missing required "default" state');
    }
  });

  it('catches invalid category', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadComponent: {
          ...VALID_CATALOG.components.Card,
          category: 'invalid_category',
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid category');
    }
  });

  it('catches empty anatomy', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadComponent: {
          ...VALID_CATALOG.components.Card,
          anatomy: [],
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('empty anatomy');
    }
  });

  it('passes with all new optional fields present', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        Button: {
          description: 'Interactive button',
          category: 'input',
          min_height: 44,
          anatomy: [{ name: 'label', contents: 'button text' }],
          variants: {
            secondary: { bg: 'surface-primary', text: 'text-primary' },
            ghost: { bg: 'transparent', text: 'cta-primary' },
          },
          states: {
            default: { bg: 'cta-primary', text: 'text-on-primary' },
            hover: { bg: 'cta-primary', text: 'text-on-primary' },
          },
          token_bindings: {
            background: 'cta-primary',
            text: 'text-on-primary',
            'border-radius': 'medium',
            'padding-x': 16,
            'padding-y': 8,
            font: 'label',
          },
          spacing: { padding: '8 16', internal_gap: '8' },
          library_mapping: {
            shadcn: {
              component_name: 'Button',
              import_path: '@/components/ui/button',
              variant_prop: 'variant',
              size_prop: 'size',
            },
          },
          accessibility: { focus_visible: true, aria_labels: ['aria-label when icon-only'] },
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(true);
  });

  it('catches invalid min_height (zero)', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadButton: {
          ...VALID_CATALOG.components.Card,
          min_height: 0,
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid min_height');
    }
  });

  it('catches negative min_height', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadButton: {
          ...VALID_CATALOG.components.Card,
          min_height: -10,
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid min_height');
    }
  });

  it('catches dot-notation in token_bindings', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadButton: {
          ...VALID_CATALOG.components.Card,
          token_bindings: {
            background: 'colors.semantic.cta-primary',
            text: 'text-on-primary',
          },
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('dot-notation');
      expect(result.error.message).toContain('colors.semantic.cta-primary');
    }
  });

  it('catches empty variant_prop string', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadButton: {
          ...VALID_CATALOG.components.Card,
          library_mapping: {
            shadcn: {
              component_name: 'Button',
              import_path: '@/components/ui/button',
              variant_prop: '',
            },
          },
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('variant_prop must be a non-empty string');
    }
  });

  it('catches empty size_prop string', () => {
    const catalog: ComponentCatalogSpec = {
      ...VALID_CATALOG,
      components: {
        BadButton: {
          ...VALID_CATALOG.components.Card,
          library_mapping: {
            shadcn: {
              component_name: 'Button',
              import_path: '@/components/ui/button',
              size_prop: '  ',
            },
          },
        },
      },
    };
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('size_prop must be a non-empty string');
    }
  });

  it('backward compat: existing catalog without new fields still passes', () => {
    const result = validateComponentCatalog(VALID_CATALOG);
    expect(result.ok).toBe(true);
  });
});
