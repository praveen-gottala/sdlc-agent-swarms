'use client';

import { Box, Text, Button, Stack } from '@mantine/core';
import Link from 'next/link';
import type { Icon } from '@tabler/icons-react';

interface EmptyStateAction {
  label: string;
  href: string;
}

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  compact?: boolean;
}

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps): React.JSX.Element {
  return (
    <Stack
      align="center"
      justify="center"
      gap={compact ? 'xs' : 'md'}
      py={compact ? 'xl' : 48}
      style={{ animation: 'fade-in 0.4s ease-out forwards' }}
    >
      <Box
        style={{
          animation: 'float 3s ease-in-out infinite',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          borderRadius: 14,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
        }}
      >
        <IconComponent
          size={compact ? 20 : 28}
          stroke={1.5}
          style={{ color: 'var(--color-text-muted)' }}
        />
      </Box>

      <Text
        size={compact ? 'sm' : 'md'}
        fw={600}
        c="var(--color-text-primary)"
        ta="center"
      >
        {title}
      </Text>

      <Text
        size={compact ? 'xs' : 'sm'}
        c="var(--color-text-muted)"
        ta="center"
        maw={320}
        lh={1.5}
      >
        {description}
      </Text>

      {action && (
        <Button
          component={Link}
          href={action.href}
          variant="light"
          color="indigo"
          size={compact ? 'xs' : 'sm'}
          radius="md"
          mt={compact ? 4 : 8}
        >
          {action.label}
        </Button>
      )}
    </Stack>
  );
}
