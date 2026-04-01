'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DesignLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'REQ' | 'BRIDGE';

export type DesignLogSource = 'registry' | 'studio' | 'canvas' | 'bridge' | 'renderer' | 'pipeline';

export interface DesignLogEntry {
  id: string;
  timestamp: string;
  level: DesignLogLevel;
  source: DesignLogSource;
  message: string;
  metadata?: Record<string, unknown>;
}

interface DesignLogContextValue {
  entries: DesignLogEntry[];
  log: (level: DesignLogLevel, source: DesignLogSource, message: string, metadata?: Record<string, unknown>) => void;
  clear: () => void;
}

const MAX_ENTRIES = 200;

// ─── Context ─────────────────────────────────────────────────────────────────

const DesignLogContext = createContext<DesignLogContextValue | null>(null);

let nextId = 0;

function formatTimestamp(): string {
  const d = new Date();
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0') +
    ':' +
    String(d.getSeconds()).padStart(2, '0') +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function DesignLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<DesignLogEntry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const log = useCallback(
    (level: DesignLogLevel, source: DesignLogSource, message: string, metadata?: Record<string, unknown>) => {
      const entry: DesignLogEntry = {
        id: `dlog-${++nextId}`,
        timestamp: formatTimestamp(),
        level,
        source,
        message,
        metadata,
      };
      // Console fallback
      const prefix = `[DesignLog][${source}]`;
      if (level === 'ERROR') {
        console.error(prefix, message, metadata ?? '');
      } else if (level === 'WARN') {
        console.warn(prefix, message, metadata ?? '');
      } else {
        console.log(prefix, message, metadata ?? '');
      }

      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    },
    [],
  );

  const clear = useCallback(() => setEntries([]), []);

  return React.createElement(
    DesignLogContext.Provider,
    { value: { entries, log, clear } },
    children,
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDesignLog(): DesignLogContextValue {
  const ctx = useContext(DesignLogContext);
  if (!ctx) {
    throw new Error('useDesignLog must be used inside <DesignLogProvider>');
  }
  return ctx;
}
