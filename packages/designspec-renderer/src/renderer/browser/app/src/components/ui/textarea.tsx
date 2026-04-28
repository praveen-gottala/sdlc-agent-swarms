import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => (
    <textarea
      className={cn(
        'flex w-full rounded-md px-3 py-2 text-sm placeholder:opacity-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      style={{
        minHeight: 80,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--input)',
        resize: 'vertical',
        fontFamily: 'inherit',
        ...style,
      }}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
