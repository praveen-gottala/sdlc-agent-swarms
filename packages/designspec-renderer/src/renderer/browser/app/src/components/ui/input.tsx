import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex w-full rounded-md px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:opacity-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      style={{
        height: 40,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--input)',
        ...style,
      }}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
