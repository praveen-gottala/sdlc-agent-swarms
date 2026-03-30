import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, style, ...props }, ref) => (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 rounded-sm',
        className,
      )}
      style={{
        accentColor: 'var(--primary)',
        ...style,
      }}
      ref={ref}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
