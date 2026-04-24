'use client';

import { useState } from 'react';

interface YamlViewerProps {
  content: string;
  filename: string;
  editable?: boolean;
  onSave?: (content: string) => void;
  saving?: boolean;
}

/** Highlight a single line of YAML using regex-based rules. */
function highlightLine(line: string): React.ReactNode {
  // Comment lines
  if (/^\s*#/.test(line)) {
    return <span style={{ color: '#64748b' }}>{line}</span>;
  }

  // Lines with key: value
  const kvMatch = line.match(/^(\s*)(- )?([^:\n]+?)(:)(\s+)(.+)$/);
  if (kvMatch) {
    const [, indent, dash, key, colon, space, value] = kvMatch;
    return (
      <>
        <span>{indent}</span>
        {dash && <span>{dash}</span>}
        <span style={{ color: '#06b6d4' }}>{key}</span>
        <span>{colon}{space}</span>
        {highlightValue(value)}
      </>
    );
  }

  // Lines with only a key (no value, e.g. mapping keys or list parent)
  const keyOnlyMatch = line.match(/^(\s*)(- )?([^:\n]+?)(:)\s*$/);
  if (keyOnlyMatch) {
    const [, indent, dash, key, colon] = keyOnlyMatch;
    return (
      <>
        <span>{indent}</span>
        {dash && <span>{dash}</span>}
        <span style={{ color: '#06b6d4' }}>{key}</span>
        <span>{colon}</span>
      </>
    );
  }

  // Bare list items (- value)
  const listMatch = line.match(/^(\s*)(- )(.+)$/);
  if (listMatch) {
    const [, indent, dash, value] = listMatch;
    return (
      <>
        <span>{indent}</span>
        <span>{dash}</span>
        {highlightValue(value)}
      </>
    );
  }

  return <span>{line}</span>;
}

/** Apply color to a YAML value based on its type. */
function highlightValue(value: string): React.ReactNode {
  const trimmed = value.trim();

  // Boolean
  if (/^(true|false)$/i.test(trimmed)) {
    return <span style={{ color: '#a855f7' }}>{value}</span>;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return <span style={{ color: '#f97316' }}>{value}</span>;
  }

  // Quoted string
  if (/^["'].*["']$/.test(trimmed)) {
    return <span style={{ color: '#22c55e' }}>{value}</span>;
  }

  // Unquoted string
  return <span style={{ color: '#22c55e' }}>{value}</span>;
}

/** Syntax-highlighted YAML viewer with line numbers and optional edit mode. */
export function YamlViewer({ content, filename, editable, onSave, saving }: YamlViewerProps) {
  const [editing, setEditing] = useState(false);
  const [localDraft, setLocalDraft] = useState(content);
  const lines = content.split('\n');

  // When not editing, draft mirrors the external content (derived state).
  // When editing, use the local draft the user is typing into.
  const draft = editing ? localDraft : content;
  const setDraft = setLocalDraft;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0d0e17]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-sm text-gray-400">
        <span>📄</span>
        <span className="font-medium text-gray-200">{filename}</span>
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            {editing ? (
              <>
                <button
                  data-testid="yaml-save"
                  onClick={() => { onSave?.(draft); setEditing(false); }}
                  disabled={saving}
                  className="rounded px-2.5 py-1 text-xs font-medium bg-accent-blue text-white hover:bg-accent-blue/80 disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  data-testid="yaml-cancel"
                  onClick={() => { setDraft(content); setEditing(false); }}
                  className="rounded px-2.5 py-1 text-xs font-medium border border-white/10 text-gray-300 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                data-testid="yaml-edit"
                onClick={() => setEditing(true)}
                className="rounded px-2.5 py-1 text-xs font-medium border border-white/10 text-gray-300 hover:bg-white/5 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 w-full resize-none bg-[#0d0e17] p-4 text-sm leading-6 text-gray-200 font-mono focus:outline-none"
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-auto p-0">
          <pre className="text-sm leading-6">
            <code>
              {lines.map((line, i) => (
                <div key={i} className="flex hover:bg-white/5">
                  <span className="inline-block w-12 flex-shrink-0 select-none pr-4 text-right text-gray-600" style={{ fontFamily: 'monospace' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>{highlightLine(line)}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
