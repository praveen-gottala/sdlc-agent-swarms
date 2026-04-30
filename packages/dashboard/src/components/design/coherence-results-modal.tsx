'use client';

import React from 'react';
import { Stack, Text, Alert, Paper, UnstyledButton, Group } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { Modal } from '../ui/modal';
import { Badge } from '../ui/badge';
import type { CoherenceResult } from '../../lib/design/coherence-check';

export interface CoherenceResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: CoherenceResult[];
  warnings: string[];
  onSelectPage: (pageId: string) => void;
}

export function CoherenceResultsModal({
  open,
  onClose,
  results,
  warnings,
  onSelectPage,
}: CoherenceResultsModalProps) {
  const allPassed =
    results.length > 0 &&
    results.every(
      (r) =>
        r.navigationCoverage.missingPages.length === 0 &&
        r.dataFieldCoverage.every((d) => d.missingFields.length === 0),
    );

  return (
    <Modal open={open} onClose={onClose} title="Coherence Check Results" width="max-w-2xl">
      <Stack gap="lg" style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {warnings.length > 0 && (
          <Stack gap={4}>
            {warnings.map((w, i) => (
              <Text key={i} size="xs" c="yellow">{w}</Text>
            ))}
          </Stack>
        )}

        {allPassed && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            All checks passed — no gaps found.
          </Alert>
        )}

        {results.length === 0 && (
          <Text size="sm" c="dimmed">
            No designs to check. Approve or render at least 2 pages first.
          </Text>
        )}

        {results.map((result) => (
          <PageResult key={result.pageId} result={result} onSelectPage={onSelectPage} />
        ))}
      </Stack>
    </Modal>
  );
}

function PageResult({
  result,
  onSelectPage,
}: {
  result: CoherenceResult;
  onSelectPage: (pageId: string) => void;
}) {
  const { navigationCoverage: nav, dataFieldCoverage: data } = result;
  const navOk = nav.missingPages.length === 0;
  const allDataOk = data.every((d) => d.missingFields.length === 0);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Text size="sm" fw={600}>{result.pageName}</Text>
          {navOk && allDataOk && <Badge variant="success">Pass</Badge>}
        </Group>

        <Stack gap={6}>
          <Group gap="xs">
            <Text size="xs" fw={500} c="dimmed">Navigation</Text>
            <Badge variant={navOk ? 'success' : 'warning'}>
              {nav.foundPages.length}/{nav.expectedPages.length}
            </Badge>
          </Group>
          {nav.missingPages.length > 0 && (
            <Stack gap={2} pl="xs">
              <Text size="xs" c="dimmed">Missing page references:</Text>
              {nav.missingPages.map((p) => (
                <UnstyledButton key={p.id} onClick={() => onSelectPage(p.id)}>
                  <Text size="xs" c="blue" td="underline">{p.name} ({p.route})</Text>
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </Stack>

        {data.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" fw={500} c="dimmed">Data Fields</Text>
            {data.map((model) => {
              const ok = model.missingFields.length === 0;
              return (
                <Stack key={model.modelName} gap={2} pl="xs">
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{model.modelName}</Text>
                    <Badge variant={ok ? 'success' : 'warning'}>
                      {model.foundFields.length}/{model.expectedFields.length}
                    </Badge>
                  </Group>
                  {model.missingFields.length > 0 && (
                    <Text size="xs" c="dimmed">
                      Missing: {model.missingFields.join(', ')}
                    </Text>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
