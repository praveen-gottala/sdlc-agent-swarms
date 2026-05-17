import { debugLog } from '@agentforge/core';
import type { ToolDefinition } from '@agentforge/providers';

export const reportAssumptionViolationDefinition: ToolDefinition = {
  name: 'report_assumption_violation',
  description: 'Report a conflict between the task implementation and an assumption in the assumption ledger. The Reviewer will validate this.',
  parameters: {
    type: 'object',
    properties: {
      assumptionId: {
        type: 'string',
        description: 'ID of the assumption from the assumption ledger that is violated',
      },
      evidence: {
        type: 'string',
        description: 'Concrete evidence of the violation (file path, code snippet, or description)',
      },
    },
    required: ['assumptionId', 'evidence'],
  },
};

export function executeReportAssumptionViolation(
  args: Record<string, unknown>,
): string {
  const assumptionId = String(args.assumptionId ?? '');
  const evidence = String(args.evidence ?? '');

  debugLog(`assumption-violation: ${assumptionId} — ${evidence}`);

  return `Assumption violation recorded: ${assumptionId}. The Reviewer will validate this finding.`;
}
