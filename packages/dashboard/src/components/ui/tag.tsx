'use client';

import React from 'react';
import { Badge as MantineBadge, Box } from '@mantine/core';

export interface TagProps {
  color?: string;
  children: React.ReactNode;
  className?: string;
}

const COLOR_MAP: Record<string, string> = {
  green: 'green',
  orange: 'orange',
  yellow: 'yellow',
  red: 'red',
  purple: 'violet',
  blue: 'blue',
  cyan: 'cyan',
  teal: 'teal',
};

export function Tag({ color, children, className = '' }: TagProps): React.ReactElement {
  const mantineColor = color && color in COLOR_MAP ? COLOR_MAP[color] : 'gray';

  return (
    <MantineBadge
      variant="light"
      color={mantineColor}
      size="sm"
      radius="xl"
      className={className}
      leftSection={
        <Box
          w={6}
          h={6}
          style={{ borderRadius: '50%', backgroundColor: `var(--mantine-color-${mantineColor}-6)` }}
        />
      }
    >
      {children}
    </MantineBadge>
  );
}
