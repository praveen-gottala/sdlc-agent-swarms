'use client';

import React, { useState } from 'react';

export interface CodeDiffProps {
  /** Original code (lines prefixed with -) */
  oldCode: string;
  /** New code (lines prefixed with +) */
  newCode: string;
}

/**
 * Simple inline diff viewer.
 * Renders +/- lines with color coding. No external library required.
 */
export function CodeDiff({ oldCode, newCode }: CodeDiffProps) {
  const [expanded, setExpanded] = useState(false);

  const diffLines = buildDiffLines(oldCode, newCode);
  const visibleLines = expanded ? diffLines : diffLines.slice(0, 10);
  const hasMore = diffLines.length > 10;

  return (
    <div className="rounded-md overflow-hidden">
      <pre className="bg-[#1e1e2e] p-3 text-xs font-mono leading-relaxed overflow-x-auto">
        {visibleLines.map((line, i) => (
          <div key={i} className={lineClass(line.type)}>
            <span className="select-none mr-2 opacity-60">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            {line.text}
          </div>
        ))}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full py-1.5 text-xs text-accent-blue hover:text-accent-blue/80 bg-[#1e1e2e] border-t border-border transition-colors"
        >
          {expanded ? 'Collapse' : `View Full Diff (${diffLines.length} lines)`}
        </button>
      )}
    </div>
  );
}

type LineType = 'add' | 'remove' | 'context';

interface DiffLine {
  type: LineType;
  text: string;
}

function lineClass(type: LineType): string {
  switch (type) {
    case 'add':
      return 'text-accent-green bg-accent-green/10 px-1 rounded-sm';
    case 'remove':
      return 'text-accent-red bg-accent-red/10 px-1 rounded-sm';
    default:
      return 'text-text-secondary px-1';
  }
}

/** Parse unified-style diff content into typed lines. */
function buildDiffLines(oldCode: string, newCode: string): DiffLine[] {
  const combined = `${oldCode}\n${newCode}`;
  const raw = combined.split('\n');
  const lines: DiffLine[] = [];

  for (const line of raw) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('+ ') || trimmed.startsWith('+\t') || trimmed === '+') {
      lines.push({ type: 'add', text: trimmed.slice(2) });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('-\t') || trimmed === '-') {
      lines.push({ type: 'remove', text: trimmed.slice(2) });
    } else {
      lines.push({ type: 'context', text: line });
    }
  }
  return lines;
}
