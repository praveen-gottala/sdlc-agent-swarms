import { loadBaseCatalog } from './index.js';
import { validateComponentCatalog } from '../state/design-system-reader.js';

describe('loadBaseCatalog', () => {
  it('returns a spec with 20+ components', () => {
    const catalog = loadBaseCatalog();
    const count = Object.keys(catalog.components).length;
    expect(count).toBeGreaterThanOrEqual(20);
  });

  it('passes validateComponentCatalog()', () => {
    const catalog = loadBaseCatalog();
    const result = validateComponentCatalog(catalog);
    expect(result.ok).toBe(true);
  });

  it('every component has a default state', () => {
    const catalog = loadBaseCatalog();
    for (const [, entry] of Object.entries(catalog.components)) {
      expect(entry.states['default']).toBeDefined();
    }
  });

  it('every component has non-empty anatomy', () => {
    const catalog = loadBaseCatalog();
    for (const [, entry] of Object.entries(catalog.components)) {
      expect(entry.anatomy.length).toBeGreaterThan(0);
    }
  });

  it('has version and created_by fields', () => {
    const catalog = loadBaseCatalog();
    expect(catalog.version).toBeDefined();
    expect(catalog.created_by).toBeDefined();
  });
});
