'use client';

import React from 'react';
import { Tooltip as MantineTooltip } from '@mantine/core';

export interface TooltipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export function Tooltip({
  content,
  position = 'top',
  children,
}: TooltipProps): React.ReactElement {
  return (
    <MantineTooltip
      label={content}
      position={position}
      withArrow
      transitionProps={{ transition: 'fade', duration: 150 }}
    >
      <span className="inline-flex">{children}</span>
    </MantineTooltip>
  );
}
