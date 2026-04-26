/**
 * Renderer design constraints — documents how catalog components render
 * as simplified or placeholder versions in the design preview.
 *
 * Consumed by the vision evaluator prompt so the LLM doesn't penalize
 * design-time rendering limitations.
 */

export interface RendererConstraint {
  readonly catalog: string;
  readonly rendering: string;
  readonly evaluatorGuidance: string;
}

export const RENDERER_CONSTRAINTS: readonly RendererConstraint[] = [
  {
    catalog: 'image|illustration',
    rendering: 'Dashed-border box with centered icon and alt text',
    evaluatorGuidance: 'Image placeholders are EXPECTED. Score as present and correctly positioned. Only deduct if missing, overlapping, or wrong dimensions.',
  },
  {
    catalog: 'icon (unresolved)',
    rendering: 'Dashed-border box with "?" at 50% opacity',
    evaluatorGuidance: 'Unknown icon names render as "?" placeholder. Do not deduct for missing icon graphic.',
  },
  {
    catalog: 'radio',
    rendering: 'Plain text labels without radio circle indicators',
    evaluatorGuidance: 'Radio buttons render as text labels only. Do not deduct for missing radio circle UI.',
  },
  {
    catalog: 'textarea',
    rendering: 'Generic div container, not a multi-line input',
    evaluatorGuidance: 'Textarea renders as a plain container. Do not deduct for missing textarea styling or input appearance.',
  },
  {
    catalog: 'switch|toggle',
    rendering: 'Custom animated div with track and thumb, not native input',
    evaluatorGuidance: 'Switch/toggle is a custom visual div. Accept as valid if track+thumb shape is present.',
  },
  {
    catalog: 'pagination',
    rendering: 'Always shows pages 1-3 with page 1 active',
    evaluatorGuidance: 'Pagination is hardcoded to 3 pages. Do not deduct for page count or active state.',
  },
  {
    catalog: 'tabs',
    rendering: 'Inline text spans with active underline, no panel switching',
    evaluatorGuidance: 'Tabs are simplified visual labels. Do not deduct for missing tab panel content switching.',
  },
  {
    catalog: 'stepper',
    rendering: 'Text "-" and "+" characters, not styled buttons',
    evaluatorGuidance: 'Stepper uses plain text for controls. Accept if +/- and value are visible.',
  },
  {
    catalog: 'segmented-control',
    rendering: 'Div-based options, not native button group',
    evaluatorGuidance: 'Segmented control uses divs for options. Accept if options are visible with selection highlight.',
  },
  {
    catalog: '(unknown catalog)',
    rendering: 'Generic flex container with children or text label',
    evaluatorGuidance: 'Unknown catalog components render as generic containers. Do not deduct for simplified appearance.',
  },
];

export function buildEvaluatorConstraintsPrompt(): string {
  return `\nRenderer design constraints (do NOT deduct points for these — they are design-time preview limitations):\n` +
    RENDERER_CONSTRAINTS.map(c => `- ${c.catalog}: ${c.evaluatorGuidance}`).join('\n');
}
