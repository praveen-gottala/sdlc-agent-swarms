/**
 * @module @agentforge/designspec-renderer/sdk/submit-design-delta-tool
 *
 * Tool definition for structured DesignSpecDelta output (brownfield MODIFY path).
 * Used with `tool_choice: { type: 'tool', name: 'submit_design_delta' }` to force
 * the LLM to produce a delta (not a full spec) for existing screen modifications.
 *
 * The schema is intentionally relaxed (flat z.record-equivalent for node data)
 * because strict mode budgets are tight. Post-hoc validation with
 * `DesignSpecDeltaSchema` (from @agentforge/core) catches structural errors
 * after the LLM responds.
 */

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export const SUBMIT_DESIGN_DELTA_TOOL: ToolDefinition = {
  name: 'submit_design_delta',
  description:
    'Submit a delta describing changes to an existing design specification. Only include nodes that are added, modified, removed, or reordered. Unchanged nodes are preserved automatically.',
  parameters: {
    type: 'object',
    properties: {
      screenId: {
        type: 'string',
        description:
          'Screen name identifier of the existing screen being modified (kebab-case, e.g. "dashboard", "add-expense").',
      },
      baseWidth: {
        type: 'number',
        description: 'Screen width in pixels (must match the existing spec width).',
      },
      added: {
        type: 'object',
        description:
          'New nodes to add. Map of node ID -> NodeSpec. Each node must reference an existing or newly added parent.',
        additionalProperties: {
          type: 'object',
          properties: {
            parent: {
              description: 'Parent node ID (must exist in the existing spec or in added nodes).',
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            order: {
              type: 'integer',
              description: 'Sibling order (0-based).',
            },
          },
          required: ['parent', 'order'],
        },
      },
      modified: {
        type: 'object',
        description:
          'Existing nodes to modify. Map of node ID -> partial NodeSpec with only the changed fields. Unmentioned fields are preserved.',
        additionalProperties: {
          type: 'object',
        },
      },
      removed: {
        type: 'array',
        description: 'Node IDs to remove from the existing spec. Descendants are cascade-removed.',
        items: { type: 'string' },
      },
      reordered: {
        type: 'array',
        description: 'Nodes to reorder (change parent or sibling order without modifying other properties).',
        items: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Existing node ID to reorder.' },
            newParent: { type: 'string', description: 'New parent node ID (omit to keep current parent).' },
            newOrder: { type: 'integer', description: 'New sibling order (omit to keep current order).' },
          },
          required: ['nodeId'],
        },
      },
    },
    required: ['screenId', 'baseWidth', 'added', 'modified', 'removed', 'reordered'],
  },
} as const;
