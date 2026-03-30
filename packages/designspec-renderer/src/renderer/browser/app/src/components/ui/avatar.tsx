import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Avatar({ className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      style={{ backgroundColor: 'var(--muted)' }}
      {...props}
    />
  );
}

export interface AvatarFallbackProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return (
    <span
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full text-sm font-medium',
        className,
      )}
      style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
      {...props}
    />
  );
}
