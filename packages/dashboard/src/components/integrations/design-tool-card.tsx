'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';

export interface DesignToolCardProps {
  name: string;
  type: string;
  connected: boolean;
  capabilities: string[];
}

/**
 * Card displaying a design tool's connection status and capabilities.
 */
export function DesignToolCard({
  name,
  type,
  connected,
  capabilities,
}: DesignToolCardProps) {
  return (
    <Card hover>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
            <p className="text-xs text-text-muted">{type}</p>
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

        {/* Capabilities */}
        <div>
          <p className="mb-1 text-xs text-text-muted">Capabilities</p>
          <div className="flex flex-wrap gap-1">
            {capabilities.map((cap) => (
              <Tag key={cap} color="cyan">
                {cap}
              </Tag>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <Button size="sm" variant="secondary">
            Configure
          </Button>
        </div>
      </div>
    </Card>
  );
}
