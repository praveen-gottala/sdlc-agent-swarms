'use client';

import { useState } from 'react';

interface DriftBadgeProps {
  hasDrift: boolean;
  description?: string;
}

/** Warning indicator for spec drift. Shows a yellow triangle when drift is detected. */
export function DriftBadge({ hasDrift, description }: DriftBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!hasDrift) {
    return null;
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded bg-yellow-500/20 px-1.5 py-0.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors"
        title={description}
      >
        <span aria-hidden="true">&#9888;</span>
        Drift
      </button>
      {expanded && (
        <span className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-yellow-500/30 bg-[#1a1b2e] p-2 text-xs text-yellow-300 shadow-lg">
          {description}
        </span>
      )}
    </span>
  );
}
