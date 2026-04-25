/**
 * Unit tests for the tailwind/CSS generators.
 *
 * Canonical home for these assertions. (Previously lived in
 * `packages/cli/src/commands/init.test.ts` when these functions were
 * CLI-local; moved here as part of unify-pipeline Phase 0.5 because
 * the canonical implementation now lives in `@agentforge/core`.)
 */

import {
  generateTailwindConfig,
  generateGlobalCss,
  hexToHSLChannels,
  buildDesignTokensSpec,
} from '../index.js';

describe('hexToHSLChannels', () => {
  it('converts known hex values', () => {
    expect(hexToHSLChannels('#0F6E56')).toBe('165 76% 25%');
  });

  it('converts white', () => {
    expect(hexToHSLChannels('#FFFFFF')).toBe('0 0% 100%');
  });

  it('converts black', () => {
    expect(hexToHSLChannels('#000000')).toBe('0 0% 0%');
  });
});

describe('generateTailwindConfig (shadcn)', () => {
  const tokens = buildDesignTokensSpec('professional');

  it('uses hsl(var(--primary)) structure and avoids raw hex literals', () => {
    const config = generateTailwindConfig(tokens);
    expect(config).toContain('hsl(var(--primary))');
    expect(config).toContain('hsl(var(--background))');
    expect(config).toContain('hsl(var(--foreground))');
    expect(config).not.toContain('#FFFFFF');
    expect(config).not.toContain('#2563EB');
  });

  it('includes elevation, zIndex, screens, and radius bindings', () => {
    const config = generateTailwindConfig(tokens);
    expect(config).toContain('boxShadow');
    expect(config).toContain('rgba(0,0,0,');
    expect(config).toContain('zIndex');
    expect(config).toContain("'dropdown': '1000'");
    expect(config).toContain('screens');
    expect(config).toContain("'mobile': '640px'");
    expect(config).toContain('var(--radius)');
  });
});

describe('generateGlobalCss (shadcn)', () => {
  it('emits HSL channel values for shadcn variables, not raw AgentForge names', () => {
    const tokens = buildDesignTokensSpec('professional');
    const css = generateGlobalCss(tokens);
    expect(css).toContain('--primary:');
    expect(css).toContain('--background:');
    expect(css).toContain('--foreground:');
    expect(css).toMatch(/--primary:\s+\d+\s+\d+%\s+\d+%/);
    expect(css).not.toContain('--cta-primary:');
    expect(css).not.toContain('--background-primary:');
  });

  it('includes foreground pairs for surface tokens', () => {
    const tokens = buildDesignTokensSpec('professional');
    const css = generateGlobalCss(tokens);
    expect(css).toContain('--card-foreground:');
    expect(css).toContain('--primary-foreground:');
    expect(css).toContain('--destructive-foreground:');
  });

  it('includes elevation shadow and radius variables', () => {
    const tokens = buildDesignTokensSpec('professional');
    const css = generateGlobalCss(tokens);
    expect(css).toContain('--shadow-1:');
    expect(css).toContain('--shadow-2:');
    expect(css).toContain('--shadow-3:');
    expect(css).toContain('--radius:');
    expect(css).toMatch(/--radius:\s+[\d.]+rem/);
  });

  it('wraps variables in @layer base :root and emits no duplicates', () => {
    const tokens = buildDesignTokensSpec('warm');
    const css = generateGlobalCss(tokens);
    expect(css).toContain('@layer base');
    expect(css).toContain(':root');
    const varLines = css.split('\n').filter((l) => l.trim().startsWith('--'));
    const varNames = varLines.map((l) => l.trim().split(':')[0]);
    expect(varNames.length).toBe(new Set(varNames).size);
  });

  it('includes muted variable family', () => {
    const tokens = buildDesignTokensSpec('warm');
    const css = generateGlobalCss(tokens);
    expect(css).toContain('--muted:');
    expect(css).toContain('--muted-foreground:');
  });
});
