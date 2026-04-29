'use client';

import React from 'react';
import { Badge as MantineBadge } from '@mantine/core';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const COLOR_MAP: Record<BadgeVariant, string> = {
  default: 'gray',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  info: 'blue',
  purple: 'violet',
};

export function Badge({
  variant = 'default',
  className = '',
  children,
}: BadgeProps): React.ReactElement {
  return (
    <MantineBadge
      variant="light"
      color={COLOR_MAP[variant]}
      size="sm"
      radius="xl"
      className={className}
    >
      {children}
    </MantineBadge>
  );
}
