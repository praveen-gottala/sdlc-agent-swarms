import React from 'react';

export type LogLevel = 'INFO' | 'WARN' | 'REQ' | 'DATA' | 'ERROR' | 'EXEC' | 'BRIDGE';

export interface LogEntryProps {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const levelColors: Record<LogLevel, string> = {
  INFO: '#e2e8f0',
  WARN: '#eab308',
  REQ: '#3b82f6',
  DATA: '#64748b',
  ERROR: '#ef4444',
  EXEC: '#06b6d4',
  BRIDGE: '#a855f7',
};

/**
 * Single log line formatted as [HH:MM:SS.mmm] [LEVEL] message, color-coded by level.
 */
export function LogEntry({ timestamp, level, message }: LogEntryProps) {
  const color = levelColors[level];

  return (
    <div data-testid="log-entry" className="whitespace-pre-wrap break-all font-mono text-xs leading-5">
      <span style={{ color: '#64748b' }}>[{timestamp}]</span>{' '}
      <span style={{ color, fontWeight: 600 }}>[{level.padEnd(5)}]</span>{' '}
      <span style={{ color }}>{message}</span>
    </div>
  );
}
