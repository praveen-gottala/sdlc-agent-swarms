/**
 * Correction visibility test — validates that post-correction tokens
 * produce different CSS output than pre-correction tokens.
 * Ensures the correction loop improvements are visible in the browser renderer.
 */
import { generateCssVariables } from '../generate-css-variables.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import type { RendererTokens } from '../../../types/tokens.js';

describe('browser renderer — correction visibility', () => {
  it('different token values produce different CSS output', () => {
    const originalCss = generateCssVariables(SAMPLE_TOKENS);

    // Create modified tokens (simulating post-correction values)
    const modifiedTokens: RendererTokens = {
      ...SAMPLE_TOKENS,
      colors: {
        ...SAMPLE_TOKENS.colors,
        primitive: {
          ...SAMPLE_TOKENS.colors.primitive,
          'deep-teal': '#1A8B6A', // Changed from #0F6E56
          'warm-cream': '#FFF5DC', // Changed from #FFF8E7
        },
      },
    };

    const modifiedCss = generateCssVariables(modifiedTokens);

    // CSS outputs must differ
    expect(modifiedCss).not.toBe(originalCss);

    // Specific values should reflect the changes
    expect(originalCss).toContain('--deep-teal: #0F6E56');
    expect(modifiedCss).toContain('--deep-teal: #1A8B6A');
    expect(originalCss).toContain('--warm-cream: #FFF8E7');
    expect(modifiedCss).toContain('--warm-cream: #FFF5DC');

    // Semantic tokens that reference changed primitives should also differ
    expect(originalCss).toContain('--cta-primary: #0F6E56');
    expect(modifiedCss).toContain('--cta-primary: #1A8B6A');
    expect(originalCss).toContain('--background-primary: #FFF8E7');
    expect(modifiedCss).toContain('--background-primary: #FFF5DC');
  });

  it('same tokens produce identical CSS output', () => {
    const css1 = generateCssVariables(SAMPLE_TOKENS);
    const css2 = generateCssVariables(SAMPLE_TOKENS);
    expect(css1).toBe(css2);
  });

  it('shadcn bridge variables remain consistent across token changes', () => {
    const modifiedTokens: RendererTokens = {
      ...SAMPLE_TOKENS,
      colors: {
        ...SAMPLE_TOKENS.colors,
        primitive: {
          ...SAMPLE_TOKENS.colors.primitive,
          'deep-teal': '#2B9D7C',
        },
      },
    };

    const css = generateCssVariables(modifiedTokens);

    // Bridge variables always reference the same CSS var names (indirection)
    expect(css).toContain('--primary: var(--cta-primary)');
    expect(css).toContain('--background: var(--background-primary)');
    // But the resolved values change
    expect(css).toContain('--cta-primary: #2B9D7C');
  });
});
