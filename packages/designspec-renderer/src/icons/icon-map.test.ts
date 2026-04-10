import { getCanonicalIconNames, getIconComponentName, ICON_MAP, resolveIconName } from './icon-map.js';

describe('icon-map', () => {
  it('resolves a direct canonical match', () => {
    expect(resolveIconName('search')).toBe('search');
  });

  it('resolves an alias to its canonical icon name', () => {
    expect(resolveIconName('magnifying-glass')).toBe('search');
  });

  it('resolves names case-insensitively', () => {
    expect(resolveIconName('SEARCH')).toBe('search');
  });

  it('returns null for an unknown icon name', () => {
    expect(resolveIconName('nonexistent-icon')).toBeNull();
  });

  it('returns the lucide component name for a canonical icon', () => {
    expect(getIconComponentName('search')).toBe('Search');
  });

  it('resolves aliases before returning component names', () => {
    expect(getIconComponentName('trash')).toBe('Trash2');
  });

  it('exposes a broad canonical icon vocabulary', () => {
    expect(getCanonicalIconNames().length).toBeGreaterThan(60);
  });

  it('stores a non-empty component name for every icon entry', () => {
    for (const entry of Object.values(ICON_MAP)) {
      expect(entry.componentName.trim()).not.toBe('');
    }
  });
});
