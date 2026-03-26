import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDesignSpec } from './validate.js';
import { V2_BUILTIN_CATALOG } from '../__fixtures__/catalog-entries.js';
import type { DesignSpecV2, NodeSpec } from '../types/design-spec-v2.js';

const settingsForm: DesignSpecV2 = JSON.parse(
  readFileSync(join(__dirname, '../../__tests__/fixtures/settings-form.json'), 'utf-8')
);

describe('validateDesignSpec', () => {
  it('valid settings-form: 0 errors', () => {
    const result = validateDesignSpec(settingsForm, V2_BUILTIN_CATALOG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // May have warnings but no errors
  });

  it('no root node → error', () => {
    const spec: DesignSpecV2 = {
      screen: 'test',
      width: 1440,
      nodes: {
        a: { parent: 'b', order: 0, type: 'container' },
        b: { parent: 'a', order: 0, type: 'container' },
      },
    };
    const result = validateDesignSpec(spec, V2_BUILTIN_CATALOG);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === 'single-root')).toBe(true);
  });

  it('dangling parent reference → error', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      child: { parent: 'nonexistent', order: 0, type: 'container' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === 'valid-parent' && e.message.includes('nonexistent'))).toBe(true);
  });

  it('unknown catalog entry → error', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      child: { parent: 'root', order: 0, catalog: 'input-fancy' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === 'valid-catalog' && e.message.includes('input-fancy'))).toBe(true);
  });

  it('both type AND catalog → warning', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      child: { parent: 'root', order: 0, type: 'container', catalog: 'card' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.some(w => w.rule === 'type-xor-catalog')).toBe(true);
  });

  it('neither type nor catalog → error', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      child: { parent: 'root', order: 0 } as NodeSpec,
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === 'type-xor-catalog')).toBe(true);
  });

  it('cycle detected → error', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      a: { parent: 'b', order: 0, type: 'container' },
      b: { parent: 'a', order: 0, type: 'container' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.errors.some(e => e.rule === 'no-cycles')).toBe(true);
  });

  it('button below 44px touch target → warning', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      btn: { parent: 'root', order: 0, catalog: 'button-primary', overrides: { height: 30 } },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.some(w => w.rule === 'touch-target')).toBe(true);
  });
});
