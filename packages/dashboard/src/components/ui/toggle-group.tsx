'use client';

import React from 'react';

export interface ToggleItem {
  label: string;
  value: string;
}

export interface ToggleGroupProps {
  items: ToggleItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Toggle button group (e.g., Board | List).
 * Takes an items array and the currently active value.
 */
export function ToggleGroup({
  items,
  value,
  onChange,
  className = '',
}: ToggleGroupProps) {
  return (
    <div
      className={[
        'inline-flex rounded-md border border-border bg-bg-base p-0.5',
        className,
      ].join(' ')}
      role="group"
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(item.value)}
            className={[
              'rounded px-3 py-1.5 text-xs font-medium transition-colors focus-ring',
              isActive
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
