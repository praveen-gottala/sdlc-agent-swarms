import {
  loadDesignTokens,
  loadBrandSpec,
  saveDesignTokens,
  toDesignTokens,
  validateDesignTokens,
  validateBrandSpec,
} from './design-system-reader.js';
import type { DesignTokensSpec, BrandSpec } from '../types/design-system.js';
import type { FileSystem } from '../fs/file-system.js';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true as const, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir() {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
}

const VALID_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: {
      white: '#FFFFFF',
      slate: '#334155',
      blue: '#2563EB',
    },
    semantic: {
      'background-primary': 'white',
      'text-primary': 'slate',
      'cta-primary': 'blue',
      error: '#DC2626',
    },
  },
  typography: {
    font_families: { display: 'DM Sans', body: 'Inter' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
};

const VALID_BRAND: BrandSpec = {
  version: '1.0',
  created_by: 'test',
  identity: { tone: 'professional', audience: 'developers' },
  illustration_style: { direction: 'minimal', description: 'Clean lines' },
  motion_principles: {
    page_transitions: 'fade',
    interaction_feel: 'snappy',
    easing: 'ease-out',
    duration_base_ms: 200,
  },
  accessibility: { wcag_level: 'AA' },
};

describe('loadDesignTokens', () => {
  it('reads valid design-tokens.yaml', () => {
    const fs = createMockFs();
    const yaml = require('yaml');
    fs.files.set('/project/agentforge/spec/design-tokens.yaml', yaml.stringify(VALID_TOKENS));

    const result = loadDesignTokens('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('1.0');
      expect(result.value.colors.primitive.white).toBe('#FFFFFF');
      expect(result.value.typography.font_families.display).toBe('DM Sans');
    }
  });

  it('returns Err when file missing', () => {
    const fs = createMockFs();

    const result = loadDesignTokens('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Design tokens not found');
      expect(result.error.message).toContain('agentforge init');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

describe('saveDesignTokens / round-trip', () => {
  it('round-trips correctly', () => {
    const fs = createMockFs();

    const saveResult = saveDesignTokens('/project', VALID_TOKENS, fs);
    expect(saveResult.ok).toBe(true);

    const loadResult = loadDesignTokens('/project', fs);
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.version).toBe(VALID_TOKENS.version);
      expect(loadResult.value.colors.primitive.white).toBe(VALID_TOKENS.colors.primitive.white);
      expect(loadResult.value.typography.scale).toHaveLength(VALID_TOKENS.typography.scale.length);
    }
  });
});

describe('loadBrandSpec', () => {
  it('reads valid brand.yaml', () => {
    const fs = createMockFs();
    const yaml = require('yaml');
    fs.files.set('/project/agentforge/spec/brand.yaml', yaml.stringify(VALID_BRAND));

    const result = loadBrandSpec('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.identity.tone).toBe('professional');
      expect(result.value.accessibility.wcag_level).toBe('AA');
    }
  });

  it('returns Err when file missing', () => {
    const fs = createMockFs();

    const result = loadBrandSpec('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Brand spec not found');
      expect(result.error.message).toContain('agentforge init');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

describe('toDesignTokens', () => {
  it('maps spec to DesignTokens type', () => {
    const flat = toDesignTokens(VALID_TOKENS);

    expect(Object.keys(flat.colors).length).toBeGreaterThan(0);
    expect(flat.colors.white).toBe('#FFFFFF');
    expect(Object.keys(flat.typography).length).toBeGreaterThan(0);
    expect(Object.keys(flat.spacing).length).toBeGreaterThan(0);
    expect(flat.spacing['8']).toBe('8px');
  });
});

describe('validateDesignTokens', () => {
  it('passes for valid spec', () => {
    const result = validateDesignTokens(VALID_TOKENS);
    expect(result.ok).toBe(true);
  });

  it('catches semantic color referencing nonexistent primitive', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      colors: {
        primitive: { white: '#FFFFFF' },
        semantic: { 'bg-primary': 'midnight' },
      },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('midnight');
    }
  });

  it('catches typography referencing nonexistent font family', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      typography: {
        font_families: { body: 'Inter' },
        scale: [{ role: 'heading', size: 32, weight: 700, family: 'display' }],
      },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('display');
    }
  });

  it('catches unsorted spacing scale', () => {
    const bad: DesignTokensSpec = {
      ...VALID_TOKENS,
      spacing: { unit: 8, scale: [8, 4, 16] },
    };

    const result = validateDesignTokens(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not sorted');
    }
  });

  it('validates component token color references', () => {
    const withComponents: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'slate' },
        },
      },
    };

    const result = validateDesignTokens(withComponents);
    expect(result.ok).toBe(true);
  });

  it('catches component token referencing nonexistent color', () => {
    const withBadComponents: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          primary: { bg: 'nonexistent-color', text: 'background-primary' },
        },
      },
    };

    const result = validateDesignTokens(withBadComponents);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('nonexistent-color');
      expect(result.error.message).toContain('button.primary.bg');
    }
  });

  it('catches component token referencing nonexistent border radius', () => {
    const withBadRadius: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        card: {
          default: { bg: 'background-primary', radius: 'extra-large' },
        },
      },
    };

    const result = validateDesignTokens(withBadRadius);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('extra-large');
      expect(result.error.message).toContain('card.default.radius');
    }
  });

  it('allows transparent and special values in component tokens', () => {
    const withSpecialValues: DesignTokensSpec = {
      ...VALID_TOKENS,
      components: {
        button: {
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'small' },
        },
        card: {
          default: { bg: 'background-primary', border_style: 'solid', radius: 'medium' },
        },
      },
    };

    const result = validateDesignTokens(withSpecialValues);
    expect(result.ok).toBe(true);
  });

  it('passes validation when components is undefined (backward compat)', () => {
    const result = validateDesignTokens(VALID_TOKENS);
    expect(result.ok).toBe(true);
  });
});

describe('validateBrandSpec', () => {
  it('passes for valid spec', () => {
    const result = validateBrandSpec(VALID_BRAND);
    expect(result.ok).toBe(true);
  });
});
