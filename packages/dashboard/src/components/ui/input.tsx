'use client';

import React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * Text input with dark styling, optional label and error message.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'rounded-md border bg-bg-elevated px-3 py-2 text-sm text-text-primary',
            'placeholder:text-text-muted',
            'focus-ring transition-colors',
            error
              ? 'border-accent-red'
              : 'border-border hover:border-text-muted',
            className,
          ].join(' ')}
          {...rest}
        />
        {error && (
          <p className="text-xs text-accent-red">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
