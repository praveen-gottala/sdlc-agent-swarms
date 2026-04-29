'use client';

import React from 'react';
import { Button as MantineButton } from '@mantine/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const VARIANT_MAP: Record<ButtonVariant, { variant: string; color?: string }> = {
  primary: { variant: 'filled' },
  secondary: { variant: 'default' },
  danger: { variant: 'filled', color: 'red' },
  ghost: { variant: 'subtle' },
};

const SIZE_MAP: Record<ButtonSize, string> = {
  sm: 'compact-sm',
  md: 'sm',
  lg: 'md',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  const mapped = VARIANT_MAP[variant];
  return (
    <MantineButton
      variant={mapped.variant}
      color={mapped.color}
      size={SIZE_MAP[size]}
      className={className}
      {...rest}
    >
      {children}
    </MantineButton>
  );
}
