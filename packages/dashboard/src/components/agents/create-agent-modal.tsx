'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
}

const ALL_PERMISSIONS = [
  'read_spec',
  'write_spec',
  'read_code',
  'write_code',
  'create_branch',
  'create_pr',
  'merge_pr',
  'trigger_ci',
  'read_ci_logs',
  'deploy_staging',
] as const;

type Permission = (typeof ALL_PERMISSIONS)[number];

interface SectionProps {
  title: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ title, index, expanded, onToggle, children }: SectionProps) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-bg-elevated"
      >
        <span className="text-sm font-semibold text-text-primary">
          <span className="mr-2 text-text-muted">{index}.</span>
          {title}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={[
            'text-text-muted transition-transform',
            expanded ? 'rotate-180' : '',
          ].join(' ')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

/**
 * Seven-section modal for creating a new agent.
 */
export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true });
  const [selectedHitl, setSelectedHitl] = useState<string>('review_and_override');
  const [allowedPerms, setAllowedPerms] = useState<Permission[]>([
    'read_spec',
    'read_code',
    'read_ci_logs',
  ]);
  const [deniedPerms, setDeniedPerms] = useState<Permission[]>([
    'merge_pr',
    'deploy_staging',
  ]);

  const toggle = (section: number) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const movePermission = (perm: Permission, to: 'allowed' | 'denied') => {
    if (to === 'allowed') {
      setDeniedPerms((prev) => prev.filter((p) => p !== perm));
      setAllowedPerms((prev) => (prev.includes(perm) ? prev : [...prev, perm]));
    } else {
      setAllowedPerms((prev) => prev.filter((p) => p !== perm));
      setDeniedPerms((prev) => (prev.includes(perm) ? prev : [...prev, perm]));
    }
  };

  const hitlOptions = [
    { key: 'full_approval', label: 'Full Approval', desc: 'Human must approve every action' },
    { key: 'review_and_override', label: 'Review & Override', desc: 'Agent acts, human can override' },
    { key: 'notify_only', label: 'Notify Only', desc: 'Agent acts, human is notified' },
    { key: 'autonomous', label: 'Autonomous', desc: 'Agent acts independently' },
  ];

  const unassigned = ALL_PERMISSIONS.filter(
    (p) => !allowedPerms.includes(p) && !deniedPerms.includes(p),
  );

  return (
    <Modal open={open} onClose={onClose} title="Create Agent" width="max-w-3xl">
      <div className="max-h-[70vh] overflow-y-auto -mx-5 -mt-5">
        {/* 1. Identity & Role */}
        <Section title="Identity & Role" index={1} expanded={!!expanded[1]} onToggle={() => toggle(1)}>
          <div className="grid gap-4">
            <Input label="Name" placeholder="e.g. Code Reviewer" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Description</label>
              <textarea
                className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-ring transition-colors hover:border-text-muted"
                rows={3}
                placeholder="Describe what this agent does..."
              />
            </div>
            <Select
              label="Category"
              placeholder="Select category"
              options={[
                { label: 'Code Generation', value: 'code-gen' },
                { label: 'Spec Writing', value: 'spec-writer' },
                { label: 'Testing', value: 'test-runner' },
                { label: 'Design', value: 'design' },
                { label: 'CI/CD', value: 'cicd' },
                { label: 'Review', value: 'review' },
                { label: 'Custom', value: 'custom' },
              ]}
            />
          </div>
        </Section>

        {/* 2. LLM Config */}
        <Section title="LLM Config" index={2} expanded={!!expanded[2]} onToggle={() => toggle(2)}>
          <div className="grid gap-4">
            <Select
              label="Provider"
              options={[
                { label: 'Claude Sonnet 4', value: 'claude-sonnet-4' },
                { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
                { label: 'Claude Opus 4', value: 'claude-opus-4' },
                { label: 'GPT-4o', value: 'gpt-4o' },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Execution Mode</label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">Sequential</span>
                <button
                  type="button"
                  className="relative h-6 w-11 rounded-full bg-accent-blue transition-colors"
                  aria-label="Toggle execution mode"
                >
                  <span className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white transition-transform" />
                </button>
                <span className="text-xs text-text-secondary">Parallel</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">
                Temperature: <span className="text-text-muted">0.7</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                defaultValue="0.7"
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-bg-elevated accent-accent-blue"
              />
              <div className="flex justify-between text-xs text-text-muted">
                <span>0 (Precise)</span>
                <span>1 (Creative)</span>
              </div>
            </div>
          </div>
        </Section>

        {/* 3. Context Injection */}
        <Section title="Context Injection" index={3} expanded={!!expanded[3]} onToggle={() => toggle(3)}>
          <div className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Spec Sections</label>
              <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-muted">
                Click to select spec sections...
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border bg-bg-elevated accent-accent-blue"
              />
              Include agent learnings
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-bg-elevated accent-accent-blue"
              />
              Include ADRs
            </label>
          </div>
        </Section>

        {/* 4. Permissions */}
        <Section title="Permissions" index={4} expanded={!!expanded[4]} onToggle={() => toggle(4)}>
          <div className="grid grid-cols-2 gap-4">
            {/* Allowed */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-green">
                Allowed
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {allowedPerms.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => movePermission(perm, 'denied')}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-green/15 px-2.5 py-0.5 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/25"
                  >
                    {perm}
                    <span aria-hidden="true" className="text-[10px]">x</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Denied */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-red">
                Denied
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {deniedPerms.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => movePermission(perm, 'allowed')}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-red/15 px-2.5 py-0.5 text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/25"
                  >
                    {perm}
                    <span aria-hidden="true" className="text-[10px]">x</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div className="mt-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Unassigned
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => movePermission(perm, 'allowed')}
                    className="inline-flex items-center rounded-full bg-bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:bg-border/50"
                  >
                    {perm}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* 5. HITL Policy */}
        <Section title="HITL Policy" index={5} expanded={!!expanded[5]} onToggle={() => toggle(5)}>
          <div className="grid grid-cols-2 gap-3">
            {hitlOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedHitl(opt.key)}
                className={[
                  'rounded-lg border p-3 text-left transition-colors',
                  selectedHitl === opt.key
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-border bg-bg-elevated hover:border-text-muted',
                ].join(' ')}
              >
                <p className={[
                  'text-sm font-semibold',
                  selectedHitl === opt.key ? 'text-accent-blue' : 'text-text-primary',
                ].join(' ')}>
                  {opt.label}
                </p>
                <p className="mt-1 text-xs text-text-muted">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* 6. Budget & Guardrails */}
        <Section title="Budget & Guardrails" index={6} expanded={!!expanded[6]} onToggle={() => toggle(6)}>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Max Tokens" type="number" placeholder="16000" defaultValue="16000" />
            <Input label="Max Cost ($)" type="number" placeholder="5.00" defaultValue="5.00" />
            <Input label="Max Retries" type="number" placeholder="3" defaultValue="3" />
            <Select
              label="Retry Strategy"
              options={[
                { label: 'Exponential Backoff', value: 'exponential' },
                { label: 'Linear', value: 'linear' },
                { label: 'Fixed Delay', value: 'fixed' },
                { label: 'None', value: 'none' },
              ]}
            />
          </div>
        </Section>

        {/* 7. Tools & Events */}
        <Section title="Tools & Events" index={7} expanded={!!expanded[7]} onToggle={() => toggle(7)}>
          <div className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Tools</label>
              <div className="flex flex-wrap gap-1.5">
                {['file_read', 'file_write', 'shell_exec', 'git_commit', 'http_request'].map(
                  (tool) => (
                    <Badge key={tool} variant="info">
                      {tool}
                    </Badge>
                  ),
                )}
              </div>
            </div>
            <Select
              label="On Complete"
              options={[
                { label: 'Emit TaskCompleted event', value: 'emit_task_completed' },
                { label: 'Notify human', value: 'notify_human' },
                { label: 'Chain to next agent', value: 'chain_next' },
                { label: 'None', value: 'none' },
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-bg-elevated accent-accent-blue"
              />
              Allow delegation to other agents
            </label>
          </div>
        </Section>
      </div>

      {/* Footer buttons */}
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary">Create Agent</Button>
      </div>
    </Modal>
  );
}
