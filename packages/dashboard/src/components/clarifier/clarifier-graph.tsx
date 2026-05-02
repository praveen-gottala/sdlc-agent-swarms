'use client';

import { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  Panel,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import ClarifierGraphNode from './graph-node';
import type { ClarifierNode, ClarifierNodeData, ClarifierNodeStatus } from './graph-node';

interface NodeConfig {
  readonly id: string;
  readonly label: string;
  readonly iconId: string;
  readonly description: string;
  readonly isHitl: boolean;
}

const PIPELINE_NODES: readonly NodeConfig[] = [
  { id: 'contextRetriever', label: 'Context', iconId: 'context', description: 'Load project context', isHitl: false },
  { id: 'prdAnalyzer', label: 'PRD Analyzer', iconId: 'prd', description: 'Generate PRD', isHitl: false },
  { id: 'gapDetector', label: 'Gap Detector', iconId: 'gap', description: 'Find gaps', isHitl: false },
  { id: 'questionPrioritizer', label: 'Questions', iconId: 'rank', description: 'Rank questions', isHitl: false },
  { id: 'storyWriter', label: 'Story Writer', iconId: 'write', description: 'Write stories', isHitl: true },
  { id: 'critic', label: 'Critic', iconId: 'critic', description: 'Review quality', isHitl: false },
  { id: 'escalationGate', label: 'Escalation', iconId: 'escalate', description: 'Max rounds', isHitl: true },
  { id: 'emitComplete', label: 'Complete', iconId: 'complete', description: 'Finalize', isHitl: false },
];

const PIPELINE_EDGES: readonly { source: string; target: string; label?: string; conditional?: boolean }[] = [
  { source: 'contextRetriever', target: 'prdAnalyzer' },
  { source: 'prdAnalyzer', target: 'gapDetector' },
  { source: 'gapDetector', target: 'questionPrioritizer' },
  { source: 'questionPrioritizer', target: 'storyWriter' },
  { source: 'storyWriter', target: 'critic' },
  { source: 'critic', target: 'storyWriter', label: 'retry', conditional: true },
  { source: 'critic', target: 'gapDetector', label: 'new round', conditional: true },
  { source: 'critic', target: 'escalationGate', label: 'max rounds', conditional: true },
  { source: 'critic', target: 'emitComplete', label: 'passed', conditional: true },
  { source: 'escalationGate', target: 'emitComplete', label: 'accept', conditional: true },
  { source: 'escalationGate', target: 'gapDetector', label: 'restart', conditional: true },
];

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;

function getLayoutedElements(
  nodes: ClarifierNode[],
  edges: Edge[],
): { nodes: ClarifierNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function resolveNodeStatus(
  nodeId: string,
  activeNode: string | null,
  completedNodes: ReadonlySet<string>,
  interruptedAt: string | null,
): ClarifierNodeStatus {
  if (interruptedAt === nodeId) return 'interrupted';
  if (activeNode === nodeId) return 'active';
  if (completedNodes.has(nodeId)) return 'completed';
  return 'pending';
}

interface ClarifierGraphProps {
  readonly activeNode: string | null;
  readonly completedNodes: ReadonlySet<string>;
  readonly interruptedAt?: string | null;
  readonly onNodeClick?: (nodeId: string) => void;
}

const nodeTypes = { clarifier: ClarifierGraphNode };

export function ClarifierGraph({
  activeNode,
  completedNodes,
  interruptedAt = null,
  onNodeClick,
}: ClarifierGraphProps): React.JSX.Element {
  const [stateDrawerNode, setStateDrawerNode] = useState<string | null>(null);

  const initialData = useMemo(() => {
    const nodes: ClarifierNode[] = PIPELINE_NODES.map((cfg) => ({
      id: cfg.id,
      type: 'clarifier' as const,
      position: { x: 0, y: 0 },
      data: {
        label: cfg.label,
        iconId: cfg.iconId,
        description: cfg.description,
        isHitl: cfg.isHitl,
        status: resolveNodeStatus(cfg.id, activeNode, completedNodes, interruptedAt),
      },
    }));

    const edges: Edge[] = PIPELINE_EDGES.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: e.conditional,
      style: {
        stroke: e.conditional ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.5)',
        strokeWidth: e.conditional ? 1 : 1.5,
        strokeDasharray: e.conditional ? '6 4' : undefined,
      },
      labelStyle: { fill: 'rgba(148,163,184,0.6)', fontSize: 10 },
      labelBgStyle: { fill: 'var(--color-bg-surface)', stroke: 'none' },
      labelBgPadding: [4, 2] as [number, number],
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'rgba(148,163,184,0.4)' },
    }));

    return getLayoutedElements(nodes, edges);
  }, [activeNode, completedNodes, interruptedAt]);

  const [nodes, , onNodesChange] = useNodesState(initialData.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initialData.edges);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: ClarifierNode) => {
    setStateDrawerNode(node.id);
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  const nodeCount = PIPELINE_NODES.length;
  const completedCount = completedNodes.size;

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes.map((n) => {
          const cfg = PIPELINE_NODES.find((p) => p.id === n.id);
          return {
            ...n,
            data: {
              ...n.data,
              iconId: cfg?.iconId ?? 'context',
              status: resolveNodeStatus(n.id, activeNode, completedNodes, interruptedAt),
            } as ClarifierNodeData,
          };
        })}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} color="rgba(148,163,184,0.06)" />
        <Controls showInteractive={false} className="!bg-bg-card !border-border !rounded-lg !shadow-sm [&>button]:!bg-bg-card [&>button]:!border-border [&>button]:!text-text-muted [&>button:hover]:!bg-bg-elevated" />
        <Panel position="top-left" className="!m-3">
          <div className="flex items-center gap-2 rounded-lg bg-bg-card/80 backdrop-blur-sm border border-border/40 px-3 py-1.5">
            <span className="text-[11px] font-medium text-text-muted">
              {completedCount}/{nodeCount} nodes
            </span>
            {activeNode && (
              <>
                <span className="text-text-muted/30">|</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-[liveDot_1.5s_ease-in-out_infinite]" />
                  <span className="text-[11px] text-accent-blue">{PIPELINE_NODES.find((n) => n.id === activeNode)?.label}</span>
                </span>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {stateDrawerNode && (
        <div className="absolute bottom-3 right-3 w-64 rounded-xl border border-border/60 bg-bg-card/95 backdrop-blur-sm shadow-lg p-4 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-text-primary">
              {PIPELINE_NODES.find((n) => n.id === stateDrawerNode)?.label}
            </span>
            <button
              type="button"
              onClick={() => setStateDrawerNode(null)}
              className="text-text-muted/50 hover:text-text-muted transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
          <div className="text-[12px] text-text-muted space-y-1">
            <p>{PIPELINE_NODES.find((n) => n.id === stateDrawerNode)?.description}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted/60">Status:</span>
              <span className={`text-[11px] font-medium ${
                completedNodes.has(stateDrawerNode) ? 'text-green-500' :
                activeNode === stateDrawerNode ? 'text-accent-blue' :
                interruptedAt === stateDrawerNode ? 'text-amber-400' :
                'text-text-muted/50'
              }`}>
                {completedNodes.has(stateDrawerNode) ? 'Completed' :
                 activeNode === stateDrawerNode ? 'Active' :
                 interruptedAt === stateDrawerNode ? 'Interrupted' :
                 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
