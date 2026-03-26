import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDesignSpec } from './validate.js';
import { V2_BUILTIN_CATALOG } from '../__fixtures__/catalog-entries.js';
import { loadFixture } from '../__fixtures__/load-fixture.js';
import type { DesignSpecV2, NodeSpec } from '../types/design-spec-v2.js';

const { spec: settingsForm } = loadFixture('settings-form');

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

  // --- Rule 8: required-fields ---

  it('input-text missing label and placeholder → 2 warnings', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      input: { parent: 'root', order: 0, catalog: 'input-text' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    const rfWarnings = result.warnings.filter(w => w.rule === 'required-fields');
    expect(rfWarnings).toHaveLength(2);
    expect(rfWarnings.some(w => w.message.includes('"label"'))).toBe(true);
    expect(rfWarnings.some(w => w.message.includes('"placeholder"'))).toBe(true);
  });

  it('input-text with label and placeholder → no required-fields warnings', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      input: { parent: 'root', order: 0, catalog: 'input-text', label: 'Email', placeholder: 'you@example.com' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.filter(w => w.rule === 'required-fields')).toHaveLength(0);
  });

  it('display-readonly with label and value → no required-fields warnings', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      display: { parent: 'root', order: 0, catalog: 'display-readonly', label: 'Total', value: '$100' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.filter(w => w.rule === 'required-fields')).toHaveLength(0);
  });

  it('required field provided via overrides → no warning', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      input: { parent: 'root', order: 0, catalog: 'input-text', label: 'Email', overrides: { placeholder: 'you@example.com' } },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.filter(w => w.rule === 'required-fields')).toHaveLength(0);
  });

  it('card with no content fields → no required-fields warnings (empty required_fields)', () => {
    const nodes: Record<string, NodeSpec> = {
      root: { parent: null, order: 0, type: 'page' },
      card: { parent: 'root', order: 0, catalog: 'card' },
    };
    const result = validateDesignSpec({ screen: 'test', width: 1440, nodes }, V2_BUILTIN_CATALOG);
    expect(result.warnings.filter(w => w.rule === 'required-fields')).toHaveLength(0);
  });

  it('bill-entry fixture passes validation with no required-fields warnings', () => {
    const specPath = join(__dirname, '..', '..', '__tests__', 'fixtures', 'test-app-splitwise', 'bill-entry.json');
    const billEntry: DesignSpecV2 = JSON.parse(readFileSync(specPath, 'utf-8'));
    const result = validateDesignSpec(billEntry, V2_BUILTIN_CATALOG);
    expect(result.warnings.filter(w => w.rule === 'required-fields')).toHaveLength(0);
  });
});
