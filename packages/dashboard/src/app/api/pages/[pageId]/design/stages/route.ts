import { NextResponse } from 'next/server';
import { getRunStatus, listRuns } from '../../../../_lib/run-manager';

interface StageInfo {
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  duration: number | null;
  cost: number | null;
}

const PIPELINE_STAGES = [
  { name: 'Research', agent: 'ux_research' },
  { name: 'Planning', agent: 'ux_planning' },
  { name: 'Design', agent: 'ux_design' },
];

/**
 * GET /api/pages/[pageId]/design/stages
 * Returns stage-by-stage status for the design pipeline.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  // Find the most recent design-penpot run for this page
  const runs = listRuns({ type: 'design-penpot', limit: 10 });
  const run = runs.find(
    (r) => r.params.pageId === pageId,
  );

  if (!run) {
    // No pipeline run found — return all pending
    const stages: StageInfo[] = PIPELINE_STAGES.map((s) => ({
      ...s,
      status: 'pending' as const,
      duration: null,
      cost: null,
    }));
    return NextResponse.json({ stages, runId: null });
  }

  // Get fresh run status
  const current = getRunStatus(run.runId) ?? run;

  // Build stage status from run progress
  const currentStageIndex = current.progress?.current ?? 0;
  const stages: StageInfo[] = PIPELINE_STAGES.map((s, idx) => {
    let status: StageInfo['status'] = 'pending';

    if (current.status === 'failed' && idx === currentStageIndex - 1) {
      status = 'failed';
    } else if (idx < currentStageIndex) {
      status = 'complete';
    } else if (idx === currentStageIndex && current.status === 'running') {
      status = 'running';
    } else if (current.status === 'complete') {
      status = 'complete';
    }

    return {
      ...s,
      status,
      duration: status === 'complete' ? null : null, // Could be computed from timestamps
      cost: status === 'complete' && current.cost ? current.cost.totalCostUsd / PIPELINE_STAGES.length : null,
    };
  });

  return NextResponse.json({ stages, runId: run.runId });
}
