import { ScriptBuilder } from './script-builder.js';
import { emitPluginData } from './plugin-data.js';
import type { ResolvedNode } from '../../types/catalog.js';

describe('plugin-data', () => {
  describe('emitPluginData', () => {
    it('should emit ds_id for every node', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'node-1',
        parent: null,
        order: 0,
        resolved: true,
      };
      emitPluginData(sb, 'shape', node);
      const output = sb.build();
      expect(output).toContain("shape.setPluginData('ds_id', 'node-1');");
    });

    it('should emit ds_type for accelerator nodes', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'hdr',
        parent: null,
        order: 0,
        resolved: true,
        type: 'header',
      };
      emitPluginData(sb, 'v0', node);
      const output = sb.build();
      expect(output).toContain("v0.setPluginData('ds_type', 'header');");
    });

    it('should emit ds_catalog for catalog nodes', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'btn-1',
        parent: null,
        order: 0,
        resolved: true,
        catalogId: 'button-primary',
      };
      emitPluginData(sb, 'v1', node);
      const output = sb.build();
      expect(output).toContain("v1.setPluginData('ds_catalog', 'button-primary');");
    });

    it('should emit ds_token_bg when background is present', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'card',
        parent: null,
        order: 0,
        resolved: true,
        background: 'surface-elevated',
      };
      emitPluginData(sb, 'v2', node);
      const output = sb.build();
      expect(output).toContain("v2.setPluginData('ds_token_bg', 'surface-elevated');");
    });

    it('should emit ds_token_text when color is present', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'txt',
        parent: null,
        order: 0,
        resolved: true,
        color: 'text-primary',
      };
      emitPluginData(sb, 'v3', node);
      const output = sb.build();
      expect(output).toContain("v3.setPluginData('ds_token_text', 'text-primary');");
    });

    it('should emit ds_token_border when border_color is present', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'input',
        parent: null,
        order: 0,
        resolved: true,
        border_color: 'border-default',
      };
      emitPluginData(sb, 'v4', node);
      const output = sb.build();
      expect(output).toContain("v4.setPluginData('ds_token_border', 'border-default');");
    });

    it('should emit ds_overrides as stringified JSON when overrides present', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'custom',
        parent: null,
        order: 0,
        resolved: true,
        overrides: { radius: 20, padding: 16 },
      };
      emitPluginData(sb, 'v5', node);
      const output = sb.build();
      const expectedJson = JSON.stringify(JSON.stringify({ radius: 20, padding: 16 }));
      expect(output).toContain(`v5.setPluginData('ds_overrides', ${expectedJson});`);
    });

    it('should skip absent metadata fields', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'minimal',
        parent: 'root',
        order: 1,
        resolved: true,
        type: 'container',
      };
      emitPluginData(sb, 'v6', node);
      const output = sb.build();
      // Should have ds_id and ds_type but NOT ds_catalog, ds_token_bg, ds_token_text, ds_token_border, ds_overrides
      expect(output).toContain("v6.setPluginData('ds_id', 'minimal');");
      expect(output).toContain("v6.setPluginData('ds_type', 'container');");
      expect(output).not.toContain('ds_catalog');
      expect(output).not.toContain('ds_token_bg');
      expect(output).not.toContain('ds_token_text');
      expect(output).not.toContain('ds_token_border');
      expect(output).not.toContain('ds_overrides');
    });

    it('should not emit ds_catalog for accelerator nodes without catalogId', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'spacer-1',
        parent: 'root',
        order: 2,
        resolved: true,
        type: 'spacer',
      };
      emitPluginData(sb, 'v7', node);
      const output = sb.build();
      expect(output).not.toContain('ds_catalog');
    });

    it('should emit all metadata fields when all are present', () => {
      const sb = new ScriptBuilder();
      const node: ResolvedNode = {
        id: 'full-node',
        parent: 'root',
        order: 0,
        resolved: true,
        type: 'container',
        catalogId: 'card-elevated',
        background: 'surface-elevated',
        color: 'text-primary',
        border_color: 'border-default',
        overrides: { shadow: 'lg' },
      };
      emitPluginData(sb, 'full', node);
      const output = sb.build();
      expect(output).toContain("full.setPluginData('ds_id', 'full-node');");
      expect(output).toContain("full.setPluginData('ds_type', 'container');");
      expect(output).toContain("full.setPluginData('ds_catalog', 'card-elevated');");
      expect(output).toContain("full.setPluginData('ds_token_bg', 'surface-elevated');");
      expect(output).toContain("full.setPluginData('ds_token_text', 'text-primary');");
      expect(output).toContain("full.setPluginData('ds_token_border', 'border-default');");
      expect(output).toContain("full.setPluginData('ds_overrides',");
    });
  });
});
