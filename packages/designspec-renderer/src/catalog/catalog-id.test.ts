import { normalizeCatalogIdToKebab } from './catalog-id.js';

describe('normalizeCatalogIdToKebab', () => {
  it('converts PascalCase component names', () => {
    expect(normalizeCatalogIdToKebab('Button')).toBe('button');
    expect(normalizeCatalogIdToKebab('Chip')).toBe('chip');
    expect(normalizeCatalogIdToKebab('NavigationBar')).toBe('navigation-bar');
    expect(normalizeCatalogIdToKebab('SegmentedControl')).toBe('segmented-control');
    expect(normalizeCatalogIdToKebab('Tabs')).toBe('tabs');
  });

  it('leaves already-kebab ids unchanged (lowercase)', () => {
    expect(normalizeCatalogIdToKebab('button-primary')).toBe('button-primary');
    expect(normalizeCatalogIdToKebab('input-text')).toBe('input-text');
  });

  it('handles consecutive capitals (acronyms)', () => {
    expect(normalizeCatalogIdToKebab('XMLParser')).toBe('xml-parser');
  });
});
