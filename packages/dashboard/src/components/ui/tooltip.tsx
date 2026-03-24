'use client';

import React, { useState } from 'react';

export interface TooltipProps {
  content: string;
  /** Placement relative to the trigger. */
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

const positionClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Simple tooltip that appears on hover.
 */
export function Tooltip({
  content,
  position = 'top',
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={[
            'pointer-events-none absolute z-50 whitespace-nowrap rounded bg-bg-elevated px-2.5 py-1.5 text-xs text-text-primary shadow-lg border border-border',
            positionClasses[position],
          ].join(' ')}
        >
          {content}
        </div>
      )}
    </div>
  );
}
