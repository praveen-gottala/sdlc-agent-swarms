'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LogEntry } from './log-entry';
import type { LogLevel } from './log-entry';

interface LogData {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const initialEntries: LogData[] = [
  { timestamp: '10:23:15.042', level: 'INFO', message: 'Starting task TSK-002: Create dashboard layout' },
  { timestamp: '10:23:15.108', level: 'INFO', message: 'Context injection: api.yaml, models.yaml, 3 learnings' },
  { timestamp: '10:23:15.234', level: 'REQ', message: 'POST /v1/messages 200 1.2s (claude-sonnet-4)' },
  { timestamp: '10:23:16.891', level: 'DATA', message: '{"role":"assistant","content":"I\'ll create the dashboard..."}' },
  { timestamp: '10:23:17.002', level: 'EXEC', message: 'write_file src/components/layout/DashboardShell.tsx' },
  { timestamp: '10:23:17.445', level: 'WARN', message: 'File already exists, will overwrite' },
  { timestamp: '10:23:18.123', level: 'INFO', message: 'Self-test: running typecheck...' },
  { timestamp: '10:23:19.567', level: 'INFO', message: 'TypeScript: 0 errors' },
  { timestamp: '10:23:19.890', level: 'EXEC', message: 'git checkout -b feat/dashboard-layout' },
  { timestamp: '10:23:20.234', level: 'REQ', message: 'POST /repos/team/app/pulls 201 0.8s (github)' },
  { timestamp: '10:23:20.567', level: 'INFO', message: 'PR #45 created successfully' },
];

const streamingEntries: LogData[] = [
  { timestamp: '10:23:21.100', level: 'INFO', message: 'Starting self-review pass...' },
  { timestamp: '10:23:22.340', level: 'REQ', message: 'POST /v1/messages 200 2.1s (claude-sonnet-4)' },
  { timestamp: '10:23:24.567', level: 'DATA', message: '{"review":"LGTM, minor style suggestion"}' },
  { timestamp: '10:23:25.012', level: 'EXEC', message: 'write_file src/components/layout/DashboardShell.tsx (patched)' },
  { timestamp: '10:23:25.890', level: 'INFO', message: 'All checks passed. Task complete.' },
];

/**
 * Terminal-style streaming log console with auto-scroll.
 */
export function LogConsole() {
  const [entries, setEntries] = useState<LogData[]>(initialEntries);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamIndexRef = useRef(0);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  // Simulate streaming new log entries
  useEffect(() => {
    const interval = setInterval(() => {
      if (streamIndexRef.current < streamingEntries.length) {
        const next = streamingEntries[streamIndexRef.current];
        setEntries((prev) => [...prev, next]);
        streamIndexRef.current += 1;
      } else {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto rounded-lg border border-border p-4"
      style={{ backgroundColor: '#0d0d14' }}
    >
      <div className="flex flex-col gap-0.5">
        {entries.map((entry, i) => (
          <LogEntry key={i} {...entry} />
        ))}
        <span className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-accent-blue" />
      </div>
    </div>
  );
}
