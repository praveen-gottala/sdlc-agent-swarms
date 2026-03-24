'use client';

import React, { useState } from 'react';

export interface SpecContextProps {
  /** Raw YAML content to display */
  yamlContent: string;
}

/**
 * Spec context panel that renders YAML with syntax coloring.
 * Keys in cyan, values in green, strings in yellow.
 */
export function SpecContext({ yamlContent }: SpecContextProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary bg-bg-elevated hover:bg-border/30 transition-colors"
      >
        <span>Spec Context</span>
        <span className="text-text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre className="bg-[#1e1e2e] p-3 text-xs font-mono leading-relaxed overflow-x-auto">
          {yamlContent.split('\n').map((line, i) => (
            <div key={i}>{colorizeYamlLine(line)}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

function colorizeYamlLine(line: string): React.ReactNode {
  // Comment lines
  if (line.trimStart().startsWith('#')) {
    return <span className="text-text-muted">{line}</span>;
  }

  // Key: value pattern
  const match = line.match(/^(\s*)([\w-]+)(:)(.*)/);
  if (match) {
    const [, indent, key, colon, rest] = match;
    const trimmedRest = rest.trim();
    const isString =
      (trimmedRest.startsWith("'") && trimmedRest.endsWith("'")) ||
      (trimmedRest.startsWith('"') && trimmedRest.endsWith('"'));

    return (
      <>
        {indent}
        <span className="text-accent-cyan">{key}</span>
        <span className="text-text-muted">{colon}</span>
        {rest.length > 0 && (
          <span className={isString ? 'text-accent-yellow' : 'text-accent-green'}>
            {rest}
          </span>
        )}
      </>
    );
  }

  // List item lines (- value)
  const listMatch = line.match(/^(\s*)(- )(.*)/);
  if (listMatch) {
    const [, indent, dash, value] = listMatch;
    return (
      <>
        {indent}
        <span className="text-text-muted">{dash}</span>
        <span className="text-accent-yellow">{value}</span>
      </>
    );
  }

  return <span className="text-text-secondary">{line}</span>;
}
