'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-blue text-white hover:bg-accent-blue/90 active:bg-accent-blue/80',
  secondary:
    'bg-bg-elevated text-text-primary border border-border hover:bg-border/50 active:bg-border/70',
  danger:
    'bg-accent-red text-white hover:bg-accent-red/90 active:bg-accent-red/80',
  ghost:
    'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary active:bg-border/40',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded',
  md: 'px-4 py-2 text-sm rounded-md',
  lg: 'px-6 py-3 text-base rounded-lg',
};

/**
 * Button component with dark-theme styling.
 *
 * Variants: primary, secondary, danger, ghost.
 * Sizes: sm, md, lg.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-medium transition-colors focus-ring',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
