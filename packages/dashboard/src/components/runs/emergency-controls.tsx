'use client';

import { useState } from 'react';
import { Button, Group, Modal, Text, Stack } from '@mantine/core';
import { IconPlayerPause, IconPlayerStop } from '@tabler/icons-react';

interface EmergencyControlsProps {
  hasActiveRun: boolean;
}

export function EmergencyControls({ hasActiveRun }: EmergencyControlsProps): React.JSX.Element {
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [loading, setLoading] = useState<'pause' | 'abort' | null>(null);

  async function handlePause(): Promise<void> {
    setLoading('pause');
    try {
      await fetch('/api/commands/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      window.location.reload();
    } catch {
      setLoading(null);
    }
  }

  async function handleAbort(): Promise<void> {
    setLoading('abort');
    setConfirmAbort(false);
    try {
      await fetch('/api/commands/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      window.location.reload();
    } catch {
      setLoading(null);
    }
  }

  return (
    <>
      <Group gap="xs">
        <Button
          variant="outline"
          color="orange"
          size="xs"
          leftSection={<IconPlayerPause size={14} />}
          disabled={!hasActiveRun}
          loading={loading === 'pause'}
          onClick={handlePause}
          data-testid="pause-all-btn"
        >
          Pause All
        </Button>
        <Button
          variant="outline"
          color="red"
          size="xs"
          leftSection={<IconPlayerStop size={14} />}
          disabled={!hasActiveRun}
          loading={loading === 'abort'}
          onClick={() => setConfirmAbort(true)}
          data-testid="abort-all-btn"
        >
          Abort All
        </Button>
      </Group>

      <Modal
        opened={confirmAbort}
        onClose={() => setConfirmAbort(false)}
        title="Abort all running tasks?"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="var(--color-text-secondary)">
            This will stop all running pipeline tasks. In-progress work may be lost.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" size="sm" onClick={() => setConfirmAbort(false)}>
              Cancel
            </Button>
            <Button color="red" size="sm" onClick={handleAbort} loading={loading === 'abort'}>
              Abort All
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
