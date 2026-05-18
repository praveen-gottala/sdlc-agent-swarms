'use client';

import { useEffect, useState } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { ProgressRing } from './progress-ring';

const STAGE_DESCRIPTIONS: Record<string, string[]> = {
  Research: [
    'Analyzing page requirements...',
    'Studying existing design patterns...',
    'Gathering UX best practices...',
  ],
  Planning: [
    'Structuring component hierarchy...',
    'Defining layout grid and spacing...',
    'Planning interaction states...',
  ],
  Design: [
    'Generating visual design spec...',
    'Composing responsive layouts...',
    'Applying brand colors and typography...',
  ],
  Clarify: [
    'Analyzing your requirements...',
    'Identifying gaps and ambiguities...',
    'Generating targeted questions...',
  ],
  Architect: [
    'Exploring technical options...',
    'Designing API contracts...',
    'Structuring the task plan...',
  ],
  Implement: [
    'Generating application code...',
    'Wiring database schemas...',
    'Building API endpoints...',
  ],
  Review: [
    'Running code quality checks...',
    'Analyzing test coverage...',
    'Reviewing architectural decisions...',
  ],
};

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

interface StageDetailCardProps {
  stageName: string;
  stageDescription: string | null;
  startedAt: string | null;
  cost: { totalCostUsd: number; tokensUsed: number } | null;
  progress: { current: number; total: number } | null;
  estimatedRemainingMs?: number | null;
  stageColor?: string;
}

export function StageDetailCard({
  stageName,
  stageDescription,
  startedAt,
  cost,
  progress,
  estimatedRemainingMs,
  stageColor = 'var(--color-accent-indigo)',
}: StageDetailCardProps): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  const [descIdx, setDescIdx] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const descriptions = STAGE_DESCRIPTIONS[stageName] ?? STAGE_DESCRIPTIONS['Research']!;

  useEffect(() => {
    const timer = setInterval(() => {
      setDescIdx((prev) => (prev + 1) % descriptions.length);
    }, 4_000);
    return () => clearInterval(timer);
  }, [descriptions.length]);

  const progressPct = progress
    ? (progress.current / Math.max(progress.total, 1)) * 100
    : null;

  return (
    <Box
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '20px 24px',
        maxWidth: 420,
        width: '100%',
        animation: 'fade-in 0.3s ease-out forwards',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={8} style={{ flex: 1 }}>
          {/* Stage name with live dot */}
          <Group gap={8} align="center">
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: stageColor,
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }}
            />
            <Text size="sm" fw={600} c="var(--color-text-primary)">
              {stageName}
            </Text>
            {startedAt && (
              <Text
                size="xs"
                c="var(--color-text-muted)"
                ff="monospace"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatElapsed(elapsed)}
              </Text>
            )}
          </Group>

          {/* ETA */}
          {estimatedRemainingMs != null && estimatedRemainingMs > 0 && (
            <Text size="xs" c="var(--color-text-dim)" ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
              ~{formatElapsed(estimatedRemainingMs)} remaining
            </Text>
          )}

          {/* Sub-stage description */}
          {stageDescription && (
            <Text size="xs" c="var(--color-text-secondary)" truncate>
              {stageDescription}
            </Text>
          )}

          {/* Rotating contextual description */}
          <Text
            size="xs"
            c="var(--color-text-muted)"
            key={descIdx}
            style={{ animation: 'fadeSlideUp 0.3s ease-out', minHeight: 18 }}
          >
            {descriptions[descIdx]}
          </Text>

          {/* Cost counter */}
          {cost && cost.totalCostUsd > 0 && (
            <Group gap={12}>
              <Text
                size="xs"
                c="var(--color-accent-emerald)"
                ff="monospace"
                fw={600}
                style={{ fontVariantNumeric: 'tabular-nums', animation: 'cost-tick 0.3s ease-out' }}
              >
                ${cost.totalCostUsd.toFixed(4)}
              </Text>
              <Text size="xs" c="var(--color-text-dim)">
                {cost.tokensUsed.toLocaleString()} tokens
              </Text>
            </Group>
          )}
        </Stack>

        {/* Progress ring */}
        {progressPct !== null && (
          <ProgressRing progress={progressPct} size={56} strokeWidth={3} />
        )}
      </Group>
    </Box>
  );
}
