'use client';

import React, { useState, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Called when a sortable column header is clicked. */
  onSort?: (key: string, direction: SortDirection) => void;
  className?: string;
}

/**
 * Dark-styled data table with sortable column headers.
 */
export function Table<T extends object>({
  columns,
  data,
  onSort,
  className = '',
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const handleSort = useCallback(
    (key: string) => {
      let next: SortDirection;
      if (sortKey !== key) {
        next = 'asc';
      } else if (sortDir === 'asc') {
        next = 'desc';
      } else {
        next = null;
      }
      setSortKey(next ? key : null);
      setSortDir(next);
      onSort?.(key, next);
    },
    [sortKey, sortDir, onSort],
  );

  return (
    <div
      className={[
        'overflow-x-auto rounded-lg border border-border',
        className,
      ].join(' ')}
    >
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-elevated">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted',
                  col.sortable ? 'cursor-pointer select-none hover:text-text-secondary' : '',
                  col.className ?? '',
                ].join(' ')}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span aria-hidden="true">
                      {sortDir === 'asc' ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, idx) => (
            <tr
              key={((row as Record<string, unknown>)['id'] as string | number | undefined) ?? idx}
              className="bg-bg-card transition-colors hover:bg-bg-elevated"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={['px-4 py-3 text-text-primary', col.className ?? ''].join(' ')}
                >
                  {col.render
                    ? col.render(row)
                    : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-text-muted"
              >
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
