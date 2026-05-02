'use client';

import { Box } from '@mantine/core';

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--color-accent-blue)',
  pending: 'var(--color-accent-orange)',
  complete: 'var(--color-accent-green)',
  failed: 'var(--color-accent-red)',
};

interface RunStatusDotProps {
  status: string;
  size?: number;
}

export function RunStatusDot({ status, size = 8 }: RunStatusDotProps): React.JSX.Element {
  const color = STATUS_COLORS[status] ?? 'var(--color-text-muted)';
  const isAnimated = status === 'running';

  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: isAnimated ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      }}
      title={status}
    />
  );
}
