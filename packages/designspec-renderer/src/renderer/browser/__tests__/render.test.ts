/**
 * Unit tests for browser renderer CSS variable generation and node processing.
 * Tests pure logic that runs in Node.js — no React DOM needed.
 */
import { generateCssVariables } from '../generate-css-variables.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import { loadFixture } from '../../../__fixtures__/load-fixture.js';
import { buildTree } from '../../tree-builder.js';
import { resolveNode } from '../../../catalog/resolver.js';
import { buildTokenMap } from '../../token-resolver.js';
import { loadCatalogForRenderer } from '../../../catalog/loader.js';
import type { CatalogMap } from '../../../types/catalog.js';

const { spec: settingsForm } = loadFixture('settings-form');
const { spec: dashboardDetail } = loadFixture('dashboard-detail');

describe('browser renderer — CSS variable generation', () => {
  it('produces a :root {} block with correct hex values', () => {
    const css = generateCssVariables(SAMPLE_TOKENS);
    expect(css).toContain(':root {');
    expect(css).toContain('}');
    // Check DesignSpec token variables
    expect(css).toContain('--background-primary: #FFF8E7');
    expect(css).toContain('--cta-primary: #0F6E56');
    expect(css).toContain('--text-primary: #444441');
    expect(css).toContain('--text-secondary: #9C9C97');
    expect(css).toContain('--surface-elevated: #FAFAF8');
    expect(css).toContain('--error: #E8593C');
  });

  it('includes the shadcn theme bridge variables', () => {
    const css = generateCssVariables(SAMPLE_TOKENS);
    expect(css).toContain('--background: var(--background-primary)');
    expect(css).toContain('--foreground: var(--text-primary)');
    expect(css).toContain('--primary: var(--cta-primary)');
    expect(css).toContain('--primary-foreground: var(--text-on-cta)');
    expect(css).toContain('--secondary: var(--surface-elevated)');
    expect(css).toContain('--destructive: var(--error)');
    expect(css).toContain('--card: var(--surface-primary)');
    expect(css).toContain('--border: var(--border-default)');
    expect(css).toContain('--ring: var(--cta-primary)');
    expect(css).toContain('--popover: var(--surface-elevated)');
  });

  it('includes all primitive and semantic colors as variables', () => {
    const css = generateCssVariables(SAMPLE_TOKENS);
    const tokenMap = buildTokenMap(SAMPLE_TOKENS);
    for (const [name, hex] of Object.entries(tokenMap)) {
      expect(css).toContain(`--${name}: ${hex}`);
    }
  });

  it('handles rgba values in semantic tokens', () => {
    const css = generateCssVariables(SAMPLE_TOKENS);
    expect(css).toContain('--overlay: rgba(0,0,0,0.5)');
  });
});

describe('browser renderer — node processing', () => {
  let catalog: CatalogMap;

  beforeAll(() => {
    catalog = loadCatalogForRenderer(undefined, SAMPLE_TOKENS);
  });

  it('builds tree from settings-form fixture without errors', () => {
    const tree = buildTree(settingsForm.nodes);
    expect(tree.id).toBe('root');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('builds tree from dashboard-detail fixture without errors', () => {
    const tree = buildTree(dashboardDetail.nodes);
    expect(tree.id).toBe('root');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('resolves all nodes from settings-form (no nulls)', () => {
    for (const [id, node] of Object.entries(settingsForm.nodes)) {
      const resolved = resolveNode(id, node, catalog);
      expect(resolved).not.toBeNull();
      expect(resolved.id).toBe(id);
    }
  });

  it('resolves all nodes from dashboard-detail (no nulls)', () => {
    for (const [id, node] of Object.entries(dashboardDetail.nodes)) {
      const resolved = resolveNode(id, node, catalog);
      expect(resolved).not.toBeNull();
      expect(resolved.id).toBe(id);
    }
  });

  it('correctly maps catalog components to expected types', () => {
    const nameNode = settingsForm.nodes['nameInput'];
    const resolved = resolveNode('nameInput', nameNode, catalog);
    expect(resolved.catalogId).toBe('input-text');
    expect(resolved.resolved).toBe(true);
    expect(resolved.label).toBe('Display Name');
  });

  it('resolves accelerator types correctly', () => {
    const rootNode = settingsForm.nodes['root'];
    const resolved = resolveNode('root', rootNode, catalog);
    expect(resolved.type).toBe('page');
    expect(resolved.background).toBe('background-primary');
  });
});
