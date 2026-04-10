/**
 * Tests for source intelligence extraction modules.
 * Validates against the brownfield test app (agentforge-brownfield-app/).
 */

import { join } from 'node:path';
import { detectStack } from './detect-stack.js';
import { discoverRoutes } from './discover-routes.js';
import { extractCSSVariables } from './extract-css-variables.js';
import { scanComponentUsage } from './scan-component-usage.js';

// Resolve the brownfield app path relative to monorepo root
const BROWNFIELD_APP = join(__dirname, '..', '..', '..', '..', 'agentforge-brownfield-app');

describe('detectStack', () => {
  it('detects Next.js App Router + shadcn + Tailwind v4 + TypeScript', () => {
    const result = detectStack(BROWNFIELD_APP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.framework).toBe('nextjs-app');
    expect(result.value.componentLibrary).toBe('shadcn');
    expect(result.value.styling).toBe('tailwind-v4');
    expect(result.value.typescript).toBe(true);
    expect(result.value.packageManager).toBe('npm');
  });

  it('returns error for nonexistent directory', () => {
    const result = detectStack('/nonexistent/path');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FILE_NOT_FOUND');
  });
});

describe('discoverRoutes', () => {
  it('discovers all 3 routes from the brownfield app', () => {
    const result = discoverRoutes(BROWNFIELD_APP, 'nextjs-app');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const routes = result.value;
    expect(routes.length).toBe(3);

    const routePaths = routes.map(r => r.route);
    expect(routePaths).toContain('/');
    expect(routePaths).toContain('/settings');
    expect(routePaths).toContain('/users');
  });

  it('assigns meaningful IDs to routes', () => {
    const result = discoverRoutes(BROWNFIELD_APP, 'nextjs-app');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.value.map(r => r.id);
    expect(ids).toContain('home');
    expect(ids).toContain('settings');
    expect(ids).toContain('users');
  });

  it('includes relative file paths', () => {
    const result = discoverRoutes(BROWNFIELD_APP, 'nextjs-app');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const route of result.value) {
      expect(route.filePath).toMatch(/^src\/app\//);
      expect(route.filePath).toMatch(/page\.tsx$/);
    }
  });
});

describe('extractCSSVariables', () => {
  it('extracts CSS custom properties from globals.css', () => {
    const result = extractCSSVariables(BROWNFIELD_APP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThan(10);
  });

  it('finds :root scoped variables', () => {
    const result = extractCSSVariables(BROWNFIELD_APP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rootVars = result.value.filter(v => v.scope === ':root');
    expect(rootVars.length).toBeGreaterThan(5);

    // Should find the primary color (teal)
    const primary = rootVars.find(v => v.name === '--primary');
    expect(primary).toBeDefined();
    expect(primary!.value).toContain('oklch');
  });

  it('finds @theme inline variables (Tailwind v4)', () => {
    const result = extractCSSVariables(BROWNFIELD_APP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const themeVars = result.value.filter(v => v.scope === '@theme');
    expect(themeVars.length).toBeGreaterThan(5);

    // Should find color-primary mapping
    const colorPrimary = themeVars.find(v => v.name === '--color-primary');
    expect(colorPrimary).toBeDefined();
    expect(colorPrimary!.value).toBe('var(--primary)');
  });

  it('finds custom teal/coral palette tokens', () => {
    const result = extractCSSVariables(BROWNFIELD_APP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tealTokens = result.value.filter(v => v.name.includes('teal'));
    expect(tealTokens.length).toBeGreaterThan(0);

    const coralTokens = result.value.filter(v => v.name.includes('coral'));
    expect(coralTokens.length).toBeGreaterThan(0);
  });
});

describe('scanComponentUsage', () => {
  it('finds shadcn component imports', () => {
    const result = scanComponentUsage(BROWNFIELD_APP, 'shadcn');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const componentNames = result.value.map(c => c.componentName);

    // These components are used in the brownfield app
    expect(componentNames).toContain('Button');
    expect(componentNames).toContain('Card');
    expect(componentNames).toContain('Badge');
    expect(componentNames).toContain('Input');
    expect(componentNames).toContain('Avatar');
    expect(componentNames).toContain('Switch');
    expect(componentNames).toContain('Checkbox');
  });

  it('counts usage across files correctly', () => {
    const result = scanComponentUsage(BROWNFIELD_APP, 'shadcn');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Button is used in all 3 page files + sidebar
    const button = result.value.find(c => c.componentName === 'Button');
    expect(button).toBeDefined();
    expect(button!.fileCount).toBeGreaterThanOrEqual(3);
  });

  it('returns sorted by usage (most-used first)', () => {
    const result = scanComponentUsage(BROWNFIELD_APP, 'shadcn');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (let i = 1; i < result.value.length; i++) {
      expect(result.value[i - 1].fileCount).toBeGreaterThanOrEqual(result.value[i].fileCount);
    }
  });

  it('returns error for unknown library', () => {
    const result = scanComponentUsage(BROWNFIELD_APP, 'unknown');
    expect(result.ok).toBe(false);
  });
});
