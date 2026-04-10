'use client';

import React, { useState, useEffect } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChannelCard } from '@/components/integrations/channel-card';
import { McpCard } from '@/components/integrations/mcp-card';
import { ProviderCard } from '@/components/integrations/provider-card';
import { DesignToolCard } from '@/components/integrations/design-tool-card';
import { EscalationPolicy } from '@/components/integrations/escalation-policy';

const tabs = [
  { label: 'Channels', value: 'channels' },
  { label: 'MCP Servers', value: 'mcp' },
  { label: 'LLM Providers', value: 'providers' },
  { label: 'Design Tools', value: 'design' },
];

type ChannelType = 'slack' | 'telegram' | 'cli' | 'whatsapp' | 'discord' | 'email' | 'teams';

interface ChannelData {
  id: string;
  name: string;
  type: ChannelType;
  connected: boolean;
  priority: number;
  capability: 'full' | 'approvals' | 'basic' | 'notify-only';
  routingTags: Array<{ name: string; color: string }>;
  lastPing: string;
}

/** Map API channel types to supported ChannelType values. */
const CHANNEL_TYPE_MAP: Record<string, ChannelType> = {
  slack: 'slack',
  telegram: 'telegram',
  cli: 'cli',
  whatsapp: 'whatsapp',
  discord: 'discord',
  email: 'email',
  teams: 'teams',
};

const ROUTING_COLORS: Record<string, string> = {
  approvals: 'purple',
  status_updates: 'blue',
  critical_alerts: 'red',
  all: 'green',
};

const CAPABILITY_MAP: Record<string, 'full' | 'approvals' | 'basic' | 'notify-only'> = {
  full: 'full',
  approvals: 'approvals',
  basic: 'basic',
  'notify-only': 'notify-only',
};

interface McpData {
  name: string;
  uri: string;
  connected: boolean;
  tools: string[];
  rateLimit: { current: number; max: number };
  calls24h: number;
  errors24h: number;
}

interface ProviderData {
  name: string;
  models: string[];
  connected: boolean;
  keyStatus: string;
  spend24h: number;
  calls24h: number;
}

interface DesignToolData {
  name: string;
  type: string;
  connected: boolean;
  capabilities: string[];
}

/**
 * Integrations page with tabbed navigation across channels, MCP servers, providers, and design tools.
 */
export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState('channels');
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [mcpServers, setMcpServers] = useState<McpData[]>([]);
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [designTools, setDesignTools] = useState<DesignToolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [testChannel, setTestChannel] = useState<ChannelData | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<ChannelData | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTest = async (channel: ChannelData) => {
    setTestChannel(channel);
    setTestStatus('testing');
    setTestLatency(null);
    setTestError(null);
    try {
      const res = await fetch(`/api/channels/${channel.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestLatency(data.roundTripMs ?? null);
        setTestStatus('success');
      } else {
        setTestError(data.error ?? 'Test failed');
        setTestStatus('error');
      }
    } catch {
      setTestError('Network error — could not reach the server');
      setTestStatus('error');
    }
  };

  const handleCloseTest = () => {
    setTestChannel(null);
    setTestStatus('idle');
    setTestLatency(null);
    setTestError(null);
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/channels').then(res => res.json()).catch(() => ({ channels: [] })),
      fetch('/api/mcp').then(res => res.json()).catch(() => ({ servers: [] })),
      fetch('/api/providers').then(res => res.json()).catch(() => ({ providers: [] })),
      fetch('/api/design').then(res => res.json()).catch(() => ({ design: {} })),
    ]).then(([channelsJson, mcpJson, providersJson, designJson]) => {
      // Map channels API response
      const apiChannels = channelsJson.channels ?? [];
      const mappedChannels: ChannelData[] = apiChannels.map((ch: Record<string, unknown>, idx: number) => {
        const routing = (ch.routing as string[]) ?? [];
        return {
          id: (ch.id as string) ?? `ch-${ch.type}-${String(idx)}`,
          name: ch.name as string,
          type: CHANNEL_TYPE_MAP[(ch.type as string)] ?? 'cli',
          connected: (ch.status as string) === 'connected',
          priority: (ch.priority as number) ?? 0,
          capability: CAPABILITY_MAP[(ch.capabilities as string)] ?? 'full',
          routingTags: routing.map(r => ({ name: r, color: ROUTING_COLORS[r] ?? 'gray' })),
          lastPing: ch.lastPing ? getTimeSince(ch.lastPing as string) : 'never',
        };
      });
      setChannels(mappedChannels);

      // Map MCP servers API response
      const apiServers = mcpJson.servers ?? [];
      const mappedMcp: McpData[] = apiServers.map((s: Record<string, unknown>) => ({
        name: s.name as string,
        uri: (s.uri as string) ?? '',
        connected: (s.status as string) === 'connected',
        tools: (s.tools as string[]) ?? [],
        rateLimit: { current: (s.calls24h as number) ?? 0, max: (s.rateLimitRpm as number) ?? 60 },
        calls24h: (s.calls24h as number) ?? 0,
        errors24h: (s.errors24h as number) ?? 0,
      }));
      setMcpServers(mappedMcp);

      // Map providers API response
      const apiProviders = providersJson.providers ?? [];
      const mappedProviders: ProviderData[] = apiProviders.map((p: Record<string, unknown>) => {
        const models = (p.models as Array<Record<string, unknown>>) ?? [];
        const usage = (p.usageToday as Record<string, number>) ?? {};
        return {
          name: p.name as string,
          models: models.map(m => m.name as string),
          connected: (p.status as string) === 'active',
          keyStatus: (p.apiKeyConfigured as boolean) ? 'Configured' : 'Not configured',
          spend24h: usage.spend ?? 0,
          calls24h: usage.calls ?? 0,
        };
      });
      setProviders(mappedProviders);

      // Map design tools API response
      const design = designJson.design ?? {};
      const tools: DesignToolData[] = [];
      if (design.figma) {
        tools.push({
          name: 'Figma',
          type: 'figma',
          connected: design.figma.connected ?? false,
          capabilities: design.figma.capabilities ?? [],
        });
      }
      if (design.storybook) {
        tools.push({
          name: 'Storybook',
          type: 'storybook',
          connected: design.storybook.connected ?? false,
          capabilities: design.storybook.capabilities ?? [],
        });
      }
      setDesignTools(tools);

      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Integrations</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage external service connections, messaging channels, and tool providers.
        </p>
      </div>

      <Tabs items={tabs} value={activeTab} onChange={setActiveTab} className="mb-6" />

      {activeTab === 'channels' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.name}
                {...ch}
                onTest={() => handleTest(ch)}
                onSettings={() => setSettingsChannel(ch)}
              />
            ))}
          </div>
          <EscalationPolicy />
        </div>
      )}

      {activeTab === 'mcp' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mcpServers.map((s) => (
            <McpCard key={s.name} {...s} />
          ))}
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <ProviderCard key={p.name} {...p} />
          ))}
        </div>
      )}

      {activeTab === 'design' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designTools.length === 0 ? (
            <div className="col-span-full text-center text-text-muted py-8">No design tools configured</div>
          ) : (
            designTools.map((d) => (
              <DesignToolCard key={d.name} {...d} />
            ))
          )}
        </div>
      )}

      {/* Test Channel Modal */}
      <Modal open={!!testChannel} onClose={handleCloseTest} title={`Test — ${testChannel?.name ?? ''}`}>
        <div className="flex flex-col items-center gap-4 py-4">
          {testStatus === 'testing' && (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent-blue" />
              <p className="text-sm text-text-secondary">Sending test ping&hellip;</p>
            </>
          )}
          {testStatus === 'success' && (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-green/20 text-accent-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <p className="text-sm font-medium text-accent-green">Connection successful</p>
              <p className="text-xs text-text-muted">Test message delivered to {testChannel?.name}</p>
              {testLatency !== null && (
                <p className="text-xs text-text-muted">Round-trip: {testLatency}ms</p>
              )}
            </>
          )}
          {testStatus === 'error' && (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-red/20 text-accent-red">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </div>
              <p className="text-sm font-medium text-accent-red">Connection failed</p>
              <p className="text-xs text-text-muted">{testError ?? 'Channel is disconnected. Check your configuration.'}</p>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={handleCloseTest} className="mt-2">
            Close
          </Button>
        </div>
      </Modal>

      {/* Settings Channel Modal */}
      <Modal open={!!settingsChannel} onClose={() => setSettingsChannel(null)} title={`Settings — ${settingsChannel?.name ?? ''}`} width="max-w-md">
        {settingsChannel && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-muted mb-1">Channel Type</p>
                <p className="text-text-primary capitalize">{settingsChannel.type}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Status</p>
                <Badge variant={settingsChannel.connected ? 'success' : 'default'}>
                  {settingsChannel.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Priority</p>
                <p className="text-text-primary">{settingsChannel.priority}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Capability</p>
                <p className="text-text-primary capitalize">{settingsChannel.capability}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Last Ping</p>
                <p className="text-text-primary">{settingsChannel.lastPing}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1">Routing Rules</p>
              <div className="flex flex-wrap gap-1.5">
                {settingsChannel.routingTags.map((tag) => (
                  <span key={tag.name} className="inline-flex items-center rounded-full bg-bg-elevated px-2.5 py-0.5 text-xs text-text-secondary border border-border">
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" onClick={() => setSettingsChannel(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={saving}
                onClick={async () => {
                  if (!settingsChannel) return;
                  setSaving(true);
                  try {
                    await fetch(`/api/channels/${settingsChannel.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        priority: settingsChannel.priority,
                        capability: settingsChannel.capability,
                        routing: settingsChannel.routingTags.map((t) => t.name),
                      }),
                    });
                  } catch {
                    // Silently fail
                  }
                  setSaving(false);
                  setSettingsChannel(null);
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Helper to compute a human-readable "time since" string. */
function getTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
