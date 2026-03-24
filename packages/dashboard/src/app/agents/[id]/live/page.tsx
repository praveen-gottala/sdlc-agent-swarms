'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AgentStatusPanel } from '@/components/live-monitor/agent-status-panel';
import { LogConsole } from '@/components/live-monitor/log-console';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Live Agent Monitor page with three-panel layout:
 * agent status (left), log console (center), controls (top-right).
 * Fetches initial data from /api/agents/{id}/live.
 */
export default function LiveMonitorPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id;
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<string>('Executing');

  useEffect(() => {
    fetch(`/api/agents/${agentId}/live`)
      .then(res => res.json())
      .then(json => {
        // Use the last log entry to determine status
        const logs = json.logs ?? [];
        if (logs.length > 0) {
          const lastLog = logs[logs.length - 1];
          if ((lastLog.message as string)?.includes('Awaiting')) {
            setAgentStatus('Idle');
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Top bar with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-primary">Live Monitor</h1>
          <Badge variant="warning">{agentStatus}</Badge>
          <span className="text-xs text-text-muted font-mono">{agentId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary">
            Pause
          </Button>
          <Button size="sm" variant="danger">
            Stop
          </Button>
          <Button size="sm" variant="ghost">
            Intervene
          </Button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: Agent Status */}
        <div className="w-72 shrink-0 overflow-y-auto">
          <AgentStatusPanel agentId={agentId} />
        </div>

        {/* Center: Log Console */}
        <div className="flex-1 min-w-0">
          <LogConsole />
        </div>
      </div>
    </div>
  );
}
