'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Tag } from '@/components/ui/tag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface ProviderCardProps {
  name: string;
  models: string[];
  connected: boolean;
  keyStatus: string;
  spend24h: number;
  calls24h: number;
}

const providerIcon: Record<string, string> = {
  Anthropic: 'A',
  OpenAI: 'O',
  Google: 'G',
  Ollama: 'L',
};

/**
 * Card displaying an LLM provider's connection, models, and usage metrics.
 */
export function ProviderCard({
  name,
  models,
  connected,
  keyStatus,
  spend24h,
  calls24h,
}: ProviderCardProps) {
  return (
    <Card hover>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-purple/15 text-sm font-bold text-accent-purple">
              {providerIcon[name] ?? name.charAt(0)}
            </span>
            <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
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

        {/* Models */}
        <div>
          <p className="mb-1 text-xs text-text-muted">Models</p>
          <div className="flex flex-wrap gap-1">
            {models.map((model) => (
              <Tag key={model} color="purple">
                {model}
              </Tag>
            ))}
          </div>
        </div>

        {/* API Key status */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">API Key</span>
          <Badge variant="default">{keyStatus}</Badge>
        </div>

        {/* Usage metrics */}
        <div className="grid grid-cols-2 gap-2 rounded-md bg-bg-elevated px-3 py-2">
          <div className="text-center">
            <p className="text-xs text-text-muted">Spend/24h</p>
            <p className="text-sm font-semibold text-text-primary">${spend24h.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Calls/24h</p>
            <p className="text-sm font-semibold text-text-primary">{calls24h}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="danger">
            Rotate Key
          </Button>
          <Button size="sm" variant="secondary">
            Test
          </Button>
        </div>
      </div>
    </Card>
  );
}
