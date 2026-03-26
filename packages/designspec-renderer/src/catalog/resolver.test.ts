import { resolveNode } from './resolver.js';
import { V2_BUILTIN_CATALOG } from '../__fixtures__/catalog-entries.js';
import { loadFixture } from '../__fixtures__/load-fixture.js';
import type { NodeSpec } from '../types/design-spec-v2.js';
import type { CatalogEntry, CatalogMap } from '../types/catalog.js';

const { spec: settingsForm } = loadFixture('settings-form');

describe('resolveNode', () => {
  describe('accelerator nodes', () => {
    it('resolves a page accelerator with resolved=true and no catalogEntry', () => {
      const node = settingsForm.nodes['root'];
      const resolved = resolveNode('root', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(true);
      expect(resolved.type).toBe('page');
      expect(resolved.catalogEntry).toBeUndefined();
      expect(resolved.catalogId).toBeUndefined();
      expect(resolved.id).toBe('root');
      expect(resolved.parent).toBeNull();
      expect(resolved.order).toBe(0);
      expect(resolved.background).toBe('background-primary');
    });

    it('passes through all accelerator node fields', () => {
      const node = settingsForm.nodes['logo'];
      const resolved = resolveNode('logo', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(true);
      expect(resolved.type).toBe('text');
      expect(resolved.content).toBe('AppName');
      expect(resolved.typography).toBe('heading-3');
      expect(resolved.color).toBe('cta-primary');
      expect(resolved.weight).toBe(700);
    });
  });

  describe('catalog nodes', () => {
    it('resolves a catalog node with resolved=true and catalogEntry populated', () => {
      const node = settingsForm.nodes['emailInput'];
      const resolved = resolveNode('emailInput', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(true);
      expect(resolved.catalogId).toBe('input-text');
      expect(resolved.catalogEntry).toBeDefined();
      expect(resolved.label).toBe('Email Address');
      expect(resolved.placeholder).toBe('you@example.com');
    });

    it('emailInput height is 72 from overrides, not catalog default 48', () => {
      const node = settingsForm.nodes['emailInput'];
      const resolved = resolveNode('emailInput', node, V2_BUILTIN_CATALOG);

      expect(resolved.height).toBe(72);
      expect(V2_BUILTIN_CATALOG['input-text'].height).toBe(48);
    });

    it('emailInput border_color is border-focus from overrides, not border-default', () => {
      const node = settingsForm.nodes['emailInput'];
      const resolved = resolveNode('emailInput', node, V2_BUILTIN_CATALOG);

      expect(resolved.border_color).toBe('border-focus');
      expect(V2_BUILTIN_CATALOG['input-text'].border_color).toBe('border-default');
    });

    it('emailInput typography is heading-1 from overrides, not body from catalog', () => {
      const node = settingsForm.nodes['emailInput'];
      const resolved = resolveNode('emailInput', node, V2_BUILTIN_CATALOG);

      expect(resolved.typography).toBe('heading-1');
      expect(V2_BUILTIN_CATALOG['input-text'].text_typography).toBe('body');
    });

    it('nameInput uses catalog defaults when no overrides', () => {
      const node = settingsForm.nodes['nameInput'];
      const resolved = resolveNode('nameInput', node, V2_BUILTIN_CATALOG);

      expect(resolved.height).toBe(48);
      expect(resolved.border_color).toBe('border-default');
      expect(resolved.typography).toBe('body');
      expect(resolved.background).toBe('surface-input');
      expect(resolved.radius).toBe(12);
    });
  });

  describe('unresolved nodes', () => {
    it('returns resolved=false for unknown catalog reference', () => {
      const node: NodeSpec = {
        catalog: 'nonexistent-widget',
        parent: 'root',
        order: 0,
      };
      const resolved = resolveNode('unknown', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(false);
      expect(resolved.catalogId).toBe('nonexistent-widget');
      expect(resolved.catalogEntry).toBeUndefined();
    });

    it('returns resolved=false for node with neither type nor catalog', () => {
      const node: NodeSpec = {
        parent: 'root',
        order: 0,
      };
      const resolved = resolveNode('bare', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(false);
      expect(resolved.catalogId).toBeUndefined();
      expect(resolved.type).toBeUndefined();
    });
  });

  describe('extends chain resolution', () => {
    it('input-currency extends input-text — resolved entry has input-text defaults', () => {
      const node: NodeSpec = {
        catalog: 'input-currency',
        parent: 'root',
        order: 0,
        label: 'Amount',
      };
      const resolved = resolveNode('amount', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(true);
      expect(resolved.catalogEntry).toBeDefined();
      expect(resolved.background).toBe('surface-input');
      expect(resolved.radius).toBe(12);
      expect((resolved.catalogEntry as Record<string, unknown>).extends).toBeUndefined();
    });

    it('guards against circular extends — no infinite loop', () => {
      const circularCatalog: CatalogMap = {
        'widget-a': {
          type: 'widget',
          extends: 'widget-b',
          background: 'a-bg',
        } as CatalogEntry,
        'widget-b': {
          type: 'widget',
          extends: 'widget-a',
          background: 'b-bg',
          text_color: 'b-text',
        } as CatalogEntry,
      };

      const node: NodeSpec = {
        catalog: 'widget-a',
        parent: null,
        order: 0,
      };

      const resolved = resolveNode('circ', node, circularCatalog);
      expect(resolved.resolved).toBe(true);
      expect(resolved.background).toBe('a-bg');
      expect(resolved.color).toBe('b-text');
    });

    it('handles deep extends chain up to MAX_EXTENDS_DEPTH', () => {
      const deepCatalog: CatalogMap = {
        'level-0': { type: 'base', background: 'base-bg', text_color: 'base-text' } as CatalogEntry,
        'level-1': { type: 'l1', extends: 'level-0', radius: 4 } as CatalogEntry,
        'level-2': { type: 'l2', extends: 'level-1', shadow: 'md' } as CatalogEntry,
        'level-3': { type: 'l3', extends: 'level-2', height: 40 } as CatalogEntry,
      };

      const node: NodeSpec = {
        catalog: 'level-3',
        parent: null,
        order: 0,
      };

      const resolved = resolveNode('deep', node, deepCatalog);
      expect(resolved.resolved).toBe(true);
      expect(resolved.background).toBe('base-bg');
      expect(resolved.radius).toBe(4);
      expect(resolved.shadow).toBe('md');
      expect(resolved.height).toBe(40);
    });
  });

  describe('override priority', () => {
    it('overrides.weight takes precedence over catalog text_weight', () => {
      const node: NodeSpec = {
        catalog: 'button-primary',
        parent: 'root',
        order: 0,
        label: 'Submit',
        overrides: { weight: 500 },
      };
      const resolved = resolveNode('btn', node, V2_BUILTIN_CATALOG);

      expect(resolved.weight).toBe(500);
      expect(V2_BUILTIN_CATALOG['button-primary'].text_weight).toBe(600);
    });

    it('overrides.text_weight also works for weight override', () => {
      const node: NodeSpec = {
        catalog: 'button-primary',
        parent: 'root',
        order: 0,
        label: 'Submit',
        overrides: { text_weight: 400 },
      };
      const resolved = resolveNode('btn2', node, V2_BUILTIN_CATALOG);

      expect(resolved.weight).toBe(400);
    });

    it('saveButton overrides height and radius from catalog defaults', () => {
      const node = settingsForm.nodes['saveButton'];
      const resolved = resolveNode('saveButton', node, V2_BUILTIN_CATALOG);

      expect(resolved.resolved).toBe(true);
      expect(resolved.catalogId).toBe('button-primary');
      expect(resolved.height).toBe(56);
      expect(resolved.radius).toBe(28);
      expect(resolved.shadow).toBe('lg');
      expect(resolved.background).toBe('cta-primary');
      expect(resolved.color).toBe('text-on-cta');
    });
  });
});
