'use client';

import React from 'react';

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Tab navigation component with underline-style active indicator.
 */
export function Tabs({ items, value, onChange, className = '' }: TabsProps) {
  return (
    <div
      className={['border-b border-border', className].join(' ')}
      role="tablist"
    >
      <nav className="flex gap-1">
        {items.map((item) => {
          const isActive = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.value)}
              className={[
                'relative px-4 py-2.5 text-sm font-medium transition-colors focus-ring',
                isActive
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent-blue" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
