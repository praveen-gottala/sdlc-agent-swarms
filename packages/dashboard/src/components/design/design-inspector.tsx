'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  PROPERTY_REGISTRY,
  getAddableProperties,
  getNodeValue,
  type PropertyDef,
} from '@/lib/design/property-registry';
import { InspectorColorInput } from './inspector-color-input';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DesignInspectorProps {
  selectedNode: {
    nodeId: string;
    catalogType: string | null;
    computedStyles: Record<string, string>;
  } | null;
  designSpec: any | null; // DesignSpecV2
  tags: { nodeId: string; feedback: string; status?: string }[];
  score: number | null;
  iteration: number;
  maxIterations?: number;
  colorMap?: Record<string, string>;
  onPropertyChange: (
    nodeId: string,
    path: string,
    value: string | number,
  ) => void;
  onRevertNode?: (nodeId: string) => void;
  onAddTag?: (tag: { nodeId: string; feedback: string; status: string }) => void;
  onChatSubmit?: (message: string) => void;
  chatDisabled?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Walk the spec's node list / record to find the node matching `nodeId`. */
function findNodeInSpec(spec: any, nodeId: string): any | null {
  if (!spec?.nodes) return null;
  if (Array.isArray(spec.nodes)) {
    return spec.nodes.find((n: any) => n.id === nodeId) ?? null;
  }
  return spec.nodes[nodeId] ?? null;
}

type TabKey = 'properties' | 'ai-edits' | 'chat';

const TABS: { key: TabKey; label: string; badgeLabel: string; badgeClass: string }[] = [
  {
    key: 'properties',
    label: 'Properties',
    badgeLabel: 'Free',
    badgeClass: 'bg-accent-green/15 text-accent-green',
  },
  {
    key: 'ai-edits',
    label: 'AI Edits',
    badgeLabel: 'LLM',
    badgeClass: 'bg-accent-purple/15 text-accent-purple',
  },
  {
    key: 'chat',
    label: 'Chat',
    badgeLabel: '',
    badgeClass: '',
  },
];

/* ------------------------------------------------------------------ */
/*  Smart input components                                             */
/* ------------------------------------------------------------------ */

/** Render the smart input for a single property row. */
function PropertyValueInput({
  def,
  value,
  onChange,
  colorMap,
}: {
  def: PropertyDef;
  value: string | number;
  onChange: (v: string | number) => void;
  colorMap?: Record<string, string>;
}) {
  const testId = `prop-${def.path.replace(/\./g, '-')}`;

  switch (def.type) {
    case 'select':
      return (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className="flex-1 min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary hover:border-text-muted focus-ring transition-colors appearance-none"
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          data-testid={testId}
          className="flex-1 min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary hover:border-text-muted focus-ring transition-colors"
        />
      );
    case 'color':
      return (
        <div className="flex-1 min-w-0">
          <InspectorColorInput
            value={String(value)}
            onChange={onChange}
            colorMap={colorMap}
            testId={testId}
          />
        </div>
      );
    case 'text':
    default:
      return (
        <input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className="flex-1 min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary hover:border-text-muted focus-ring transition-colors"
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Status badge for tag status                                        */
/* ------------------------------------------------------------------ */

function TagStatusBadge({ status }: { status?: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'bg-accent-yellow/15',
      text: 'text-accent-yellow',
      label: 'pending',
    },
    applied: {
      bg: 'bg-accent-green/15',
      text: 'text-accent-green',
      label: 'applied',
    },
    failed: {
      bg: 'bg-accent-red/15',
      text: 'text-accent-red',
      label: 'failed',
    },
  };
  const fallback = {
    bg: 'bg-bg-elevated',
    text: 'text-text-muted',
    label: status ?? 'unknown',
  };
  const resolved = status && status in map ? map[status] : fallback;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${resolved.bg} ${resolved.text}`}
    >
      {resolved.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab content renderers                                              */
/* ------------------------------------------------------------------ */

function PropertiesTab({
  selectedNode,
  designSpec,
  colorMap,
  onPropertyChange,
  onRevertNode,
}: Pick<DesignInspectorProps, 'selectedNode' | 'designSpec' | 'colorMap' | 'onPropertyChange' | 'onRevertNode'>) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const node = selectedNode && designSpec ? findNodeInSpec(designSpec, selectedNode.nodeId) : null;

  if (!selectedNode) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-text-muted">Click an element to edit properties</p>
      </div>
    );
  }

  // Build active property list: all registry entries that have a value on this node
  const activeProps: { def: PropertyDef; value: string | number }[] = [];
  for (const def of PROPERTY_REGISTRY) {
    const val = getNodeValue(node, def.path);
    if (val !== undefined && val !== null) {
      activeProps.push({ def, value: val });
    }
  }

  const activePaths = activeProps.map((p) => p.def.path);
  const addable = getAddableProperties(activePaths);

  const change = (path: string, value: string | number) =>
    onPropertyChange(selectedNode.nodeId, path, value);

  const handleRemoveProperty = (path: string) => {
    // Set to undefined by sending special remove signal
    // The parent's handlePropertyChange sets undefined on the node
    onPropertyChange(selectedNode.nodeId, path, undefined as unknown as string);
  };

  const handleAddProperty = (path: string) => {
    const def = PROPERTY_REGISTRY.find((d) => d.path === path);
    if (!def) return;
    change(path, def.defaultValue ?? (def.type === 'number' ? 0 : ''));
    setShowAddMenu(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3" data-testid="properties-tab">
      {/* Node identity */}
      <div className="space-y-1 mb-3">
        <p className="font-mono text-xs text-accent-blue break-all">
          {selectedNode.nodeId}
        </p>
        {selectedNode.catalogType && (
          <p className="text-xs text-text-muted">
            Type: <span className="text-text-secondary">{selectedNode.catalogType}</span>
          </p>
        )}
      </div>

      <hr className="border-border mb-3" />

      {/* Property rows */}
      <div className="space-y-1.5">
        {activeProps.map(({ def, value }) => (
          <div
            key={def.path}
            className="flex items-center gap-2"
            data-testid={`prop-row-${def.path.replace(/\./g, '-')}`}
          >
            {/* CSS label */}
            <span className="w-[90px] flex-shrink-0 font-mono text-[11px] text-text-muted truncate" title={def.cssLabel}>
              {def.cssLabel}
            </span>

            {/* Smart input */}
            <PropertyValueInput
              def={def}
              value={value}
              onChange={(v) => change(def.path, v)}
              colorMap={colorMap}
            />

            {/* Remove button */}
            <button
              type="button"
              onClick={() => handleRemoveProperty(def.path)}
              data-testid={`prop-remove-${def.path.replace(/\./g, '-')}`}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors text-xs"
              aria-label={`Remove ${def.cssLabel}`}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Revert this element */}
      {onRevertNode && (
        <button
          type="button"
          onClick={() => onRevertNode(selectedNode.nodeId)}
          data-testid="revert-node-btn"
          className="mt-3 w-full rounded-md border border-dashed border-accent-yellow/30 px-2 py-1.5 text-xs text-text-muted hover:text-accent-yellow hover:border-accent-yellow/50 hover:bg-accent-yellow/5 transition-colors"
        >
          Revert element
        </button>
      )}

      {/* Add property */}
      {addable.length > 0 && (
        <div className="mt-3">
          {showAddMenu ? (
            <select
              autoFocus
              data-testid="add-property-select"
              className="w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus-ring appearance-none"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleAddProperty(e.target.value);
              }}
              onBlur={() => setShowAddMenu(false)}
            >
              <option value="" disabled>
                Select property...
              </option>
              {addable.map((def) => (
                <option key={def.path} value={def.path}>
                  {def.cssLabel}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddMenu(true)}
              data-testid="add-property-btn"
              className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors"
            >
              + Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AIEditsTab({
  score,
  tags,
  iteration,
  maxIterations = 3,
  selectedNode,
  onAddTag,
}: Pick<DesignInspectorProps, 'score' | 'tags' | 'iteration' | 'maxIterations' | 'selectedNode' | 'onAddTag'>) {
  const [feedbackText, setFeedbackText] = useState('');

  const handleAddTag = useCallback(() => {
    if (!selectedNode || !feedbackText.trim() || !onAddTag) return;
    onAddTag({
      nodeId: selectedNode.nodeId,
      feedback: feedbackText.trim(),
      status: 'pending',
    });
    setFeedbackText('');
  }, [selectedNode, feedbackText, onAddTag]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {/* Score */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Score
        </span>
        <span className="text-lg font-semibold text-text-primary">
          {score !== null ? `${score}/100` : '\u2014'}
        </span>
      </div>

      {/* Iteration */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Iteration
        </span>
        <span className="text-sm font-medium text-text-secondary">
          {iteration} / {maxIterations}
        </span>
      </div>

      <hr className="border-border" />

      {/* Tag input form — shown when a node is selected */}
      {selectedNode ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Tag feedback
          </h4>
          <p className="font-mono text-[10px] text-accent-blue break-all">
            {selectedNode.nodeId}
          </p>
          {selectedNode.catalogType && (
            <p className="text-[10px] text-text-muted">
              Type: {selectedNode.catalogType}
            </p>
          )}
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Describe what's wrong with this element..."
            rows={3}
            disabled={iteration >= maxIterations}
            className="w-full resize-none rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text-primary placeholder:text-text-muted hover:border-text-muted focus-ring transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!feedbackText.trim() || iteration >= maxIterations}
            className="inline-flex items-center justify-center rounded-md bg-accent-purple px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-purple/90 active:bg-accent-purple/80 disabled:opacity-50 disabled:pointer-events-none focus-ring w-full"
          >
            Add tag
          </button>
          {iteration >= maxIterations && (
            <p className="text-[10px] text-accent-yellow">
              Max correction iterations reached ({maxIterations})
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Tag feedback
          </h4>
          <p className="text-xs text-text-muted">
            Click an element in the canvas to add feedback
          </p>
        </div>
      )}

      <hr className="border-border" />

      {/* Tags */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Tags ({tags.length})
        </h4>
        {tags.length === 0 ? (
          <p className="text-xs text-text-muted">No feedback tags yet</p>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag, i) => (
              <li
                key={`${tag.nodeId}-${i}`}
                className="rounded-md border border-border bg-bg-elevated p-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-text-secondary flex-1">{tag.feedback}</span>
                  <TagStatusBadge status={tag.status} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-text-muted">{tag.nodeId}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr className="border-border" />

      {/* Mechanical checks placeholder */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Mechanical Checks
        </h4>
        <p className="text-xs text-text-muted">
          Run mechanical checks to see issues
        </p>
      </div>
    </div>
  );
}

function ChatTab({ onChatSubmit, chatDisabled }: Pick<DesignInspectorProps, 'onChatSubmit' | 'chatDisabled'>) {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Array<{ text: string; ts: number }>>([]);
  const historyRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(() => {
    if (!message.trim() || chatDisabled) return;
    const msg = message.trim();
    setHistory((prev) => [...prev, { text: msg, ts: Date.now() }]);
    setMessage('');
    onChatSubmit?.(msg);
  }, [message, chatDisabled, onChatSubmit]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' });
  }, [history.length]);

  return (
    <div className="flex flex-1 flex-col p-3">
      <div ref={historyRef} className="flex-1 overflow-y-auto space-y-2 mb-2">
        {history.map((entry) => (
          <div
            key={entry.ts}
            className="rounded-md bg-accent-blue/10 px-3 py-2 text-xs text-text-primary"
          >
            {entry.text}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          data-testid="chat-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={chatDisabled ? 'Pipeline running...' : 'Describe the change you want...'}
          rows={3}
          disabled={chatDisabled}
          className="w-full resize-none rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted focus-ring transition-colors disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted">
            AI edits use LLM tokens
          </span>
          <button
            data-testid="chat-send-btn"
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || chatDisabled}
            className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-blue/90 active:bg-accent-blue/80 disabled:opacity-50 disabled:pointer-events-none focus-ring"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function DesignInspector({
  selectedNode,
  designSpec,
  tags,
  score,
  iteration,
  maxIterations = 3,
  colorMap,
  onPropertyChange,
  onRevertNode,
  onAddTag,
  onChatSubmit,
  chatDisabled,
}: DesignInspectorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('properties');

  return (
    <div data-testid="design-inspector" className="flex h-full flex-col bg-sidebar text-text-primary">
      {/* Tab bar */}
      <div className="border-b border-border" role="tablist">
        <nav className="flex">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors focus-ring',
                  isActive
                    ? 'text-text-primary'
                    : 'text-text-muted hover:text-text-secondary',
                ].join(' ')}
              >
                {tab.label}
                {tab.badgeLabel && (
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${tab.badgeClass}`}
                  >
                    {tab.badgeLabel}
                  </span>
                )}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent-blue" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'properties' && (
        <PropertiesTab
          selectedNode={selectedNode}
          designSpec={designSpec}
          colorMap={colorMap}
          onPropertyChange={onPropertyChange}
          onRevertNode={onRevertNode}
        />
      )}
      {activeTab === 'ai-edits' && (
        <AIEditsTab
          score={score}
          tags={tags}
          iteration={iteration}
          maxIterations={maxIterations}
          selectedNode={selectedNode}
          onAddTag={onAddTag}
        />
      )}
      {activeTab === 'chat' && <ChatTab onChatSubmit={onChatSubmit} chatDisabled={chatDisabled} />}
    </div>
  );
}
