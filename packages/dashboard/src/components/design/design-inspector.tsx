'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Collapse,
  Badge,
  ActionIcon,
  Textarea,
  Text,
  Group,
  Stack,
  Box,
  ScrollArea,
  UnstyledButton,
  Paper,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconX,
  IconArrowBackUp,
} from '@tabler/icons-react';

import {
  PROPERTY_REGISTRY,
  getAddableProperties,
  getNodeValue,
  type PropertyDef,
} from '@/lib/design/property-registry';
import { InspectorColorInput } from './inspector-color-input';
import { AuditTab } from './audit-tab';
import type { MechanicalAuditResult, VisionAuditResult } from '@/lib/design/audit-types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DesignInspectorProps {
  selectedNode: {
    nodeId: string;
    catalogType: string | null;
    computedStyles: Record<string, string>;
  } | null;
  designSpec: unknown | null;
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
  activeTabOverride?: 'properties' | 'ai-edits' | 'chat' | 'audit';
  mechanicalAudit?: MechanicalAuditResult | null;
  mechanicalAuditLoading?: boolean;
  visionAudit?: VisionAuditResult | null;
  visionAuditLoading?: boolean;
  onRunVisionAudit?: () => void;
  visionAuditAvailable?: boolean;
  onFixIssue?: (issue: { severity: string; component: string; description: string; fix: string; issueId?: string }, feedback?: string) => Promise<void>;
  onFixAll?: (issues: { severity: string; component: string; description: string; fix: string; issueId?: string }[], feedback?: string) => Promise<void>;
  onFixMechanical?: () => Promise<void>;
  mechanicalFixLoading?: boolean;
  fixPhase?: 'idle' | 'fixing' | 'verifying' | 'retrying';
  fixingIssueId?: string | null;
  previousScore?: number | null;
  addressedIssues?: { severity: string; component: string; description: string; fix: string; issueId?: string }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findNodeInSpec(spec: unknown, nodeId: string): Record<string, unknown> | null {
  if (!spec || typeof spec !== 'object') return null;
  const s = spec as { nodes?: unknown };
  if (!s.nodes) return null;
  if (Array.isArray(s.nodes)) {
    return (s.nodes as Array<Record<string, unknown>>).find((n) => n.id === nodeId) ?? null;
  }
  return ((s.nodes as Record<string, Record<string, unknown>>)[nodeId]) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Smart input components                                             */
/* ------------------------------------------------------------------ */

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
}): React.ReactElement {
  const testId = `prop-${def.path.replace(/\./g, '-')}`;

  switch (def.type) {
    case 'select':
      return (
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className="flex-1 min-w-0 rounded border border-border bg-bg-elevated px-1.5 py-1 text-[11px] text-text-primary hover:border-text-muted focus-ring transition-colors appearance-none"
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
          className="flex-1 min-w-0 rounded border border-border bg-bg-elevated px-1.5 py-1 text-[11px] text-text-primary hover:border-text-muted focus-ring transition-colors"
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
          className="flex-1 min-w-0 rounded border border-border bg-bg-elevated px-1.5 py-1 text-[11px] text-text-primary hover:border-text-muted focus-ring transition-colors"
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({
  title,
  expanded,
  onToggle,
  right,
  testId,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  return (
    <UnstyledButton
      onClick={onToggle}
      w="100%"
      px="sm"
      py={6}
      data-testid={testId}
      style={{ borderBottom: expanded ? '1px solid var(--mantine-color-default-border)' : undefined }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6}>
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          <Text size="xs" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            {title}
          </Text>
        </Group>
        {right}
      </Group>
    </UnstyledButton>
  );
}

/* ------------------------------------------------------------------ */
/*  Zone 1: Properties                                                 */
/* ------------------------------------------------------------------ */

function PropertiesZone({
  selectedNode,
  designSpec,
  colorMap,
  onPropertyChange,
  onRevertNode,
  expanded,
  onToggle,
}: {
  selectedNode: DesignInspectorProps['selectedNode'];
  designSpec: unknown;
  colorMap?: Record<string, string>;
  onPropertyChange: DesignInspectorProps['onPropertyChange'];
  onRevertNode?: DesignInspectorProps['onRevertNode'];
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const node = selectedNode && designSpec ? findNodeInSpec(designSpec, selectedNode.nodeId) : null;

  const activeProps: { def: PropertyDef; value: string | number }[] = [];
  if (selectedNode && node) {
    for (const def of PROPERTY_REGISTRY) {
      const val = getNodeValue(node, def.path);
      if (val !== undefined && val !== null) {
        activeProps.push({ def, value: val as string | number });
      }
    }
  }

  const activePaths = activeProps.map((p) => p.def.path);
  const addable = getAddableProperties(activePaths);

  const change = (path: string, value: string | number) => {
    if (selectedNode) onPropertyChange(selectedNode.nodeId, path, value);
  };

  const handleRemoveProperty = (path: string) => {
    if (selectedNode) onPropertyChange(selectedNode.nodeId, path, undefined as unknown as string);
  };

  const handleAddProperty = (path: string) => {
    const def = PROPERTY_REGISTRY.find((d) => d.path === path);
    if (!def) return;
    change(path, def.defaultValue ?? (def.type === 'number' ? 0 : ''));
    setShowAddMenu(false);
  };

  return (
    <Box>
      <SectionHeader
        title="Properties"
        expanded={expanded}
        onToggle={onToggle}
        testId="section-properties"
        right={
          selectedNode && addable.length > 0 ? (
            <ActionIcon variant="subtle" size="xs" onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu); }}>
              <IconPlus size={12} />
            </ActionIcon>
          ) : undefined
        }
      />
      <Collapse expanded={expanded} transitionDuration={200}>
        {!selectedNode ? (
          <Box p="md">
            <Text size="sm" c="dimmed" ta="center">Click an element to inspect</Text>
          </Box>
        ) : (
          <Box p="sm" data-testid="properties-tab">
            <Stack gap={4} mb="xs">
              <Text size="xs" ff="monospace" c="blue" style={{ wordBreak: 'break-all' }}>
                {selectedNode.nodeId}
              </Text>
              {selectedNode.catalogType && (
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Catalog:</Text>
                  <Badge size="xs" variant="light">{selectedNode.catalogType}</Badge>
                </Group>
              )}
            </Stack>

            <Box mb="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }} />

            <Stack gap={4}>
              {activeProps.map(({ def, value }) => (
                <Group
                  key={def.path}
                  gap="xs"
                  wrap="nowrap"
                  data-testid={`prop-row-${def.path.replace(/\./g, '-')}`}
                >
                  <Text
                    size="xs"
                    ff="monospace"
                    c="dimmed"
                    w={90}
                    style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={def.cssLabel}
                  >
                    {def.cssLabel}
                  </Text>
                  <PropertyValueInput
                    def={def}
                    value={value}
                    onChange={(v) => change(def.path, v)}
                    colorMap={colorMap}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => handleRemoveProperty(def.path)}
                    data-testid={`prop-remove-${def.path.replace(/\./g, '-')}`}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>

            {onRevertNode && (
              <UnstyledButton
                onClick={() => onRevertNode(selectedNode.nodeId)}
                data-testid="revert-node-btn"
                w="100%"
                mt="xs"
                py={6}
                px="xs"
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '1px dashed var(--mantine-color-yellow-4)',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
                className="hover:bg-accent-yellow/5"
              >
                <Group gap={4} justify="center">
                  <IconArrowBackUp size={12} />
                  <Text size="xs" c="yellow">Revert element</Text>
                </Group>
              </UnstyledButton>
            )}

            {showAddMenu && addable.length > 0 && (
              <Box mt="xs">
                <select
                  autoFocus
                  data-testid="add-property-select"
                  className="w-full rounded border border-border bg-bg-elevated px-1.5 py-1 text-[11px] text-text-primary focus-ring appearance-none"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) handleAddProperty(e.target.value); }}
                  onBlur={() => setShowAddMenu(false)}
                >
                  <option value="" disabled>Select property...</option>
                  {addable.map((def) => (
                    <option key={def.path} value={def.path}>{def.cssLabel}</option>
                  ))}
                </select>
              </Box>
            )}

            {!showAddMenu && addable.length > 0 && (
              <UnstyledButton
                onClick={() => setShowAddMenu(true)}
                data-testid="add-property-btn"
                w="100%"
                mt="xs"
                py={6}
                px="xs"
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '1px dashed var(--mantine-color-default-border)',
                  textAlign: 'center',
                  transition: 'all 150ms ease',
                }}
              >
                <Group gap={4} justify="center">
                  <IconPlus size={12} />
                  <Text size="xs" c="dimmed">Add property</Text>
                </Group>
              </UnstyledButton>
            )}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Zone 2: Quality (merged AI Edits + Audit)                          */
/* ------------------------------------------------------------------ */

function TagStatusBadge({ status }: { status?: string }): React.ReactElement {
  const colorMap: Record<string, string> = {
    pending: 'yellow',
    applied: 'green',
    failed: 'red',
  };
  return <Badge size="xs" variant="light" color={colorMap[status ?? ''] ?? 'gray'}>{status ?? 'unknown'}</Badge>;
}

function QualityZone({
  score,
  tags,
  iteration,
  maxIterations = 3,
  selectedNode,
  onAddTag,
  mechanicalAudit,
  mechanicalAuditLoading,
  visionAudit,
  visionAuditLoading,
  onRunVisionAudit,
  visionAuditAvailable,
  onFixIssue,
  onFixAll,
  onFixMechanical,
  mechanicalFixLoading,
  fixPhase,
  fixingIssueId,
  previousScore,
  addressedIssues,
  expanded,
  onToggle,
}: Pick<DesignInspectorProps,
  'score' | 'tags' | 'iteration' | 'maxIterations' | 'selectedNode' |
  'onAddTag' | 'mechanicalAudit' | 'mechanicalAuditLoading' | 'visionAudit' |
  'visionAuditLoading' | 'onRunVisionAudit' | 'visionAuditAvailable' |
  'onFixIssue' | 'onFixAll' | 'onFixMechanical' | 'mechanicalFixLoading' |
  'fixPhase' | 'fixingIssueId' | 'previousScore' | 'addressedIssues'
> & { expanded: boolean; onToggle: () => void }): React.ReactElement {
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

  const scoreColor = score !== null
    ? score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red'
    : 'gray';

  return (
    <Box style={{ borderTop: '2px solid var(--mantine-color-default-border)' }}>
      <SectionHeader
        title="Quality"
        expanded={expanded}
        onToggle={onToggle}
        testId="section-quality"
        right={
          <Group gap={6}>
            {score !== null && (
              <Badge size="xs" variant="light" color={scoreColor}>{score}/100</Badge>
            )}
            <Text size="xs" c="dimmed">
              {iteration}/{maxIterations}
            </Text>
          </Group>
        }
      />
      <Collapse expanded={expanded} transitionDuration={200}>
        <Box p="sm">
          {/* Feedback tags */}
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
              Feedback ({tags.length})
            </Text>

            {selectedNode ? (
              <Box>
                <Text size="xs" ff="monospace" c="blue" mb={4} style={{ wordBreak: 'break-all' }}>
                  {selectedNode.nodeId}
                </Text>
                <Textarea
                  size="xs"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Describe what's wrong..."
                  rows={2}
                  disabled={iteration >= maxIterations}
                  mb={4}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  disabled={!feedbackText.trim() || iteration >= maxIterations}
                  className="w-full rounded-md bg-accent-purple px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-purple/90 active:bg-accent-purple/80 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Add feedback
                </button>
              </Box>
            ) : (
              <Text size="xs" c="dimmed">Click an element to add feedback</Text>
            )}

            {tags.length > 0 && (
              <Stack gap={4}>
                {tags.map((tag, i) => (
                  <Paper key={`${tag.nodeId}-${i}`} withBorder p="xs">
                    <Group justify="space-between" align="flex-start" gap="xs">
                      <Text size="xs" style={{ flex: 1 }}>{tag.feedback}</Text>
                      <TagStatusBadge status={tag.status} />
                    </Group>
                    <Text size="xs" ff="monospace" c="dimmed" mt={2}>{tag.nodeId}</Text>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>

          {/* Audit results inline */}
          <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} pt="sm">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs" style={{ letterSpacing: '0.05em' }}>
              Checks
            </Text>
            <AuditTab
              mechanicalAudit={mechanicalAudit ?? null}
              mechanicalAuditLoading={mechanicalAuditLoading ?? false}
              visionAudit={visionAudit ?? null}
              visionAuditLoading={visionAuditLoading ?? false}
              onRunVisionAudit={onRunVisionAudit ?? (() => {})}
              visionAuditAvailable={visionAuditAvailable ?? false}
              onFixIssue={onFixIssue}
              onFixAll={onFixAll}
              onFixMechanical={onFixMechanical}
              mechanicalFixLoading={mechanicalFixLoading}
              fixPhase={fixPhase}
              fixingIssueId={fixingIssueId}
              previousScore={previousScore}
              addressedIssues={addressedIssues}
            />
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  Zone 3: Chat (persistent)                                          */
/* ------------------------------------------------------------------ */

function ChatZone({
  onChatSubmit,
  chatDisabled,
  expanded,
  onToggle,
}: Pick<DesignInspectorProps, 'onChatSubmit' | 'chatDisabled'> & {
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
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
    <Box style={{ borderTop: '2px solid var(--mantine-color-default-border)' }}>
      <SectionHeader
        title="Chat"
        expanded={expanded}
        onToggle={onToggle}
        testId="section-chat"
      />

      {/* Chat input is always visible even when collapsed */}
      <Box p="sm">
        {expanded && history.length > 0 && (
          <Box ref={historyRef} mb="xs" mah={200} style={{ overflowY: 'auto' }}>
            <Stack gap={4}>
              {history.map((entry) => (
                <Paper key={entry.ts} p="xs" radius="md" bg="var(--mantine-color-blue-light)">
                  <Text size="xs">{entry.text}</Text>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        <Textarea
          data-testid="chat-textarea"
          size="xs"
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={chatDisabled ? 'Pipeline running...' : 'Describe changes...'}
          rows={2}
          disabled={chatDisabled}
        />
        <Group justify="space-between" mt={4}>
          <Text size="xs" c="dimmed">AI edits use tokens</Text>
          <Group gap={4}>
            <Text size="xs" c="dimmed">Enter</Text>
            <button
              data-testid="chat-send-btn"
              type="button"
              onClick={handleSubmit}
              disabled={!message.trim() || chatDisabled}
              className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              Send
            </button>
          </Group>
        </Group>
      </Box>
    </Box>
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
  activeTabOverride: _activeTabOverride,
  mechanicalAudit,
  mechanicalAuditLoading,
  visionAudit,
  visionAuditLoading,
  onRunVisionAudit,
  visionAuditAvailable,
  onFixIssue,
  onFixAll,
  onFixMechanical,
  mechanicalFixLoading,
  fixPhase,
  fixingIssueId,
  previousScore,
  addressedIssues,
}: DesignInspectorProps): React.ReactElement {
  const [propsExpanded, setPropsExpanded] = useState(false);
  const [qualityExpanded, setQualityExpanded] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);

  // Auto-expand Properties when a node is selected
  React.useEffect(() => {
    if (selectedNode) setPropsExpanded(true);
  }, [selectedNode]);

  return (
    <Box data-testid="design-inspector" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <ScrollArea flex={1} type="auto" offsetScrollbars>
        <PropertiesZone
          selectedNode={selectedNode}
          designSpec={designSpec}
          colorMap={colorMap}
          onPropertyChange={onPropertyChange}
          onRevertNode={onRevertNode}
          expanded={propsExpanded}
          onToggle={() => setPropsExpanded(v => !v)}
        />

        <QualityZone
          score={score}
          tags={tags}
          iteration={iteration}
          maxIterations={maxIterations}
          selectedNode={selectedNode}
          onAddTag={onAddTag}
          mechanicalAudit={mechanicalAudit}
          mechanicalAuditLoading={mechanicalAuditLoading}
          visionAudit={visionAudit}
          visionAuditLoading={visionAuditLoading}
          onRunVisionAudit={onRunVisionAudit}
          visionAuditAvailable={visionAuditAvailable}
          onFixIssue={onFixIssue}
          onFixAll={onFixAll}
          onFixMechanical={onFixMechanical}
          mechanicalFixLoading={mechanicalFixLoading}
          fixPhase={fixPhase}
          fixingIssueId={fixingIssueId}
          previousScore={previousScore}
          addressedIssues={addressedIssues}
          expanded={qualityExpanded}
          onToggle={() => setQualityExpanded(v => !v)}
        />
      </ScrollArea>

      {/* Chat is pinned to bottom */}
      <ChatZone
        onChatSubmit={onChatSubmit}
        chatDisabled={chatDisabled}
        expanded={chatExpanded}
        onToggle={() => setChatExpanded(v => !v)}
      />
    </Box>
  );
}
