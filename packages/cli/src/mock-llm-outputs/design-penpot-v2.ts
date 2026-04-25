/**
 * Mock CompletionResult for the design-penpot-v2 stage.
 * Returns a submit_design tool call with a minimal DesignSpec V2.
 * Used by `--mock` flag to skip LLM calls during development.
 */
export const mockDesignPenpotV2Result = {
  ok: true as const,
  value: {
    content: '',
    toolCalls: [
      {
        id: 'mock-tool-call-001',
        name: 'submit_design',
        args: {
          screen: 'mock-dashboard',
          width: 420,
          viewport_width: 420,
          nodes: {
            root: {
              type: 'frame',
              parent: null,
              order: 0,
              width: 420,
              height: 800,
              background: 'background-primary',
            },
            heading: {
              type: 'text',
              parent: 'root',
              order: 1,
              text: 'Good morning',
              size: 'heading-2',
            },
            subtitle: {
              type: 'text',
              parent: 'root',
              order: 2,
              text: 'Choose your session type',
              size: 'body',
            },
            cta: {
              type: 'button',
              parent: 'root',
              order: 3,
              label: 'Start Session',
              variant: 'primary',
            },
          },
        },
      },
    ],
    usage: { inputTokens: 12000, outputTokens: 3000 },
    cost: {
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      model: 'mock',
      timestamp: new Date().toISOString(),
    },
    model: 'mock',
    latencyMs: 0,
    finishReason: 'tool_use' as const,
  },
};
