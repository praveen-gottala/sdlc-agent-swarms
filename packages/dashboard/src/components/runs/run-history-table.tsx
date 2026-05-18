'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Text, Group, Stack, Button, UnstyledButton, Collapse } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { RunStatusDot } from './run-status-dot';
import { RunDetailPanel } from './run-detail-panel';

const RUN_TYPE_LABELS: Record<string, string> = {
  init: 'Project Init',
  clarifier: 'Clarification',
  architect: 'Architecture',
  'design-generate': 'Spec Generation',
  'design-penpot': 'Design Pipeline',
  'design-browser': 'Browser Design',
  'design-chat-iterate': 'Chat Iteration',
  implementer: 'Implementation',
  reviewer: 'Code Review',
};

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

interface RunHistoryTableProps {
  runs: RunData[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  if (ms < 1000) return '<1s';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function RunRow({ run }: { run: RunData }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const isActive = run.status === 'running' || run.status === 'pending';

  return (
    <Box data-testid={`run-row-${run.runId}`}>
      <UnstyledButton
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '12px 16px',
          borderRadius: 8,
          border: `1px solid ${isActive ? 'var(--color-accent-blue)' : 'var(--color-border)'}`,
          borderLeftWidth: isActive ? 3 : 1,
          borderLeftColor: isActive ? 'var(--color-accent-blue)' : undefined,
          background: 'var(--color-bg-card)',
          transition: 'border-color 0.15s ease',
          gap: 16,
        }}
        styles={{
          root: {
            '&:hover': {
              borderColor: 'var(--color-border-bright)',
            },
          },
        }}
      >
        {/* Status dot */}
        <RunStatusDot status={run.status} />

        {/* Type */}
        <Box style={{ flex: '1 1 160px', minWidth: 100 }}>
          <Text size="sm" fw={500} c="var(--color-text-primary)" truncate="end">
            {RUN_TYPE_LABELS[run.type] ?? run.type.replace(/-/g, ' ')}
          </Text>
        </Box>

        {/* Stage */}
        <Box style={{ flex: '1 1 140px', minWidth: 80 }} visibleFrom="sm">
          <Text size="xs" c="var(--color-text-secondary)" truncate="end">
            {run.stageDescription ?? run.stage ?? '—'}
          </Text>
        </Box>

        {/* Started */}
        <Box style={{ flex: '0 0 80px' }} visibleFrom="md">
          <Text size="xs" c="var(--color-text-muted)">
            {timeAgo(run.startedAt)}
          </Text>
        </Box>

        {/* Duration */}
        <Box style={{ flex: '0 0 70px' }} visibleFrom="md">
          <Text size="xs" c="var(--color-text-muted)" ff="monospace">
            {formatDuration(run.startedAt, run.completedAt)}
          </Text>
        </Box>

        {/* Cost */}
        <Box style={{ flex: '0 0 70px' }} visibleFrom="lg">
          <Text size="xs" c="var(--color-text-muted)" ff="monospace">
            {run.cost ? `$${run.cost.totalCostUsd.toFixed(3)}` : '—'}
          </Text>
        </Box>

        {/* Expand chevron */}
        <Box style={{ flex: '0 0 20px', display: 'flex', alignItems: 'center' }}>
          {expanded
            ? <IconChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />
            : <IconChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />}
        </Box>
      </UnstyledButton>

      <Collapse expanded={expanded}>
        <Box pt="xs">
          <RunDetailPanel run={run} />
        </Box>
      </Collapse>
    </Box>
  );
}

export function RunHistoryTable({ runs }: RunHistoryTableProps): React.JSX.Element {
  if (runs.length === 0) {
    return (
      <Stack
        align="center"
        gap="md"
        py={60}
        data-testid="runs-empty-state"
      >
        <Text size="lg" fw={600} c="var(--color-text-secondary)">
          No pipeline runs yet
        </Text>
        <Text size="sm" c="var(--color-text-muted)" ta="center" maw={360}>
          Start a clarification from the New Project page to create your first run.
        </Text>
        <Button
          component={Link}
          href="/new"
          variant="outline"
          color="gray"
          size="sm"
          leftSection={<IconPlus size={14} />}
        >
          New Project
        </Button>
      </Stack>
    );
  }

  {/* Column headers */}
  return (
    <Stack gap="xs" data-testid="run-history-table">
      <Group
        gap={16}
        px={16}
        style={{ opacity: 0.6 }}
        wrap="nowrap"
      >
        <Box style={{ width: 8 }} />
        <Text size="xs" fw={600} c="var(--color-text-muted)" style={{ flex: '1 1 160px' }}>
          Type
        </Text>
        <Text size="xs" fw={600} c="var(--color-text-muted)" style={{ flex: '1 1 140px' }} visibleFrom="sm">
          Stage
        </Text>
        <Text size="xs" fw={600} c="var(--color-text-muted)" style={{ flex: '0 0 80px' }} visibleFrom="md">
          Started
        </Text>
        <Text size="xs" fw={600} c="var(--color-text-muted)" style={{ flex: '0 0 70px' }} visibleFrom="md">
          Duration
        </Text>
        <Text size="xs" fw={600} c="var(--color-text-muted)" style={{ flex: '0 0 70px' }} visibleFrom="lg">
          Cost
        </Text>
        <Box style={{ width: 20 }} />
      </Group>

      {runs.map((run) => (
        <RunRow key={run.runId} run={run} />
      ))}
    </Stack>
  );
}
