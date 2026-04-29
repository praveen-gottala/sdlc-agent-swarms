'use client';

import React, { useState, useCallback } from 'react';
import { Table as MantineTable, Text } from '@mantine/core';
import { IconArrowUp, IconArrowDown } from '@tabler/icons-react';

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
  onSort?: (key: string, direction: SortDirection) => void;
  className?: string;
}

export function Table<T extends object>({
  columns,
  data,
  onSort,
  className = '',
}: TableProps<T>): React.ReactElement {
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
    <MantineTable.ScrollContainer minWidth={0} className={className}>
      <MantineTable striped highlightOnHover withTableBorder>
        <MantineTable.Thead>
          <MantineTable.Tr>
            {columns.map((col) => (
              <MantineTable.Th
                key={col.key}
                className={col.className}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                style={col.sortable ? { cursor: 'pointer', userSelect: 'none' } : undefined}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc'
                      ? <IconArrowUp size={12} />
                      : <IconArrowDown size={12} />
                  )}
                </span>
              </MantineTable.Th>
            ))}
          </MantineTable.Tr>
        </MantineTable.Thead>
        <MantineTable.Tbody>
          {data.map((row, idx) => (
            <MantineTable.Tr
              key={((row as Record<string, unknown>)['id'] as string | number | undefined) ?? idx}
            >
              {columns.map((col) => (
                <MantineTable.Td key={col.key} className={col.className}>
                  {col.render
                    ? col.render(row)
                    : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                </MantineTable.Td>
              ))}
            </MantineTable.Tr>
          ))}
          {data.length === 0 && (
            <MantineTable.Tr>
              <MantineTable.Td colSpan={columns.length}>
                <Text ta="center" py="xl" c="dimmed">
                  No data
                </Text>
              </MantineTable.Td>
            </MantineTable.Tr>
          )}
        </MantineTable.Tbody>
      </MantineTable>
    </MantineTable.ScrollContainer>
  );
}
