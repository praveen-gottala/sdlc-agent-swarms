'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDesignLog } from '@/lib/hooks/use-design-log';
import { LogEntry, type LogLevel } from '@/components/live-monitor/log-entry';

/**
 * Collapsible log panel at the bottom of the Design Studio.
 * Shows structured log entries from the design pipeline, bridge, and renderer.
 */
export function DesignLogPanel() {
  const { entries, clear } = useDesignLog();
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Derive auto-expand: panel should open when pipeline entries exist
  const hasPipelineEntries = useMemo(
    () => entries.some((e) => e.source === 'pipeline'),
    [entries],
  );
  // User toggle takes precedence; otherwise auto-expand when pipeline entries arrive
  const expanded = userToggled ?? hasPipelineEntries;
  const setExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    setUserToggled(typeof v === 'function' ? v(expanded) : v);
  };

  // Auto-scroll to bottom when new entries arrive (if expanded)
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, expanded]);

  return (
    <div className="flex-shrink-0 border-t border-border bg-bg-card/50">
      {/* Toggle bar */}
      <button
        data-testid="logs-toggle"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span
            className="transition-transform"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            &#9650;
          </span>
          Logs ({entries.length})
        </span>
        {expanded && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="text-[10px] text-text-muted hover:text-text-secondary px-1"
          >
            Clear
          </span>
        )}
      </button>

      {/* Log entries */}
      {expanded && (
        <div
          ref={scrollRef}
          className="h-[200px] overflow-y-auto bg-[#0b0e14] px-4 py-2"
        >
          {entries.length === 0 && (
            <span className="text-xs text-text-muted">No log entries yet.</span>
          )}
          {entries.map((entry) => (
            <LogEntry
              key={entry.id}
              timestamp={entry.timestamp}
              level={entry.level as LogLevel}
              message={`[${entry.source}] ${entry.message}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
