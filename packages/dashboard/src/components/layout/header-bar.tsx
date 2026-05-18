'use client';

import { useSyncExternalStore } from 'react';
import {
  Group,
  Text,
  Badge,
  Progress,
  ActionIcon,
  Divider,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconSun,
  IconMoon,
  IconBell,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';

export interface HeaderBarProps {
  phase?: string;
  budgetUsed?: number;
  budgetTotal?: number;
  activeAgents?: number;
  unreadCount?: number;
  activityOpen?: boolean;
  onToggleActivity?: () => void;
}

export function HeaderBar({
  phase,
  budgetUsed = 0,
  budgetTotal = 0,
  activeAgents = 0,
  unreadCount = 0,
  activityOpen,
  onToggleActivity,
}: HeaderBarProps): React.JSX.Element {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const effectiveScheme = mounted ? colorScheme : 'dark';

  const budgetPct = budgetTotal > 0 ? (budgetUsed / budgetTotal) * 100 : 0;
  const budgetColor =
    budgetPct > 80 ? 'red' : budgetPct > 50 ? 'yellow' : 'green';

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      {/* Left: CHIP brand */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={effectiveScheme === 'light' ? '/chip-full-logo-creme.png' : '/chip-full-logo-dark.png'}
        alt="CHIP — Crafted Human Intelligence Platform"
        style={{ height: 42, width: 'auto', objectFit: 'contain', maxWidth: 200 }}
      />

      {/* Right cluster */}
      <Group gap="md" wrap="nowrap">
        {/* Phase badge — only shown when a run is active */}
        {phase && (
          <>
            <Badge variant="light" color="grape" size="md" radius="xl">
              {phase}
            </Badge>
            <Divider orientation="vertical" color="var(--color-border)" />
          </>
        )}

        {/* Budget summary — only shown when budget is configured */}
        {budgetTotal > 0 && (
          <>
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="var(--color-text-secondary)" style={{ whiteSpace: 'nowrap' }}>
                ${budgetUsed.toFixed(2)} / ${budgetTotal.toFixed(0)}
              </Text>
              <Progress
                value={Math.min(budgetPct, 100)}
                color={budgetColor}
                size="sm"
                w={80}
                radius="xl"
              />
            </Group>
            <Divider orientation="vertical" color="var(--color-border)" />
          </>
        )}

        {/* Active agents — only shown when agents are running */}
        {activeAgents > 0 && (
          <>
            <Group gap={6} wrap="nowrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
              </span>
              <Text size="xs" c="var(--color-text-secondary)">
                {activeAgents} agent{activeAgents !== 1 ? 's' : ''}
              </Text>
            </Group>
            <Divider orientation="vertical" color="var(--color-border)" />
          </>
        )}

        {/* Notification bell */}
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          radius="sm"
          size="md"
          style={{ position: 'relative' }}
        >
          <IconBell size={18} stroke={1.5} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-accent-red)',
                border: '1.5px solid var(--color-sidebar)',
              }}
            />
          )}
        </ActionIcon>

        {/* Theme toggle */}
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={toggleColorScheme}
          aria-label="Toggle color scheme"
          radius="sm"
          size="md"
        >
          {effectiveScheme === 'dark' ? (
            <IconSun size={18} stroke={1.5} />
          ) : (
            <IconMoon size={18} stroke={1.5} />
          )}
        </ActionIcon>

        {/* Activity sidebar toggle */}
        {onToggleActivity && (
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onToggleActivity}
            aria-label={activityOpen ? 'Close activity panel' : 'Open activity panel'}
            radius="sm"
            size="md"
          >
            {activityOpen ? (
              <IconLayoutSidebarRightCollapse size={18} stroke={1.5} />
            ) : (
              <IconLayoutSidebarRight size={18} stroke={1.5} />
            )}
          </ActionIcon>
        )}
      </Group>
    </Group>
  );
}
