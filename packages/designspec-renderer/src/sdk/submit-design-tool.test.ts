/**
 * @module submit-design-tool.test
 * Tests for the SUBMIT_DESIGN_TOOL definition.
 *
 * 1. Shape test — verifies structural correctness of the tool definition.
 * 2. Round-trip test — loads a real fixture, validates it matches the schema
 *    fields, and runs it through validate + render.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUBMIT_DESIGN_TOOL } from './submit-design-tool.js';
import { validateDesignSpec, renderToScript } from '../index.js';
import type { DesignSpecV2 } from '../index.js';
import { SAMPLE_TOKENS } from '../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../__fixtures__/catalog-entries.js';

describe('SUBMIT_DESIGN_TOOL', () => {
  it('has the expected tool definition shape', () => {
    // Name
    expect(SUBMIT_DESIGN_TOOL.name).toBe('submit_design');

    // Description is a non-empty string
    expect(typeof SUBMIT_DESIGN_TOOL.description).toBe('string');
    expect(SUBMIT_DESIGN_TOOL.description.length).toBeGreaterThan(0);

    // Parameters is a JSON Schema object with required top-level fields
    const params = SUBMIT_DESIGN_TOOL.parameters;
    expect(params).toBeDefined();
    expect(params.type).toBe('object');
    expect(params.required).toEqual(['screen', 'width', 'nodes']);

    // Properties exist for all three required fields
    const props = params.properties as Record<string, Record<string, unknown>>;
    expect(props.screen).toBeDefined();
    expect(props.width).toBeDefined();
    expect(props.nodes).toBeDefined();

    // nodes has additionalProperties with required parent + order
    const nodesSchema = props.nodes as Record<string, unknown>;
    expect(nodesSchema.additionalProperties).toBeDefined();
    const nodeProps = nodesSchema.additionalProperties as Record<string, unknown>;
    expect(nodeProps.required).toEqual(['parent', 'order']);

    // NodeSpec properties cover all expected fields
    const nodeSchemaProps = nodeProps.properties as Record<string, unknown>;
    const expectedNodeFields = [
      'parent',
      'order',
      'type',
      'catalog',
      'label',
      'content',
      'value',
      'placeholder',
      'options',
      'layout',
      'width',
      'height',
      'typography',
      'color',
      'weight',
      'background',
      'shadow',
      'radius',
      'overrides',
      'items',
    ];
    for (const field of expectedNodeFields) {
      expect(nodeSchemaProps).toHaveProperty(field);
    }
  });

  it('round-trips a real fixture through validation and rendering', () => {
    // Load the bill-entry fixture from the integration test fixtures
    const fixturePath = join(
      __dirname,
      '../../__tests__/fixtures/test-app-splitwise/bill-entry.json',
    );
    const spec: DesignSpecV2 = JSON.parse(readFileSync(fixturePath, 'utf-8'));

    // Verify fixture has the required top-level fields matching the tool schema
    expect(spec).toHaveProperty('screen');
    expect(spec).toHaveProperty('width');
    expect(spec).toHaveProperty('nodes');
    expect(typeof spec.screen).toBe('string');
    expect(typeof spec.width).toBe('number');
    expect(typeof spec.nodes).toBe('object');

    // Every node has the required parent + order fields
    for (const [_id, node] of Object.entries(spec.nodes)) {
      expect(node).toHaveProperty('parent');
      expect(node).toHaveProperty('order');
      expect(typeof node.order).toBe('number');
      // parent is string | null
      if (node.parent !== null) {
        expect(typeof node.parent).toBe('string');
      }
    }

    // Validate the spec (catalog validation may warn about missing entries,
    // but structural validation should pass without errors)
    const validation = validateDesignSpec(spec, V2_BUILTIN_CATALOG);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Render to Penpot script — should produce a non-empty script
    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(typeof result.script).toBe('string');
    expect(result.script.length).toBeGreaterThan(0);
    // Script should contain Penpot API calls (createBoard is the primary shape API)
    expect(result.script).toContain('penpot.createBoard');
  });
});
