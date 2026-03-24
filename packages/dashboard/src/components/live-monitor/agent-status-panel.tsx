'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';

export interface AgentStatusPanelProps {
  agentId: string;
}

/**
 * Left panel showing agent identity, current objective, and pending task queue.
 */
export function AgentStatusPanel({ agentId }: AgentStatusPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Agent Identity */}
      <Card header="Agent Identity">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">ID</span>
            <span className="font-mono text-text-secondary">{agentId}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Name</span>
            <span className="text-text-primary font-medium">Code Generator</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Status</span>
            <Badge variant="warning">Executing</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Uptime</span>
            <span className="text-text-secondary">2h 14m</span>
          </div>
        </div>
      </Card>

      {/* Current Objective */}
      <Card header="Current Objective">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text-primary">
            TSK-002: Create dashboard layout
          </p>
          <p className="text-xs text-text-muted">
            Build the main dashboard shell with sidebar navigation, header bar,
            and content area using the project design system.
          </p>
          <div className="mt-1">
            <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
              <span>Progress</span>
              <span className="text-text-secondary">72%</span>
            </div>
            <ProgressBar value={72} color="bg-accent-blue" />
          </div>
        </div>
      </Card>

      {/* Pending Queue */}
      <Card header="Pending Queue">
        <div className="flex flex-col gap-2">
          {[
            { id: 'TSK-003', title: 'Add pipeline visualization', priority: 'high' },
            { id: 'TSK-004', title: 'Implement approval center', priority: 'medium' },
            { id: 'TSK-005', title: 'Write unit tests for layout', priority: 'low' },
          ].map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2"
            >
              <div>
                <span className="text-xs font-mono text-text-muted">{task.id}</span>
                <p className="text-xs text-text-secondary">{task.title}</p>
              </div>
              <Badge
                variant={
                  task.priority === 'high'
                    ? 'danger'
                    : task.priority === 'medium'
                      ? 'warning'
                      : 'default'
                }
              >
                {task.priority}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
