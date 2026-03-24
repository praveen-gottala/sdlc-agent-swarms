'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';

export interface McpCardProps {
  name: string;
  uri: string;
  connected: boolean;
  tools: string[];
  rateLimit: { current: number; max: number };
  calls24h: number;
  errors24h: number;
}

/**
 * Card displaying an MCP server's connection status, tools, and health metrics.
 */
export function McpCard({
  name,
  uri,
  connected,
  tools,
  rateLimit,
  calls24h,
  errors24h,
}: McpCardProps) {
  return (
    <Card hover>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
            <p className="text-xs text-text-muted font-mono">{uri}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={[
                'inline-block h-2 w-2 rounded-full',
                connected ? 'bg-accent-green' : 'bg-accent-red',
              ].join(' ')}
            />
            <span className="text-xs text-text-muted">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Tools */}
        <div>
          <p className="mb-1 text-xs text-text-muted">Tools</p>
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <Tag key={tool} color="blue">
                {tool}
              </Tag>
            ))}
          </div>
        </div>

        {/* Health metrics */}
        <div className="grid grid-cols-4 gap-2 rounded-md bg-bg-elevated px-3 py-2">
          <div className="text-center">
            <p className="text-xs text-text-muted">Auth</p>
            <p className="text-xs font-semibold text-accent-green">OK</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Rate</p>
            <p className="text-xs font-semibold text-text-primary">
              {rateLimit.current}/{rateLimit.max}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Calls/24h</p>
            <p className="text-xs font-semibold text-text-primary">{calls24h}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Errors</p>
            <p className={[
              'text-xs font-semibold',
              errors24h > 0 ? 'text-accent-red' : 'text-accent-green',
            ].join(' ')}>
              {errors24h}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            Ping
          </Button>
          <Button size="sm" variant="ghost">
            Config
          </Button>
        </div>
      </div>
    </Card>
  );
}
