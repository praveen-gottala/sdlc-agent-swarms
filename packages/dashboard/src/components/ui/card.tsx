'use client';

import React from 'react';
import { Paper, Box } from '@mantine/core';

export interface CardProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  hover?: boolean;
  className?: string;
}

export function Card({
  children,
  header,
  hover = false,
  className = '',
}: CardProps): React.ReactElement {
  return (
    <Paper
      withBorder
      radius="md"
      className={className}
      style={hover ? { transition: 'border-color 150ms ease' } : undefined}
      onMouseEnter={hover ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--mantine-color-gray-5)'; } : undefined}
      onMouseLeave={hover ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; } : undefined}
    >
      {header != null && (
        <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {header}
        </Box>
      )}
      <Box p="md">{children}</Box>
    </Paper>
  );
}
