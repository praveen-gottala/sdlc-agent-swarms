import {
  getComponentLibraryPresets,
  getComponentLibraryById,
} from './component-library-presets.js';
import type { ComponentLibraryId } from './component-library-presets.js';

describe('getComponentLibraryPresets', () => {
  it('returns exactly 6 presets', () => {
    const presets = getComponentLibraryPresets();
    expect(presets).toHaveLength(6);
  });

  it('each preset has a unique id', () => {
    const presets = getComponentLibraryPresets();
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('covers the expected libraries', () => {
    const presets = getComponentLibraryPresets();
    const ids = new Set(presets.map((p) => p.id));
    expect(ids).toEqual(new Set(['shadcn', 'mui', 'chakra', 'antd', 'radix', 'mantine']));
  });
});

describe('getComponentLibraryById', () => {
  it('returns the matching preset', () => {
    const preset = getComponentLibraryById('shadcn');
    expect(preset).toBeDefined();
    expect(preset!.libraryName).toBe('shadcn/ui');
  });

  it('returns undefined for unknown id', () => {
    const preset = getComponentLibraryById('unknown' as ComponentLibraryId);
    expect(preset).toBeUndefined();
  });

  it.each(['shadcn', 'mui', 'chakra', 'antd', 'radix', 'mantine'] as const)('%s is findable', (id) => {
    const preset = getComponentLibraryById(id);
    expect(preset).toBeDefined();
    expect(preset!.id).toBe(id);
  });
});

describe('preset structure', () => {
  const presets = getComponentLibraryPresets();

  it.each(presets.map((p) => [p.id, p] as const))('%s has library metadata', (_id, preset) => {
    expect(preset.libraryName).toBeTruthy();
    expect(preset.description).toBeTruthy();
    expect(preset.installHint).toBeTruthy();
    expect(preset.docsUrl).toBeTruthy();
  });

  it.each(presets.map((p) => [p.id, p] as const))('%s has at least 7 react mappings', (_id, preset) => {
    expect(Object.keys(preset.reactMappings).length).toBeGreaterThanOrEqual(7);
  });

  it.each(presets.map((p) => [p.id, p] as const))('%s react mappings have required fields', (_id, preset) => {
    for (const [component, mapping] of Object.entries(preset.reactMappings)) {
      expect(mapping.import_path).toBeTruthy();
      expect(mapping.component_name).toBeTruthy();
      // component key should be a known UI primitive
      expect(['button', 'card', 'input', 'badge', 'tabs', 'avatar', 'progress']).toContain(component);
    }
  });

  it.each(presets.map((p) => [p.id, p] as const))('%s has no color/theme data (separation of concerns)', (_id, preset) => {
    // Presets should NOT carry colors, fonts, or brand — that's the LLM's job
    const raw = preset as unknown as Record<string, unknown>;
    expect(raw['colors']).toBeUndefined();
    expect(raw['fonts']).toBeUndefined();
    expect(raw['brand']).toBeUndefined();
  });
});
