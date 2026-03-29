import {
  parseLLMResponse,
  optionToTokens,
  optionToBrand,
  generatePreviewHtml,
  resolveDesignOptionsContext,
  SHARED_LAYOUT,
  DEFAULT_LAYOUT_TOKENS,
  DEFAULT_OPACITY,
  DEFAULT_MOTION,
  DEFAULT_STATE,
  DEFAULT_TYPOGRAPHY_SCALE,
  DEFAULT_PREVIEW,
  backfillSemanticColors,
  backfillElevation,
} from './generate-design-options.js';
import type { DesignOption } from './generate-design-options.js';
import type { FileSystem } from '@agentforge/core';
import { validateDesignTokens, validateBrandSpec } from '@agentforge/core';
import { buildDesignTokensSpec } from './init.js';
import { Writable } from 'node:stream';

/** Null output stream that discards all writes. */
const nullOutput = new Writable({ write(_chunk, _enc, cb) { cb(); } });

function createMockFs(files: Record<string, string>): FileSystem {
  return {
    readFile(filePath: string) {
      const value = files[filePath];
      if (value === undefined) {
        return { ok: false, error: { code: 'INVALID_STATE' as const, message: `Missing file: ${filePath}`, recoverable: true } };
      }
      return { ok: true, value };
    },
    writeFile() {
      return { ok: true, value: undefined };
    },
    writeFileAtomic() {
      return { ok: true, value: undefined };
    },
    exists(filePath: string) {
      return Object.prototype.hasOwnProperty.call(files, filePath);
    },
    mkdir() {
      return { ok: true, value: undefined };
    },
    rename() {
      return { ok: true, value: undefined };
    },
    remove() {
      return { ok: true, value: undefined };
    },
    listDir() {
      return { ok: true, value: [] as readonly string[] };
    },
    appendFile() {
      return { ok: true, value: undefined };
    },
  };
}

const VALID_OPTION: DesignOption = {
  label: 'Ocean Calm',
  vibe: 'Serene blues and warm sand tones',
  colors: {
    primitive: {
      'ocean-blue': '#1E40AF',
      'warm-sand': '#F5F0EB',
      'deep-navy': '#0F172A',
      'soft-gray': '#E2E8F0',
      'coral-pop': '#FB923C',
    },
    semantic: {
      'background-primary': 'warm-sand',
      'surface-primary': 'warm-sand',
      'surface-elevated': 'soft-gray',
      'text-primary': 'deep-navy',
      'text-secondary': 'soft-gray',
      'text-disabled': 'soft-gray',
      'text-on-cta': 'warm-sand',
      'cta-primary': 'ocean-blue',
      'cta-hover': 'ocean-blue',
      'border-default': 'soft-gray',
      'border-focus': 'ocean-blue',
      'border-error': '#DC2626',
      error: '#DC2626',
      success: '#16A34A',
      warning: '#CA8A04',
      info: 'ocean-blue',
      overlay: 'rgba(0,0,0,0.5)',
    },
  },
  fonts: { display: 'Playfair Display', body: 'Source Sans Pro' },
  brand: {
    tone: 'calm-professional',
    illustrationDirection: 'watercolor',
    illustrationDescription: 'Soft watercolor illustrations',
    motionFeel: 'smooth',
  },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
    ],
  },
};

describe('resolveDesignOptionsContext', () => {
  const baseContext = {
    appName: 'Demo',
    description: 'Description',
    targetAudience: 'general',
  };

  it('keeps provided prdContent as-is', () => {
    const result = resolveDesignOptionsContext(
      { ...baseContext, prdContent: '# Provided PRD' },
      {
        rootDir: '/project',
        fileSystem: createMockFs({ '/project/docs/prd.md': '# File PRD' }),
      },
    );

    expect(result.prdContent).toBe('# Provided PRD');
  });

  it('loads PRD from docs/prd.md when not provided', () => {
    const result = resolveDesignOptionsContext(baseContext, {
      rootDir: '/project',
      fileSystem: createMockFs({ '/project/docs/prd.md': '# Loaded PRD' }),
    });

    expect(result.prdContent).toBe('# Loaded PRD');
  });

  it('returns original context when docs/prd.md is missing', () => {
    const result = resolveDesignOptionsContext(baseContext, {
      rootDir: '/project',
      fileSystem: createMockFs({}),
    });

    expect(result).toEqual(baseContext);
    expect(result.prdContent).toBeUndefined();
  });
});

describe('parseLLMResponse', () => {
  it('parses valid JSON with 3 options', () => {
    const json = JSON.stringify({ options: [VALID_OPTION, VALID_OPTION, VALID_OPTION] });
    const result = parseLLMResponse(json);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe('Ocean Calm');
  });

  it('strips markdown code fences', () => {
    const json = '```json\n' + JSON.stringify({ options: [VALID_OPTION] }) + '\n```';
    const result = parseLLMResponse(json);
    expect(result).toHaveLength(1);
  });

  it('filters out invalid options (missing colors)', () => {
    const invalid = { ...VALID_OPTION, colors: { primitive: {}, semantic: {} } };
    const json = JSON.stringify({ options: [VALID_OPTION, invalid] });
    const result = parseLLMResponse(json);
    expect(result).toHaveLength(1);
  });

  it('filters out options missing fonts', () => {
    const invalid = { ...VALID_OPTION, fonts: { display: '', body: '' } };
    const json = JSON.stringify({ options: [VALID_OPTION, invalid] });
    const result = parseLLMResponse(json);
    expect(result).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseLLMResponse('not json')).toThrow();
  });

  it('throws when options array is missing', () => {
    expect(() => parseLLMResponse('{}')).toThrow('Response missing "options" array');
  });
});

describe('optionToTokens', () => {
  it('produces valid DesignTokensSpec', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);

    expect(tokens.version).toBe('1.0');
    expect(tokens.created_by).toBe('agentforge-init-llm');
    expect(tokens.colors.primitive['ocean-blue']).toBe('#1E40AF');
    expect(tokens.typography.font_families.display).toBe('Playfair Display');
    expect(tokens.typography.font_families.body).toBe('Source Sans Pro');
    expect(tokens.typography.scale).toHaveLength(6);
    expect(tokens.spacing).toEqual(SHARED_LAYOUT.spacing);
    expect(tokens.borders).toEqual(SHARED_LAYOUT.borders);
    expect(tokens.touch_targets).toEqual(SHARED_LAYOUT.touch_targets);
  });

  it('passes validation', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    const result = validateDesignTokens(tokens);
    expect(result.ok).toBe(true);
  });

  it('includes elevation from option', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    expect(tokens.elevation.levels).toHaveLength(4);
    expect(tokens.elevation.levels[0].shadow).toBe('none');
  });

  it('includes layout from SHARED_LAYOUT', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    expect(tokens.layout).toEqual(SHARED_LAYOUT.layout);
  });

  it('includes z_index from SHARED_LAYOUT', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    expect(tokens.z_index).toEqual(SHARED_LAYOUT.z_index);
  });
});

describe('optionToBrand', () => {
  it('produces valid BrandSpec', () => {
    const brand = optionToBrand(VALID_OPTION, 'developers', nullOutput);

    expect(brand.version).toBe('1.0');
    expect(brand.identity.tone).toBe('calm-professional');
    expect(brand.identity.audience).toBe('developers');
    expect(brand.illustration_style.direction).toBe('watercolor');
    expect(brand.motion_principles.interaction_feel).toBe('smooth');
    expect(brand.accessibility.wcag_level).toBe('AA');
  });

  it('passes validation', () => {
    const brand = optionToBrand(VALID_OPTION, 'developers', nullOutput);
    const result = validateBrandSpec(brand);
    expect(result.ok).toBe(true);
  });

  it('defaults audience to general when empty', () => {
    const brand = optionToBrand(VALID_OPTION, '', nullOutput);
    expect(brand.identity.audience).toBe('general');
  });
});

describe('generatePreviewHtml', () => {
  const options: DesignOption[] = [VALID_OPTION, VALID_OPTION, VALID_OPTION];

  it('produces a complete HTML document', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('TestApp');
    expect(html).toContain('</html>');
  });

  it('includes Google Fonts link', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('Playfair+Display');
    expect(html).toContain('Source+Sans+Pro');
  });

  it('includes tab buttons for each option', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('data-tab="1"');
    expect(html).toContain('data-tab="2"');
    expect(html).toContain('data-tab="3"');
  });

  it('includes color swatches', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('#1E40AF');
    expect(html).toContain('ocean-blue');
  });

  it('includes typography ladder from default scale', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Heading 1');
    expect(html).toContain(`${DEFAULT_TYPOGRAPHY_SCALE[0].size}px / ${DEFAULT_TYPOGRAPHY_SCALE[0].weight}`);
  });

  it('renders custom typography_scale when provided', () => {
    const customScale = [
      { role: 'heading-1', size: 48, weight: 800, family: 'display' as const, line_height: 1.1 },
      { role: 'body', size: 18, weight: 400, family: 'body' as const, line_height: 1.6 },
    ];
    const customOptions: DesignOption[] = [{ ...VALID_OPTION, typography_scale: customScale }];
    const html = generatePreviewHtml('TestApp', customOptions);
    expect(html).toContain('48px / 800');
    expect(html).toContain('18px / 400');
    expect(html).not.toContain('32px / 700');
  });

  it('includes component kitchen sink with semantic tokens', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
    expect(html).toContain('Disabled');
    expect(html).toContain('Focus');
    // Uses semantic CSS vars instead of hardcoded hex
    expect(html).toContain('var(--border-default)');
    expect(html).toContain('var(--surface-elevated)');
    expect(html).toContain('var(--opacity-disabled)');
  });

  it('includes dashboard demo with default preview data', () => {
    const html = generatePreviewHtml('TestApp', options);
    // Verify default preview content is rendered
    expect(html).toContain(DEFAULT_PREVIEW.metrics[0].label);
    expect(html).toContain(DEFAULT_PREVIEW.metrics[0].value);
    expect(html).toContain(DEFAULT_PREVIEW.table_rows![0].name);
  });

  it('uses custom preview data when provided', () => {
    const customPreview = {
      metrics: [
        { label: 'Popular Recipes', value: '1,234', trend: '+5%' },
        { label: 'Meals Planned', value: '567' },
        { label: 'Ingredients Saved', value: '89', trend: '-3%' },
      ],
      table_rows: [
        { name: 'Pasta Carbonara', status: 'Active', amount: '4.8★', date: 'Mar 20' },
      ],
      nav_items: ['Recipes', 'Favorites', 'Shopping List'],
    };
    const customOptions: DesignOption[] = [{ ...VALID_OPTION, preview: customPreview }];
    const html = generatePreviewHtml('TestApp', customOptions);
    expect(html).toContain('Popular Recipes');
    expect(html).toContain('1,234');
    expect(html).toContain('Pasta Carbonara');
    expect(html).toContain('Recipes');
    expect(html).not.toContain('Total Users');
  });

  it('includes border radius showcase', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Border Radius');
    expect(html).toContain(`sm: ${DEFAULT_LAYOUT_TOKENS.borders.radius.small}px`);
    expect(html).toContain(`lg: ${DEFAULT_LAYOUT_TOKENS.borders.radius.large}px`);
    expect(html).toContain('pill');
  });

  it('includes motion timing section', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Motion');
    expect(html).toContain(`fast (${DEFAULT_MOTION.durations.fast}ms)`);
    expect(html).toContain(`normal (${DEFAULT_MOTION.durations.normal}ms)`);
    expect(html).toContain(`slow (${DEFAULT_MOTION.durations.slow}ms)`);
    expect(html).toContain(DEFAULT_MOTION.easings.default);
  });

  it('includes opacity scale section', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Opacity Scale');
    expect(html).toContain('subtle');
    expect(html).toContain('muted');
    expect(html).toContain('disabled');
    expect(html).toContain('overlay');
  });

  it('uses semantic CSS variables for dashboard colors', () => {
    const html = generatePreviewHtml('TestApp', options);
    // No hardcoded hex for borders/surfaces in dashboard
    expect(html).toContain('var(--surface-elevated)');
    expect(html).toContain('var(--border-default)');
    expect(html).toContain('var(--text-secondary)');
    expect(html).toContain('var(--success)');
    // CSS variables block includes new tokens
    expect(html).toContain('--border-sm:');
    expect(html).toContain('--duration-fast:');
    expect(html).toContain('--opacity-disabled:');
  });

  it('includes compare strip', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('compare-strip');
    expect(html).toContain('compare-dots');
  });

  it('includes footer with instructions', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Return to your terminal');
  });

  it('includes switchTab JavaScript', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('function switchTab');
  });
});

describe('SHARED_LAYOUT', () => {
  it('has the expected spacing scale', () => {
    expect(SHARED_LAYOUT.spacing.unit).toBe(8);
    expect(SHARED_LAYOUT.spacing.scale).toEqual([4, 8, 12, 16, 24, 32, 48, 64]);
  });

  it('has the expected border radius', () => {
    expect(SHARED_LAYOUT.borders.radius.small).toBe(8);
    expect(SHARED_LAYOUT.borders.radius.pill).toBe(9999);
  });

  it('has the expected touch targets', () => {
    expect(SHARED_LAYOUT.touch_targets.minimum_height).toBe(44);
    expect(SHARED_LAYOUT.touch_targets.minimum_width).toBe(44);
  });

  it('has the expected layout', () => {
    expect(SHARED_LAYOUT.layout.grid.columns).toBe(12);
    expect(SHARED_LAYOUT.layout.content_max_width).toBe(1280);
    expect(SHARED_LAYOUT.layout.breakpoints.mobile).toBe(640);
  });

  it('has the expected z_index', () => {
    expect(SHARED_LAYOUT.z_index.dropdown).toBe(1000);
    expect(SHARED_LAYOUT.z_index.modal).toBe(1200);
    expect(SHARED_LAYOUT.z_index.tooltip).toBe(1400);
  });
});

describe('backfillSemanticColors', () => {
  it('fills missing keys with heuristic derivations', () => {
    const minimal: DesignOption = {
      ...VALID_OPTION,
      colors: {
        ...VALID_OPTION.colors,
        semantic: {
          'background-primary': 'warm-sand',
          'text-primary': 'deep-navy',
          'cta-primary': 'ocean-blue',
          error: '#DC2626',
        } as DesignOption['colors']['semantic'],
      },
    };
    const [result] = backfillSemanticColors([minimal], nullOutput);
    expect(result.colors.semantic['surface-primary']).toBe('warm-sand');
    expect(result.colors.semantic['text-on-cta']).toBe('warm-sand');
    expect(result.colors.semantic['border-focus']).toBe('ocean-blue');
    expect(result.colors.semantic['overlay']).toBe('rgba(0,0,0,0.5)');
  });

  it('preserves keys that already exist', () => {
    const [result] = backfillSemanticColors([VALID_OPTION], nullOutput);
    expect(result.colors.semantic['background-primary']).toBe('warm-sand');
    expect(result.colors.semantic['text-primary']).toBe('deep-navy');
    expect(result.colors.semantic['cta-primary']).toBe('ocean-blue');
  });

  it('resolves chain dependencies correctly', () => {
    const minimal: DesignOption = {
      ...VALID_OPTION,
      colors: {
        ...VALID_OPTION.colors,
        semantic: {
          'background-primary': 'warm-sand',
          'text-primary': 'deep-navy',
          'cta-primary': 'ocean-blue',
          error: '#DC2626',
        } as DesignOption['colors']['semantic'],
      },
    };
    const [result] = backfillSemanticColors([minimal], nullOutput);
    // text-secondary derives from text-primary
    expect(result.colors.semantic['text-secondary']).toBe('deep-navy');
    // border-default derives from text-secondary (which was just filled)
    expect(result.colors.semantic['border-default']).toBe('deep-navy');
  });
});

describe('backfillElevation', () => {
  it('injects defaults when elevation is missing', () => {
    const noElevation: DesignOption = {
      ...VALID_OPTION,
      elevation: undefined,
    };
    const [result] = backfillElevation([noElevation], nullOutput);
    expect(result.elevation).toBeDefined();
    expect(result.elevation!.levels).toHaveLength(4);
    expect(result.elevation!.levels[0].shadow).toBe('none');
  });

  it('keeps existing elevation when present and sufficient', () => {
    const [result] = backfillElevation([VALID_OPTION], nullOutput);
    expect(result.elevation).toBe(VALID_OPTION.elevation);
  });
});

describe('init archetypes produce valid tokens without components', () => {
  it.each(['warm', 'professional', 'bold'] as const)('%s archetype has no components field', (archetype) => {
    const tokens = buildDesignTokensSpec(archetype);

    expect((tokens as unknown as Record<string, unknown>).components).toBeUndefined();
    const result = validateDesignTokens(tokens);
    expect(result.ok).toBe(true);
  });

  it.each(['warm', 'professional', 'bold'] as const)('%s archetype includes new token categories', (archetype) => {
    const tokens = buildDesignTokensSpec(archetype);

    expect(tokens.opacity).toEqual(DEFAULT_OPACITY);
    expect(tokens.motion).toEqual(DEFAULT_MOTION);
    expect(tokens.state).toEqual(DEFAULT_STATE);
  });
});

describe('DEFAULT_LAYOUT_TOKENS alias', () => {
  it('SHARED_LAYOUT is an alias for DEFAULT_LAYOUT_TOKENS', () => {
    expect(SHARED_LAYOUT).toBe(DEFAULT_LAYOUT_TOKENS);
  });
});

describe('optionToTokens with overrides', () => {
  it('uses custom typography_scale when provided', () => {
    const customScale = [
      { role: 'heading-1', size: 48, weight: 800, family: 'display', line_height: 1.1 },
      { role: 'body', size: 18, weight: 400, family: 'body', line_height: 1.6 },
    ];
    const option: DesignOption = { ...VALID_OPTION, typography_scale: customScale };
    const tokens = optionToTokens(option, nullOutput);
    expect(tokens.typography.scale).toEqual(customScale);
  });

  it('uses custom borders when provided', () => {
    const customBorders = { radius: { small: 0, medium: 4, large: 8, pill: 9999 } };
    const option: DesignOption = { ...VALID_OPTION, borders: customBorders };
    const tokens = optionToTokens(option, nullOutput);
    expect(tokens.borders).toEqual(customBorders);
  });

  it('uses custom motion when provided', () => {
    const customMotion = {
      durations: { fast: 80, normal: 150, slow: 300 },
      easings: { default: 'ease-in-out', emphasized: 'cubic-bezier(0.34,1.56,0.64,1)' },
    };
    const option: DesignOption = { ...VALID_OPTION, motion: customMotion };
    const tokens = optionToTokens(option, nullOutput);
    expect(tokens.motion).toEqual(customMotion);
  });

  it('falls back to defaults when override fields omitted', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    expect(tokens.opacity).toEqual(DEFAULT_OPACITY);
    expect(tokens.motion).toEqual(DEFAULT_MOTION);
    expect(tokens.state).toEqual(DEFAULT_STATE);
    expect(tokens.typography.scale).toEqual([...DEFAULT_TYPOGRAPHY_SCALE]);
  });

  it('includes new token categories and still passes validation', () => {
    const tokens = optionToTokens(VALID_OPTION, nullOutput);
    expect(tokens.opacity).toBeDefined();
    expect(tokens.motion).toBeDefined();
    expect(tokens.state).toBeDefined();
    const result = validateDesignTokens(tokens);
    expect(result.ok).toBe(true);
  });
});
