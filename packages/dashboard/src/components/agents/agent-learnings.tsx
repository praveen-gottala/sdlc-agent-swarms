'use client';

import React from 'react';
import { Table, ColumnDef } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Learning {
  id: string;
  agent: string;
  learning: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'human' | 'pattern';
  date: string;
}

const confidenceVariant: Record<Learning['confidence'], 'success' | 'warning' | 'danger'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

const learnings: Learning[] = [
  { id: 'l1', agent: 'Code Generator', learning: 'Prefer named exports over default exports in utility modules', confidence: 'high', source: 'human', date: '2026-03-20' },
  { id: 'l2', agent: 'Spec Writer', learning: 'Include acceptance criteria as checkboxes for every user story', confidence: 'high', source: 'human', date: '2026-03-19' },
  { id: 'l3', agent: 'Test Runner', learning: 'Integration tests should use test containers instead of mocks for DB', confidence: 'medium', source: 'pattern', date: '2026-03-18' },
  { id: 'l4', agent: 'Code Generator', learning: 'Use Result pattern instead of throwing errors for recoverable failures', confidence: 'high', source: 'human', date: '2026-03-17' },
  { id: 'l5', agent: 'Design Agent', learning: 'Ensure auto-layout is set on every frame before adding child elements', confidence: 'medium', source: 'pattern', date: '2026-03-16' },
  { id: 'l6', agent: 'CI/CD Agent', learning: 'Always validate environment variables before pipeline execution', confidence: 'low', source: 'pattern', date: '2026-03-15' },
  { id: 'l7', agent: 'Custom Reviewer', learning: 'Flag functions exceeding 40 lines for refactoring review', confidence: 'medium', source: 'human', date: '2026-03-14' },
];

const columns: ColumnDef<Learning>[] = [
  { key: 'agent', header: 'Agent', sortable: true },
  { key: 'learning', header: 'Learning', className: 'max-w-md' },
  {
    key: 'confidence',
    header: 'Confidence',
    sortable: true,
    render: (row: Learning) => (
      <Badge variant={confidenceVariant[row.confidence]}>
        {row.confidence}
      </Badge>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    render: (row: Learning) => (
      <Badge variant={row.source === 'human' ? 'info' : 'purple'}>
        {row.source}
      </Badge>
    ),
  },
  { key: 'date', header: 'Date', sortable: true },
];

/**
 * Table displaying agent learnings with confidence and source indicators.
 */
export function AgentLearnings() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-text-primary">
        Agent Learnings
      </h2>
      <Table<Learning> columns={columns} data={learnings} />
    </div>
  );
}
