'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Timeline,
  Text,
  ScrollArea,
  Badge,
  Group,
  ActionIcon,
  Progress,
  Box,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCircleCheck,
  IconRobot,
  IconShield,
  IconCoin,
  IconRefresh as IconRefreshIcon,
  IconAlertTriangle,
  IconCircleX,
  IconInfoCircle,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { useEventFeed, type FeedEvent } from '@/lib/hooks/use-event-feed';

interface HitlPhaseConfig {
  phase: string;
  level: 'full' | 'selective' | 'audit-only';
}

const HITL_CONFIG: HitlPhaseConfig[] = [
  { phase: 'Spec', level: 'full' },
  { phase: 'Code Gen', level: 'selective' },
  { phase: 'Review', level: 'selective' },
  { phase: 'Test', level: 'audit-only' },
  { phase: 'Deploy', level: 'full' },
];

const LEVEL_COLORS: Record<HitlPhaseConfig['level'], string> = {
  full: 'green',
  selective: 'yellow',
  'audit-only': 'blue',
};

function getEventIcon(event: FeedEvent): React.ReactNode {
  const type = event.type.toLowerCase();
  if (type.includes('approve') || type.includes('complete'))
    return <IconCircleCheck size={14} />;
  if (type.includes('agent') || type.includes('started'))
    return <IconRobot size={14} />;
  if (type.includes('governance') || type.includes('trust'))
    return <IconShield size={14} />;
  if (type.includes('budget') || type.includes('cost'))
    return <IconCoin size={14} />;
  if (type.includes('pipeline') || type.includes('phase'))
    return <IconPlayerPlay size={14} />;
  if (event.severity === 'error') return <IconCircleX size={14} />;
  if (event.severity === 'warning') return <IconAlertTriangle size={14} />;
  return <IconInfoCircle size={14} />;
}

function getEventColor(event: FeedEvent): string {
  if (event.severity === 'error') return 'red';
  if (event.severity === 'warning') return 'yellow';
  if (event.severity === 'success') return 'green';
  return 'blue';
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ActiveRunInfo {
  runId: string;
  type: string;
  stage: string | null;
  agentRole: string | null;
  progress: { current: number; total: number; label: string } | null;
}

const PIPELINE_LABELS: Record<string, string> = {
  init: 'Project Init',
  'design-generate': 'Spec Generation',
  'design-penpot': 'Design Pipeline',
};

export function ActivitySidebar(): React.JSX.Element {
  const { events, isLive, refresh: refreshEvents } = useEventFeed();
  const [activeRuns, setActiveRuns] = useState<ActiveRunInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs?limit=5');
      if (!res.ok) return;
      const data = await res.json();
      const running = (data.runs ?? []).filter(
        (r: ActiveRunInfo & { status: string }) =>
          r.status === 'running' || r.status === 'pending',
      );
      setActiveRuns(running);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/runs?limit=5');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const running = (data.runs ?? []).filter(
          (r: ActiveRunInfo & { status: string }) =>
            r.status === 'running' || r.status === 'pending',
        );
        setActiveRuns(running);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRuns(), refreshEvents()]);
    setRefreshing(false);
  };

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Running pipelines */}
      {activeRuns.length > 0 && (
        <Box className="border-b border-border" px="md" py="sm">
          <Text size="sm" fw={600} c="var(--color-text-primary)" mb="xs">
            Running Pipelines
          </Text>
          {activeRuns.map((run) => (
            <Box
              key={run.runId}
              className="glass"
              p="xs"
              mb="xs"
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
            >
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={500} c="var(--color-text-primary)">
                  {PIPELINE_LABELS[run.type] ?? run.type}
                </Text>
                <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              </Group>
              {run.progress && (
                <>
                  <Progress
                    value={Math.round(
                      (run.progress.current / run.progress.total) * 100,
                    )}
                    size="xs"
                    color="blue"
                    radius="xl"
                    mb={4}
                  />
                  <Text size="xs" c="var(--color-text-muted)">
                    {run.progress.label} ({run.progress.current}/
                    {run.progress.total})
                  </Text>
                </>
              )}
              {run.agentRole && (
                <Text size="xs" c="var(--color-text-secondary)">
                  Agent: {run.agentRole.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </Text>
              )}
              {run.stage && (
                <Text size="xs" c="var(--color-text-muted)">
                  Stage: {run.stage}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Event feed */}
      <ScrollArea flex={1} px="md" pt="md">
        <Group justify="space-between" mb="xs">
          <Group gap={8}>
            <Text size="sm" fw={600} c="var(--color-text-primary)">
              Activity
            </Text>
            {isLive && (
              <Badge size="xs" variant="light" color="green" radius="xl" styles={{ root: { textTransform: 'uppercase', fontSize: 9, fontWeight: 700 } }}>
                Live
              </Badge>
            )}
          </Group>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => void handleRefresh()}
            loading={refreshing}
            aria-label="Refresh activity feed"
          >
            <IconRefreshIcon size={14} />
          </ActionIcon>
        </Group>

        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10" style={{ animation: 'fade-in 0.4s ease-out forwards' }}>
            <div
              className="w-10 h-10 rounded-xl border border-border flex items-center justify-center bg-bg-elevated"
              style={{ animation: 'float 3s ease-in-out infinite' }}
            >
              <IconRefreshIcon size={18} style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <Text size="xs" c="var(--color-text-muted)" ta="center" maw={180} lh={1.5}>
              Activity events stream here during pipeline runs
            </Text>
          </div>
        ) : (
          <Timeline active={0} bulletSize={24} lineWidth={2} color="dark.4">
            {events.map((event) => (
              <Timeline.Item
                key={event.id}
                bullet={
                  <ThemeIcon
                    size={24}
                    variant="light"
                    color={getEventColor(event)}
                    radius="xl"
                  >
                    {getEventIcon(event)}
                  </ThemeIcon>
                }
              >
                <Text size="xs" c="var(--color-text-secondary)" lh={1.4}>
                  {event.message}
                </Text>
                <Text size="xs" c="var(--color-text-muted)" mt={2}>
                  {formatRelativeTime(event.timestamp)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </ScrollArea>

      {/* HITL config summary */}
      <Box className="border-t border-border" px="md" py="sm">
        <Text size="xs" fw={600} c="var(--color-text-primary)" mb="xs">
          HITL Configuration
        </Text>
        {HITL_CONFIG.map((cfg) => (
          <Group key={cfg.phase} justify="space-between" mb={4}>
            <Text size="xs" c="var(--color-text-muted)">
              {cfg.phase}
            </Text>
            <Badge
              size="xs"
              variant="light"
              color={LEVEL_COLORS[cfg.level]}
              radius="xl"
            >
              {cfg.level}
            </Badge>
          </Group>
        ))}
      </Box>
    </Box>
  );
}
