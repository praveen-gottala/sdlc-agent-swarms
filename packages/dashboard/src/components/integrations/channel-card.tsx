'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RoutingTags } from './routing-tags';
import type { RoutingTag } from './routing-tags';

export type ChannelType = 'slack' | 'telegram' | 'cli' | 'whatsapp' | 'discord' | 'email' | 'teams';
export type ChannelCapability = 'full' | 'approvals' | 'basic' | 'notify-only';

export interface ChannelCardProps {
  name: string;
  type: ChannelType;
  connected: boolean;
  priority: number;
  capability: ChannelCapability;
  routingTags: RoutingTag[];
  lastPing: string;
  onTest?: () => void;
  onSettings?: () => void;
}

const capabilityVariant: Record<ChannelCapability, 'success' | 'info' | 'warning' | 'default'> = {
  full: 'success',
  approvals: 'info',
  basic: 'warning',
  'notify-only': 'default',
};

const typeEmoji: Record<ChannelType, string> = {
  slack: '#',
  telegram: '@',
  cli: '>_',
  whatsapp: 'W',
  discord: 'D',
  email: '@',
  teams: 'T',
};

/**
 * Card displaying a messaging channel's connection status and configuration.
 */
export function ChannelCard({
  name,
  type,
  connected,
  priority,
  capability,
  routingTags,
  lastPing,
  onTest,
  onSettings,
}: ChannelCardProps) {
  return (
    <Card hover>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-elevated text-xs font-bold text-text-secondary">
              {typeEmoji[type]}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
              <p className="text-xs text-text-muted">Priority {priority}</p>
            </div>
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

        {/* Capability badge */}
        <div className="flex items-center justify-between">
          <Badge variant={capabilityVariant[capability]}>{capability}</Badge>
          <span className="text-xs text-text-muted">Last ping: {lastPing}</span>
        </div>

        {/* Routing tags */}
        <div>
          <p className="mb-1 text-xs text-text-muted">Routing</p>
          <RoutingTags tags={routingTags} />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onTest}>
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={onSettings}>
            Settings
          </Button>
        </div>
      </div>
    </Card>
  );
}
