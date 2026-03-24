import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  hover?: boolean;
  className?: string;
}

/**
 * Card container with dark background, border, optional header and hover effect.
 */
export function Card({
  children,
  header,
  hover = false,
  className = '',
}: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-border bg-bg-card',
        hover ? 'transition-colors hover:border-text-muted' : '',
        className,
      ].join(' ')}
    >
      {header != null && (
        <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
          {header}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
