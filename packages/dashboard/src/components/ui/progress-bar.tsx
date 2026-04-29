'use client';

import React from 'react';
import { Progress, Group, Text } from '@mantine/core';

export interface ProgressBarProps {
  value: number;
  color?: string;
  showLabel?: boolean;
  className?: string;
}

function resolveColor(value: number, color?: string): string {
  if (color) return color;
  if (value >= 85) return 'red';
  if (value >= 60) return 'yellow';
  return 'green';
}

export function ProgressBar({
  value,
  color,
  showLabel = false,
  className = '',
}: ProgressBarProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = resolveColor(clamped, color);

  if (showLabel) {
    return (
      <Group gap="xs" className={className}>
        <Progress value={clamped} color={barColor} size="sm" style={{ flex: 1 }} />
        <Text size="xs" c="dimmed" w={40} ta="right">
          {Math.round(clamped)}%
        </Text>
      </Group>
    );
  }

  return (
    <Progress value={clamped} color={barColor} size="sm" className={className} />
  );
}
