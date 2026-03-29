/**
 * Mock CompletionResult for the research stage.
 * Captured from a real pipeline run (zen-model / session-picker).
 * Used by `--mock` flag to skip LLM calls during development.
 */
export const mockResearchResult = {
  ok: true as const,
  value: {
    content: JSON.stringify({
      briefId: 'brief-mock-module-0000000000000',
      moduleId: 'mock-module',
      requirementIds: ['REQ-001', 'REQ-002'],
      designConstraints: [
        'Single centered column layout with max-width 420px',
        'Base spacing unit is 8px; all internal padding and gaps must snap to this scale',
        'Card radius 16px, button radius 12px, chip radius pill/9999, input radius 8px',
        'Primary CTA color mapped to project token cta-primary',
        'Typography: display headings use heading-2 scale (24px/700); body uses project font families',
        'All interactive elements must meet minimum touch target of 44x44px',
      ],
      referencePatterns: [
        'Single-select card group pattern with selected/unselected visual states',
        'Chip row single-select pattern with active fill and inactive outline states',
        'Full-width primary CTA button pattern: 56px height, full column width',
      ],
      accessibilityRequirements: [
        'WCAG 2.1 AA color contrast ratio minimum 4.5:1 for all body text',
        'All interactive elements must have minimum 44x44px tap targets',
        'Focus ring: 2px solid accent outline with 2px offset on all interactive elements',
      ],
      dataModelDependencies: [
        'Primary entity with fields id, name, description used to render card list',
        'User preferences entity driving toggle states and settings',
      ],
    }),
    toolCalls: [],
    usage: { inputTokens: 5000, outputTokens: 1200 },
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
