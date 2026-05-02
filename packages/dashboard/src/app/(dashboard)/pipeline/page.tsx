'use client';

import { useState, useEffect } from 'react';
import { Group, Text, Stack, Skeleton, Box } from '@mantine/core';
import { SpineRail } from '@/components/spine/spine-rail';
import { SPINE_STAGES } from '@/components/spine/spine-constants';
import { RunHistoryTable } from '@/components/runs/run-history-table';
import { EmergencyControls } from '@/components/runs/emergency-controls';

interface RunData {
  runId: string;
  type: string;
  status: string;
  stage: string | null;
  stageDescription: string | null;
  agentRole: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  cost: { totalCostUsd: number; tokensUsed: number } | null;
  stageTimings: Record<string, { startedAt: string; completedAt?: string; durationMs?: number }> | null;
}

interface PageData {
  runs: RunData[];
  hasActiveRun: boolean;
  activeStageIdx: number;
  pendingApprovals: number;
}

export default function RunsPage(): React.JSX.Element {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/runs?limit=30').then((r) => r.json()).catch(() => ({ runs: [] })),
      fetch('/api/approvals').then((r) => r.json()).catch(() => ({ total: 0 })),
    ]).then(([runsData, approvalsData]) => {
      const runs: RunData[] = (runsData as { runs?: RunData[] }).runs ?? [];
      const activeRun = runs.find((r) => r.status === 'running' || r.status === 'pending') ?? null;
      const activeStageIdx = activeRun
        ? SPINE_STAGES.findIndex((s) => activeRun.stage?.toLowerCase().includes(s.key))
        : -1;

      setData({
        runs,
        hasActiveRun: activeRun !== null,
        activeStageIdx,
        pendingApprovals: (approvalsData as { total?: number }).total ?? 0,
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Stack gap="xl" p="xl" maw={900} mx="auto" mt={40}>
        <Skeleton height={28} width={100} />
        <Skeleton height={14} width={200} />
        <Skeleton height={60} radius="md" mt="xl" />
        <Skeleton height={200} radius="md" />
      </Stack>
    );
  }

  if (!data) return <></>;

  return (
    <Stack gap={28} p="xl" maw={900} mx="auto" mt={16}>
      {/* Header */}
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Text
            fw={700}
            c="var(--color-text-primary)"
            style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: -0.3 }}
            data-testid="runs-page-heading"
          >
            Runs
          </Text>
          <Text size="sm" c="var(--color-text-muted)" mt={4}>
            Spine execution history
          </Text>
        </Box>
        <EmergencyControls hasActiveRun={data.hasActiveRun} />
      </Group>

      {/* Spine stage rail */}
      <Box
        py="md"
        style={{
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
        }}
        data-testid="spine-rail"
      >
        <SpineRail
          activeStage={data.activeStageIdx}
          variant="detailed"
          pendingApprovals={data.pendingApprovals}
        />
      </Box>

      {/* Run history */}
      <Box>
        <Text size="xs" fw={600} c="var(--color-text-muted)" mb="sm" tt="uppercase" style={{ letterSpacing: 0.5 }}>
          Run history
        </Text>
        <RunHistoryTable runs={data.runs} />
      </Box>
    </Stack>
  );
}
