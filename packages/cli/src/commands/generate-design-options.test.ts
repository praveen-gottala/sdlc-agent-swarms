import {
  parseLLMResponse,
  optionToTokens,
  optionToBrand,
  generatePreviewHtml,
  SHARED_LAYOUT,
} from './generate-design-options.js';
import type { DesignOption } from './generate-design-options.js';
import { validateDesignTokens, validateBrandSpec } from '@agentforge/core';
import { buildDesignTokensSpec } from './init.js';

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
      'text-primary': 'deep-navy',
      'cta-primary': 'ocean-blue',
      error: '#DC2626',
    },
  },
  fonts: { display: 'Playfair Display', body: 'Source Sans Pro' },
  brand: {
    tone: 'calm-professional',
    illustrationDirection: 'watercolor',
    illustrationDescription: 'Soft watercolor illustrations',
    motionFeel: 'smooth',
  },
};

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
    const tokens = optionToTokens(VALID_OPTION);

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
    const tokens = optionToTokens(VALID_OPTION);
    const result = validateDesignTokens(tokens);
    expect(result.ok).toBe(true);
  });
});

describe('optionToBrand', () => {
  it('produces valid BrandSpec', () => {
    const brand = optionToBrand(VALID_OPTION, 'developers');

    expect(brand.version).toBe('1.0');
    expect(brand.identity.tone).toBe('calm-professional');
    expect(brand.identity.audience).toBe('developers');
    expect(brand.illustration_style.direction).toBe('watercolor');
    expect(brand.motion_principles.interaction_feel).toBe('smooth');
    expect(brand.accessibility.wcag_level).toBe('AA');
  });

  it('passes validation', () => {
    const brand = optionToBrand(VALID_OPTION, 'developers');
    const result = validateBrandSpec(brand);
    expect(result.ok).toBe(true);
  });

  it('defaults audience to general when empty', () => {
    const brand = optionToBrand(VALID_OPTION, '');
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

  it('includes typography ladder', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Heading 1');
    expect(html).toContain('32px / 700');
  });

  it('includes component kitchen sink', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
    expect(html).toContain('Disabled');
  });

  it('includes dashboard demo', () => {
    const html = generatePreviewHtml('TestApp', options);
    expect(html).toContain('Total Users');
    expect(html).toContain('12,847');
    expect(html).toContain('Sarah Johnson');
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
});

describe('optionToTokens with components', () => {
  it('passes through components from DesignOption', () => {
    const optionWithComponents: DesignOption = {
      ...VALID_OPTION,
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium' },
        },
      },
    };

    const tokens = optionToTokens(optionWithComponents);
    expect(tokens.components).toBeDefined();
    expect(tokens.components?.button?.primary?.bg).toBe('cta-primary');
  });

  it('omits components when not in option', () => {
    const tokens = optionToTokens(VALID_OPTION);
    expect(tokens.components).toBeUndefined();
  });
});

describe('init archetypes include component tokens', () => {
  it.each(['warm', 'professional', 'bold'] as const)('%s archetype has component tokens', (archetype) => {
    const tokens = buildDesignTokensSpec(archetype);

    expect(tokens.components).toBeDefined();
    expect(tokens.components?.button?.primary).toBeDefined();
    expect(tokens.components?.button?.secondary).toBeDefined();
    expect(tokens.components?.button?.ghost).toBeDefined();
    expect(tokens.components?.card?.default).toBeDefined();
    expect(tokens.components?.card?.highlighted).toBeDefined();
    expect(tokens.components?.input?.default).toBeDefined();
    expect(tokens.components?.input?.focus).toBeDefined();
    expect(tokens.components?.input?.error).toBeDefined();
    expect(tokens.components?.tab_bar?.active).toBeDefined();
    expect(tokens.components?.tab_bar?.inactive).toBeDefined();
    expect(tokens.components?.badge?.success).toBeDefined();
    expect(tokens.components?.badge?.warning).toBeDefined();
    expect(tokens.components?.badge?.error).toBeDefined();
    expect(tokens.components?.badge?.info).toBeDefined();
    expect(tokens.components?.avatar?.default).toBeDefined();
    expect(tokens.components?.progress_bar?.track).toBeDefined();
    expect(tokens.components?.progress_bar?.fill).toBeDefined();

    // Validate token references are consistent
    const result = validateDesignTokens(tokens);
    expect(result.ok).toBe(true);
  });
});
