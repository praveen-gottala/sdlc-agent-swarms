'use client';

import { Paper, Text, Group, Stack, Timeline, Badge, Box } from '@mantine/core';
import { IconCheck, IconX, IconClock } from '@tabler/icons-react';

interface StageTiming {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

interface RunDetailPanelProps {
  run: {
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
    stageTimings: Record<string, StageTiming> | null;
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function totalDuration(startedAt: string, completedAt: string | null): string {
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  return formatDuration(end - new Date(startedAt).getTime());
}

export function RunDetailPanel({ run }: RunDetailPanelProps): React.JSX.Element {
  const timings = run.stageTimings ?? {};
  const stageEntries = Object.entries(timings);

  return (
    <Paper
      p="md"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <Stack gap="md">
        {/* Summary row */}
        <Group gap="lg" wrap="wrap">
          <Box>
            <Text size="xs" c="var(--color-text-muted)">Duration</Text>
            <Text size="sm" fw={500} c="var(--color-text-primary)">
              {totalDuration(run.startedAt, run.completedAt)}
            </Text>
          </Box>
          {run.cost && (
            <Box>
              <Text size="xs" c="var(--color-text-muted)">Cost</Text>
              <Text size="sm" fw={500} c="var(--color-text-primary)">
                ${run.cost.totalCostUsd.toFixed(4)}
              </Text>
            </Box>
          )}
          {run.cost && (
            <Box>
              <Text size="xs" c="var(--color-text-muted)">Tokens</Text>
              <Text size="sm" fw={500} c="var(--color-text-primary)">
                {run.cost.tokensUsed.toLocaleString()}
              </Text>
            </Box>
          )}
          {run.agentRole && (
            <Box>
              <Text size="xs" c="var(--color-text-muted)">Agent</Text>
              <Text size="sm" fw={500} c="var(--color-text-primary)">
                {run.agentRole}
              </Text>
            </Box>
          )}
        </Group>

        {/* Stage timeline */}
        {stageEntries.length > 0 && (
          <Box>
            <Text size="xs" fw={600} c="var(--color-text-muted)" mb="xs">
              Stage timeline
            </Text>
            <Timeline
              active={stageEntries.length - 1}
              bulletSize={20}
              lineWidth={1}
              styles={{
                itemTitle: { fontSize: 13 },
                itemBody: { paddingLeft: 4 },
              }}
            >
              {stageEntries.map(([name, timing]) => (
                <Timeline.Item
                  key={name}
                  bullet={timing.completedAt ? <IconCheck size={12} /> : <IconClock size={12} />}
                  title={name}
                >
                  <Group gap="xs">
                    {timing.durationMs != null && (
                      <Badge size="xs" variant="light" color="gray">
                        {formatDuration(timing.durationMs)}
                      </Badge>
                    )}
                    {!timing.completedAt && (
                      <Badge size="xs" variant="light" color="blue">
                        In progress
                      </Badge>
                    )}
                  </Group>
                </Timeline.Item>
              ))}
            </Timeline>
          </Box>
        )}

        {/* Error display */}
        {run.error && (
          <Paper
            p="sm"
            style={{
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: 6,
            }}
          >
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <IconX size={14} style={{ color: 'var(--color-accent-red)', marginTop: 2, flexShrink: 0 }} />
              <Text size="xs" c="var(--color-accent-red)" style={{ wordBreak: 'break-word' }}>
                {run.error}
              </Text>
            </Group>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
}
