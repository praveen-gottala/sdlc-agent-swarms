import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, style, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-lg', className)}
      style={{
        backgroundColor: 'var(--card)',
        color: 'var(--card-foreground)',
        border: '1px solid var(--border)',
        ...style,
      }}
      {...props}
    />
  );
}
