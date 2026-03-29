/**
 * Mock CompletionResult for the planning stage.
 * Captured from a real pipeline run (zen-model / session-picker).
 * Used by `--mock` flag to skip LLM calls during development.
 */
export const mockPlanningResult = {
  ok: true as const,
  value: {
    content: JSON.stringify({
      specRef: 'spec-mock-module-0000000000000',
      moduleId: 'mock-module',
      componentTree: [
        {
          name: 'PageLayout',
          props: ['maxWidth', 'paddingX', 'paddingY', 'gap', 'background'],
          children: ['Header', 'ContentSection', 'ActionButton'],
        },
        {
          name: 'Header',
          props: ['height', 'background'],
          children: ['Title', 'Subtitle'],
        },
        {
          name: 'ContentSection',
          props: ['gap', 'padding'],
          children: ['CardGroup'],
        },
        {
          name: 'CardGroup',
          props: ['gap', 'direction'],
          children: ['Card'],
        },
        {
          name: 'Card',
          props: ['padding', 'radius', 'background', 'borderColor', 'elevation'],
          children: ['CardTitle', 'CardDescription'],
        },
        {
          name: 'ActionButton',
          props: ['height', 'background', 'textColor', 'radius', 'width'],
          children: [],
        },
      ],
      tokenBindings: {
        'PageLayout.background': 'colors.semantic.background-primary',
        'Header.background': 'transparent',
        'Card.background': 'colors.semantic.surface-elevated',
        'Card.borderColor': 'colors.semantic.border-default',
        'Card.radius': 'borders.radius.large',
        'ActionButton.background': 'colors.semantic.cta-primary',
        'ActionButton.textColor': 'colors.semantic.text-on-cta',
        'ActionButton.radius': 'borders.radius.medium',
      },
      responsiveRules: [
        {
          breakpoint: 420,
          changes: [
            { component: 'PageLayout', prop: 'paddingX', value: '16px' },
          ],
        },
      ],
      screens: [
        {
          screenId: 'default',
          name: 'Default State',
          description: 'Initial page state with no selections',
          componentOverrides: {},
        },
      ],
    }),
    toolCalls: [],
    usage: { inputTokens: 8000, outputTokens: 2000 },
    cost: {
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      model: 'mock',
      timestamp: new Date().toISOString(),
    },
    model: 'mock',
    latencyMs: 0,
    finishReason: 'stop' as const,
  },
};
