'use client';

import { useEffect, useState } from 'react';
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
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-react';

export interface HeaderBarProps {
  title: string;
  phase?: string;
  budgetUsed?: number;
  budgetTotal?: number;
  activeAgents?: number;
  activityOpen?: boolean;
  onToggleActivity?: () => void;
}

export function HeaderBar({
  title,
  phase = 'Code Gen Phase',
  budgetUsed = 27.5,
  budgetTotal = 200,
  activeAgents = 4,
  activityOpen,
  onToggleActivity,
}: HeaderBarProps): React.JSX.Element {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const fmt = () =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const [clock, setClock] = useState(fmt);

  useEffect(() => {
    const id = setInterval(() => setClock(fmt()), 60_000);
    return () => clearInterval(id);
  }, []);

  const budgetPct = budgetTotal > 0 ? (budgetUsed / budgetTotal) * 100 : 0;
  const budgetColor =
    budgetPct > 80 ? 'red' : budgetPct > 50 ? 'yellow' : 'green';

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      {/* Left: title */}
      <Text fw={600} size="lg" c="var(--color-text-primary)" truncate>
        {title}
      </Text>

      {/* Right cluster */}
      <Group gap="md" wrap="nowrap">
        {/* Phase badge */}
        <Badge variant="light" color="grape" size="md" radius="xl">
          {phase}
        </Badge>

        <Divider orientation="vertical" color="var(--color-border)" />

        {/* Budget summary */}
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

        {/* Active agents — only shown when agents are running */}
        {activeAgents > 0 && (
          <Group gap={6} wrap="nowrap">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
            </span>
            <Text size="xs" c="var(--color-text-secondary)">
              {activeAgents} agent{activeAgents !== 1 ? 's' : ''}
            </Text>
          </Group>
        )}

        <Divider orientation="vertical" color="var(--color-border)" />

        {/* Theme toggle */}
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={toggleColorScheme}
          aria-label="Toggle color scheme"
          radius="sm"
          size="md"
        >
          {colorScheme === 'dark' ? (
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

        {/* Clock — HH:MM only, updates every minute */}
        <Text
          size="xs"
          c="var(--color-text-muted)"
          ff="monospace"
          style={{ minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          suppressHydrationWarning
        >
          {clock}
        </Text>
      </Group>
    </Group>
  );
}
