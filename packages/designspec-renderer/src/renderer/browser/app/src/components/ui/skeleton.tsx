import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn('rounded-md', className)}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        animation: 'skeleton-pulse 2s ease-in-out infinite',
        ...style,
      }}
      {...props}
    />
  );
}
