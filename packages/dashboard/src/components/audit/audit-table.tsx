'use client';

import { useState } from 'react';

/** A single audit log entry. */
export interface AuditEntry {
  /** Timestamp string. */
  timestamp: string;
  /** Agent name. */
  agent: string;
  /** Action performed. */
  action: string;
  /** Related task ID. */
  task: string;
  /** Cost in dollars. */
  cost: number;
  /** Channel the action came from. */
  channel: string;
  /** Git commit SHA (short). */
  commitSha: string;
}

/** Props for the audit table. */
export interface AuditTableProps {
  /** Array of audit entries to display. */
  entries: AuditEntry[];
  /** Number of entries per page. */
  pageSize?: number;
}

const COLUMNS = ['Timestamp', 'Agent', 'Action', 'Task', 'Cost', 'Channel', 'Commit SHA'] as const;

/** Paginated table displaying audit log entries. */
export function AuditTable({ entries, pageSize = 20 }: AuditTableProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const start = page * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);

  return (
    <div className="rounded-lg bg-bg-card border border-border overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageEntries.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  No audit entries found.
                </td>
              </tr>
            )}
            {pageEntries.map((entry, idx) => (
              <tr
                key={`${entry.timestamp}-${entry.task}-${idx}`}
                className={`border-b border-border transition-colors hover:bg-bg-elevated/50 ${
                  idx % 2 === 1 ? 'bg-bg-elevated/20' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-mono text-text-secondary whitespace-nowrap">
                  {entry.timestamp}
                </td>
                <td className="px-4 py-2.5 text-text-primary">{entry.agent}</td>
                <td className="px-4 py-2.5 text-text-primary">{entry.action}</td>
                <td className="px-4 py-2.5 font-mono text-accent-blue">
                  {entry.task}
                </td>
                <td className="px-4 py-2.5 font-mono text-text-primary">
                  ${entry.cost.toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{entry.channel}</td>
                <td className="px-4 py-2.5 font-mono text-text-muted">
                  {entry.commitSha}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-text-muted">
            Showing {start + 1}–{Math.min(start + pageSize, entries.length)} of{' '}
            {entries.length} entries
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded px-3 py-1 text-xs font-medium text-text-secondary bg-bg-elevated border border-border hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`rounded px-3 py-1 text-xs font-medium border transition-colors ${
                  i === page
                    ? 'bg-accent-blue/15 border-accent-blue/30 text-accent-blue'
                    : 'bg-bg-elevated border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page === totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded px-3 py-1 text-xs font-medium text-text-secondary bg-bg-elevated border border-border hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
