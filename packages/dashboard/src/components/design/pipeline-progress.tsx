'use client';

import { useEffect, useState } from 'react';
import { Stepper, Text, Group, Stack, Alert, Loader, Center } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useRunProgress } from '@/lib/hooks/use-run-progress';
import type { StageTiming } from '@/lib/hooks/use-run-progress';
import { Button } from '../ui/button';

const STAGES = [
  { name: 'Research', agent: 'ux_research' },
  { name: 'Planning', agent: 'ux_planning' },
  { name: 'Design', agent: 'penpot_design' },
];

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(since).getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - new Date(since).getTime());
    }, 1_000);
    return () => clearInterval(timer);
  }, [since]);

  return <span>{formatElapsed(elapsed)}</span>;
}

interface PipelineProgressProps {
  runId: string | null;
  model?: string;
  onComplete?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function getStepColor(isDone: boolean, isActive: boolean, hasFailed: boolean): string | undefined {
  if (hasFailed) return 'red';
  if (isDone) return 'green';
  if (isActive) return 'blue';
  return undefined;
}

function getStatusColor(isDone: boolean, isActive: boolean, hasFailed: boolean): string {
  if (hasFailed) return 'red';
  if (isDone) return 'green';
  if (isActive) return 'blue';
  return 'dimmed';
}

export function PipelineProgress({ runId, model = 'claude-sonnet-4-6', onComplete, onRetry, onDismiss }: PipelineProgressProps) {
  const progress = useRunProgress(runId);

  const currentStageIdx = progress.progress?.current ?? 0;
  const isComplete = progress.status === 'complete';
  const isFailed = progress.status === 'failed';
  const isRunning = progress.status === 'running';
  const isPending = progress.status === 'pending';
  const isLoading = progress.status === null;

  useEffect(() => {
    if (isComplete && onComplete) {
      const timer = setTimeout(onComplete, 100);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  if (isLoading) {
    return (
      <Center h="100%" px="xl">
        <Group gap="xs">
          <Loader size="xs" color="blue" />
          <Text size="sm" c="dimmed">Loading pipeline status...</Text>
        </Group>
      </Center>
    );
  }

  const activeStep = isComplete ? STAGES.length : currentStageIdx;

  return (
    <Center h="100%" px="xl">
      <Stack align="center" gap="xs">
        <Text size="md" fw={600}>
          {isComplete ? 'Pipeline Complete' : isFailed ? 'Pipeline Failed' : 'Design Pipeline Running'}
        </Text>
        <Text size="sm" c="dimmed" mb="xl">
          {isComplete
            ? 'All stages completed successfully'
            : isFailed
              ? progress.error ?? 'An error occurred'
              : 'Research, Planning, and Design stages running sequentially'}
        </Text>

        <Stepper
          active={activeStep}
          size="sm"
          allowNextStepsSelect={false}
          color="green"
          maw="36rem"
          w="100%"
        >
          {STAGES.map((stage, idx) => {
            const isActive = (idx === currentStageIdx && isRunning) || (idx === 0 && isPending);
            const isDone = isComplete || (isRunning && idx < currentStageIdx);
            const hasFailed = isFailed && idx === currentStageIdx;
            const timing: StageTiming | undefined = progress.stageTimings?.[stage.name];

            let statusText = 'Pending';
            if (isDone) {
              statusText = 'Complete';
            } else if (isActive && isPending) {
              statusText = 'Starting...';
            } else if (isActive) {
              statusText = progress.stageDescription ?? 'Running...';
            } else if (hasFailed) {
              statusText = 'Failed';
            }

            return (
              <Stepper.Step
                key={stage.name}
                label={stage.name}
                loading={isActive}
                color={getStepColor(isDone, isActive, hasFailed)}
                completedIcon={<IconCheck size={14} />}
                icon={hasFailed ? <IconX size={14} /> : undefined}
                description={
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">{stage.agent} · {model}</Text>
                    <Text size="xs" c={getStatusColor(isDone, isActive, hasFailed)} fw={500} truncate>
                      {statusText}
                    </Text>
                    {isActive && timing?.startedAt && (
                      <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <ElapsedTimer since={timing.startedAt} />
                      </Text>
                    )}
                    {isDone && timing?.durationMs != null && (
                      <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatElapsed(timing.durationMs)}
                      </Text>
                    )}
                    {isDone && !timing?.durationMs && progress.cost && (
                      <Text size="xs" c="dimmed">
                        ~${(progress.cost.totalCostUsd / STAGES.length).toFixed(3)}
                      </Text>
                    )}
                  </Stack>
                }
              />
            );
          })}
        </Stepper>

        {isComplete && (
          <Stack align="center" gap={4} mt="lg">
            {progress.cost && (
              <Text size="xs" c="dimmed">
                Total: ${progress.cost.totalCostUsd.toFixed(4)} · {progress.cost.tokensUsed.toLocaleString()} tokens
              </Text>
            )}
            {progress.startedAt && (
              <Text size="xs" c="dimmed">
                Completed in {formatElapsed(
                  new Date(progress.stageTimings?.[STAGES[STAGES.length - 1].name]?.completedAt ?? progress.startedAt).getTime()
                  - new Date(progress.startedAt).getTime(),
                )}
              </Text>
            )}
          </Stack>
        )}

        {(isRunning || isPending) && progress.startedAt && (
          <Text size="xs" c="dimmed" mt="lg">
            Elapsed: <ElapsedTimer since={progress.startedAt} />
          </Text>
        )}

        {isFailed && progress.error && (
          <Alert color="red" variant="light" maw={400} mt="md">
            <Text size="xs">{progress.error}</Text>
          </Alert>
        )}

        {isFailed && (
          <Group gap="sm" mt="md">
            {onRetry && (
              <Button variant="primary" size="sm" onClick={onRetry}>
                Retry Pipeline
              </Button>
            )}
            {onDismiss && (
              <Button variant="secondary" size="sm" onClick={onDismiss}>
                Back to Canvas
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Center>
  );
}
