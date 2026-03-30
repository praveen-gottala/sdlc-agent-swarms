import * as React from 'react';
import { cn } from '@/lib/utils';

const variantStyles: Record<string, React.CSSProperties> = {
  default: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
  secondary: { backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' },
  destructive: { backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' },
  outline: { border: '1px solid var(--border)', color: 'var(--foreground)', backgroundColor: 'transparent' },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: string;
}

export function Badge({ className, variant = 'default', style, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        className,
      )}
      style={{ ...variantStyles[variant] ?? variantStyles.default, ...style }}
      {...props}
    />
  );
}
