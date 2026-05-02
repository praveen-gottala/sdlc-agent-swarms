'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type ClarifierNodeStatus = 'pending' | 'active' | 'completed' | 'interrupted';

export interface ClarifierNodeData {
  readonly label: string;
  readonly iconId: string;
  readonly status: ClarifierNodeStatus;
  readonly isHitl: boolean;
  readonly description: string;
  [key: string]: unknown;
}

export type ClarifierNode = Node<ClarifierNodeData, 'clarifier'>;

const statusStyles: Record<ClarifierNodeStatus, string> = {
  pending: 'border-border/50 bg-bg-card/80 text-text-muted',
  active: 'border-accent-blue/50 bg-accent-blue/6 text-text-primary shadow-[0_0_12px_rgba(59,130,246,0.15)]',
  completed: 'border-green-500/30 bg-green-500/4 text-text-secondary',
  interrupted: 'border-amber-500/40 bg-amber-500/6 text-amber-300',
};

const iconColors: Record<ClarifierNodeStatus, string> = {
  pending: 'text-text-muted/40',
  active: 'text-accent-blue',
  completed: 'text-green-500/70',
  interrupted: 'text-amber-400',
};

function NodeIcon({ iconId, className }: { iconId: string; className?: string }): React.JSX.Element {
  const cls = className ?? 'h-3.5 w-3.5';
  switch (iconId) {
    case 'context':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h12M2 4.5v8a1 1 0 001 1h10a1 1 0 001-1v-8M2 4.5l1.5-2h9L14 4.5M6 7.5h4" /></svg>;
    case 'prd':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 1.5h5l4 4v8.5a1 1 0 01-1 1h-8a1 1 0 01-1-1v-12a1 1 0 011-1z" /><path strokeLinecap="round" d="M6 7h4M6 9.5h4M6 12h2" /></svg>;
    case 'gap':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path strokeLinecap="round" d="M8 5v4M8 11h.01" /></svg>;
    case 'rank':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13V9M8 13V5M13 13V2" /></svg>;
    case 'write':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.5 1.5l3 3-8.5 8.5H3v-3l8.5-8.5z" /></svg>;
    case 'critic':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path strokeLinecap="round" d="M5.5 8l2 2 3.5-4" /></svg>;
    case 'escalate':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 2l6 11H2L8 2z" /><path strokeLinecap="round" d="M8 6.5v3M8 11.5h.01" /></svg>;
    case 'complete':
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" /></svg>;
    default:
      return <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /></svg>;
  }
}

function StatusDot({ status }: { status: ClarifierNodeStatus }): React.JSX.Element | null {
  if (status === 'completed') {
    return <span className="h-1.5 w-1.5 rounded-full bg-green-500" />;
  }
  if (status === 'active') {
    return <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-[liveDot_1.5s_ease-in-out_infinite]" />;
  }
  if (status === 'interrupted') {
    return <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />;
  }
  return null;
}

function ClarifierGraphNode({ data }: NodeProps<ClarifierNode>): React.JSX.Element {
  return (
    <div className={`
      relative rounded-lg border px-3 py-2 min-w-[140px] max-w-[160px]
      transition-all duration-200
      ${statusStyles[data.status]}
    `}>
      <Handle type="target" position={Position.Top} className="!bg-border !border-bg-base !w-1.5 !h-1.5" />

      <div className="flex items-center gap-2">
        <NodeIcon iconId={data.iconId} className={`h-3.5 w-3.5 flex-shrink-0 ${iconColors[data.status]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium leading-tight truncate">{data.label}</span>
            <StatusDot status={data.status} />
          </div>
        </div>
      </div>

      {data.isHitl && data.status !== 'completed' && (
        <div className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-1 py-px">
          <span className="text-[7px] font-semibold text-amber-400 uppercase tracking-wider">HITL</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-border !border-bg-base !w-1.5 !h-1.5" />
    </div>
  );
}

export default memo(ClarifierGraphNode);
