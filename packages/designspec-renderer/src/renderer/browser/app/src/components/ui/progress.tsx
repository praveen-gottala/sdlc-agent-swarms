import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({ className, value = 0, style, ...props }: ProgressProps) {
  return (
    <div
      className={cn('relative h-4 w-full overflow-hidden rounded-full', className)}
      style={{ backgroundColor: 'var(--secondary)', ...style }}
      {...props}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          backgroundColor: 'var(--primary)',
          width: `${Math.min(100, Math.max(0, value))}%`,
        }}
      />
    </div>
  );
}
