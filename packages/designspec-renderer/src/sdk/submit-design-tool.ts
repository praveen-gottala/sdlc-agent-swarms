/**
 * @module @agentforge/designspec-renderer/sdk/submit-design-tool
 *
 * Tool definition for structured DesignSpec v2 output.
 * Used with `tool_choice: { type: 'tool', name: 'submit_design' }` to force
 * the LLM to produce a valid DesignSpecV2 via Anthropic's tool use mechanism.
 *
 * STRICT MODE BUDGET:
 * - NodeSpec uses 21 of 24 optional fields (safe headroom)
 * - layout sub-object: 1 required + 13 optional (dir + display/columns/wrap/gap/align/justify/px/py/pt/pb)
 * - 2 union types: AcceleratorType (7 members), width (number | 'fill') — well under 16 limit
 * - Zero recursion
 */

/** Shape of a tool definition passed to the Anthropic API `tools` array. */
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * Tool definition for structured DesignSpec v2 output.
 * Used with `tool_choice: { type: 'tool', name: 'submit_design' }` to force
 * the LLM to produce a valid DesignSpecV2 via Anthropic's tool use mechanism.
 */
export const SUBMIT_DESIGN_TOOL: ToolDefinition = {
  name: 'submit_design',
  description:
    'Submit the complete design specification as a flat node adjacency list. Every visual element must be a node in the nodes map with correct parent references and sibling ordering.',
  parameters: {
    type: 'object',
    properties: {
      screen: {
        type: 'string',
        description:
          'Screen name identifier (kebab-case, e.g. "bill-entry", "dashboard-overview")',
      },
      width: {
        type: 'number',
        description: 'Screen width in pixels (e.g. 1440)',
      },
      screenType: {
        type: 'string',
        enum: ['page', 'modal', 'drawer', 'sheet'],
        description: 'Screen type. Defaults to "page". Overlays (modal/drawer/sheet) are designed at narrower viewports and rendered as overlays in the prototype.',
      },
      nodes: {
        type: 'object',
        description:
          'Flat map of node ID -> NodeSpec. Keys are kebab-case identifiers (e.g. "page-root", "header-section", "amount-input").',
        additionalProperties: {
          type: 'object',
          properties: {
            parent: {
              description:
                'Parent node ID, or null for the root node. Exactly one node must have null parent.',
              oneOf: [{ type: 'string' }, { type: 'null' }],
            },
            order: {
              type: 'integer',
              description:
                'Sibling order (0-based). Children of the same parent are sorted by this field.',
            },
            type: {
              type: 'string',
              enum: [
                'page',
                'container',
                'section',
                'header',
                'divider',
                'spacer',
                'text',
              ],
              description:
                'Inline accelerator type. Use this for structural/layout primitives. Mutually exclusive with catalog.',
            },
            catalog: {
              type: 'string',
              description:
                'Catalog entry reference (e.g. "button-primary", "input-text"). Use this for design-system components. Mutually exclusive with type.',
            },
            label: {
              type: 'string',
              description: 'Display label for the node.',
            },
            content: {
              type: 'string',
              description:
                'Text content for text nodes or descriptive content.',
            },
            value: {
              description: 'Current value for inputs, sliders, etc.',
              oneOf: [{ type: 'string' }, { type: 'number' }],
            },
            placeholder: {
              type: 'string',
              description: 'Placeholder text for inputs.',
            },
            helper: {
              type: 'string',
              description: 'Helper text displayed below the node.',
            },
            title: {
              type: 'string',
              description: 'Title text for the node.',
            },
            options: {
              type: 'array',
              description: 'Options for segmented controls.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  selected: { type: 'boolean' },
                },
                required: ['label', 'selected'],
              },
            },
            layout: {
              type: 'object',
              description: 'Layout configuration for container nodes. Supports flex (default) and CSS grid modes.',
              properties: {
                dir: { type: 'string', enum: ['row', 'column'] },
                display: {
                  type: 'string',
                  enum: ['flex', 'grid'],
                  description: 'Layout mode. Default: flex. Use grid for multi-column card grids.',
                },
                columns: {
                  type: 'integer',
                  description: 'Number of equal grid columns (only with display: grid). E.g. 3 for a 3-column card grid.',
                },
                wrap: {
                  type: 'boolean',
                  description: 'Enable flex wrapping (only with display: flex). Wraps children to next line.',
                },
                gap: { type: 'number', description: 'Gap between children in px.' },
                align: {
                  type: 'string',
                  enum: ['start', 'center', 'end', 'stretch'],
                },
                justify: {
                  type: 'string',
                  enum: ['start', 'center', 'end', 'space-between'],
                },
                px: { type: 'number', description: 'Horizontal padding in px.' },
                py: { type: 'number', description: 'Vertical padding in px.' },
                pt: { type: 'number', description: 'Top padding in px.' },
                pb: { type: 'number', description: 'Bottom padding in px.' },
              },
              required: ['dir'],
            },
            width: {
              description:
                'Width of the node (number in px or "fill" for flex fill).',
              oneOf: [{ type: 'number' }, { type: 'string', enum: ['fill'] }],
            },
            height: {
              type: 'number',
              description: 'Height of the node in px.',
            },
            typography: {
              type: 'string',
              description:
                'Typography role reference (e.g. "heading-1", "body", "label").',
            },
            color: {
              type: 'string',
              description:
                'Text color semantic token (e.g. "text-primary", "text-secondary").',
            },
            weight: {
              type: 'integer',
              description:
                'Font weight override (e.g. 400, 500, 600, 700).',
            },
            background: {
              type: 'string',
              description:
                'Background color semantic token (e.g. "background-primary", "surface-primary").',
            },
            shadow: {
              type: 'string',
              description:
                'Shadow elevation reference (e.g. "sm", "md", "lg").',
            },
            radius: {
              type: 'number',
              description: 'Border radius in px.',
            },
            textAlign: {
              type: 'string',
              enum: ['left', 'center', 'right'],
              description: 'Text alignment.',
            },
            navigateTo: {
              type: 'string',
              description:
                'Target page ID for navigation. Copy this from the planning output ComponentTreeNode.navigateTo. When set, this node acts as a clickable navigation trigger in the prototype.',
            },
            overrides: {
              type: 'object',
              description:
                'Arbitrary overrides applied on top of catalog defaults (e.g. { "border_color": "cta-primary", "border_width": 2 }).',
            },
            items: {
              type: 'array',
              description: 'Data items for list/repeater components.',
              items: { type: 'object' },
            },
          },
          required: ['parent', 'order'],
        },
      },
    },
    required: ['screen', 'width', 'nodes'],
  },
} as const;
