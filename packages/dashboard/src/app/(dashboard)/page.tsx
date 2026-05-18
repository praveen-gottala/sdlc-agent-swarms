'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Group,
  Text,
  Badge,
  Stack,
  Button,
  Skeleton,
  Box,
  Transition,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconPlus,
  IconPalette,
  IconCircleX,
  IconArrowRight,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { SpineRail } from '@/components/spine/spine-rail';
import { SPINE_STAGES } from '@/components/spine/spine-constants';

/* ── Types ── */

interface ProjectInfo {
  name: string;
  path: string;
  description: string;
  stack?: Record<string, string>;
}

interface RunInfo {
  runId: string;
  type: string;
  status: string;
  stage: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface DashboardData {
  project: ProjectInfo | null;
  runs: RunInfo[];
  approvalCount: number;
  tasksDone: number;
  tasksTotal: number;
}

/* ── Helpers ── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Attention item ── */

function AttentionRow({
  icon, label, detail, href, color,
}: {
  icon: React.ReactNode; label: string; detail: string; href: string; color: string;
}): React.JSX.Element {
  return (
    <UnstyledButton
      component={Link}
      href={href}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderRadius: 10,
        border: '1px solid var(--color-border)',
        transition: 'border-color 0.15s ease',
      }}
      styles={{ root: { '&:hover': { borderColor: color } } }}
    >
      <Group gap="sm" wrap="nowrap">
        <Box style={{ color, display: 'flex' }}>{icon}</Box>
        <Box>
          <Text size="sm" fw={500} c="var(--color-text-primary)">{label}</Text>
          <Text size="xs" c="var(--color-text-muted)">{detail}</Text>
        </Box>
      </Group>
      <IconArrowRight size={16} style={{ color: 'var(--color-text-muted)' }} />
    </UnstyledButton>
  );
}

/* ── Loading ── */

function LoadingSkeleton(): React.JSX.Element {
  return (
    <Stack gap="xl" p="xl" maw={720} mx="auto" mt={40}>
      <Skeleton height={32} width={200} />
      <Skeleton height={16} width={300} />
      <Skeleton height={60} radius="md" mt="xl" />
      <Skeleton height={52} radius="md" />
    </Stack>
  );
}

/* ── Main ── */

export default function HomePage(): React.JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);
  const [mounted] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((projects: unknown[]) => {
        if (!projects || !Array.isArray(projects) || projects.length === 0) {
          setHasProjects(false); setLoading(false); return;
        }
        setHasProjects(true);
        Promise.all([
          fetch('/api/projects/active').then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/runs').then((r) => r.json()).catch(() => ({ runs: [] })),
          fetch('/api/approvals').then((r) => r.json()).catch(() => ({ total: 0 })),
          fetch('/api/tasks').then((r) => r.json()).catch(() => ({ tasks: [] })),
        ]).then(([project, runsData, approvalsData, tasksData]) => {
          const allTasks = (tasksData as { tasks?: { status: string }[] }).tasks ?? [];
          setData({
            project: project as ProjectInfo | null,
            runs: ((runsData as { runs?: RunInfo[] }).runs ?? []).slice(0, 5),
            approvalCount: (approvalsData as { total?: number }).total ?? 0,
            tasksDone: allTasks.filter((t) => t.status === 'completed').length,
            tasksTotal: allTasks.length,
          });
          setLoading(false);
        });
      })
      .catch(() => { setHasProjects(false); setLoading(false); });
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (hasProjects === false) return <OnboardingWizard />;
  if (!data) return <LoadingSkeleton />;

  const { project, runs, approvalCount, tasksDone, tasksTotal } = data;
  const activeRun = runs.find((r) => r.status === 'running') ?? null;
  const lastRun = runs[0] ?? null;
  const failedRun = runs.find((r) => r.status === 'failed');
  const activeStageIdx = activeRun
    ? SPINE_STAGES.findIndex((s) => activeRun.stage?.toLowerCase().includes(s.key))
    : -1;

  return (
    <Transition mounted={mounted} transition="fade" duration={200}>
      {(styles) => (
        <Stack gap={32} p="xl" maw={720} mx="auto" mt={24} style={styles}>

          {/* ── Project identity ── */}
          <Group gap="lg" align="flex-start" wrap="nowrap">
            <Box style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700,
              color: 'var(--color-text-secondary)',
            }}>
              {(project?.name ?? 'D').substring(0, 2).toUpperCase()}
            </Box>
            <Box style={{ minWidth: 0 }}>
              <Text
                fw={700}
                c="var(--color-text-primary)"
                style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: -0.5 }}
              >
                {project?.name ?? 'Dashboard'}
              </Text>
              {project?.description && (
                <Text size="sm" c="var(--color-text-secondary)" mt={4}>
                  {project.description}
                </Text>
              )}
              {project?.stack && (
                <Text size="xs" c="var(--color-text-muted)" mt={6}>
                  {Object.values(project.stack).filter(Boolean).join(' / ')}
                </Text>
              )}
            </Box>
          </Group>

          {/* ── Pipeline spine ── */}
          <Box py="md">
            <SpineRail activeStage={activeStageIdx} />
            {activeRun && (
              <Text size="xs" c="var(--color-accent-blue)" ta="center" mt="md" fw={500}>
                Running: {activeRun.stage} ({timeAgo(activeRun.startedAt)})
              </Text>
            )}
          </Box>

          {/* ── Attention items ── */}
          <Stack gap="sm">
            {approvalCount > 0 && (
              <AttentionRow
                icon={<IconAlertTriangle size={20} />}
                color="var(--color-accent-orange)"
                label={`${approvalCount} pending approval${approvalCount > 1 ? 's' : ''}`}
                detail="Review required before pipeline continues"
                href="/approvals"
              />
            )}

            {failedRun && failedRun === lastRun && (
              <AttentionRow
                icon={<IconCircleX size={20} />}
                color="var(--color-accent-red)"
                label={`Last run failed: ${failedRun.type.replace(/-/g, ' ')}`}
                detail={failedRun.error
                  ? (failedRun.error.length > 80 ? failedRun.error.substring(0, 80) + '…' : failedRun.error)
                  : failedRun.stage}
                href="/pipeline"
              />
            )}

            {activeRun && (
              <AttentionRow
                icon={<IconPlayerPlay size={20} />}
                color="var(--color-accent-blue)"
                label="Run in progress"
                detail={`${activeRun.type.replace(/-/g, ' ')} — ${activeRun.stage}`}
                href="/pipeline"
              />
            )}

            {/* Calm state */}
            {!activeRun && approvalCount === 0 && (!failedRun || failedRun !== lastRun) && (
              <Box py="sm">
                <Text size="sm" c="var(--color-text-muted)">
                  {tasksDone > 0
                    ? `${tasksDone} of ${tasksTotal} tasks complete. `
                    : ''}
                  {lastRun
                    ? `Last run ${lastRun.status} ${timeAgo(lastRun.startedAt)}.`
                    : 'No pipeline runs yet.'}
                </Text>
              </Box>
            )}
          </Stack>

          {/* ── Actions ── */}
          <Group gap="sm">
            <Button
              component={Link}
              href="/pipeline"
              variant="filled"
              color="dark"
              radius="md"
              leftSection={<IconArrowRight size={16} />}
              styles={{
                root: {
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-bg-base)',
                  fontWeight: 600,
                },
              }}
            >
              Runs
            </Button>
            <Button
              component={Link}
              href="/design"
              variant="default"
              radius="md"
              leftSection={<IconPalette size={16} />}
              styles={{
                root: {
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 500,
                },
              }}
            >
              Design Studio
            </Button>
            {tasksTotal > 0 && (
              <Badge
                component={Link}
                href="/tasks"
                size="lg"
                variant="light"
                color="gray"
                radius="md"
                style={{ cursor: 'pointer', fontWeight: 500, textDecoration: 'none' }}
              >
                {tasksDone}/{tasksTotal} tasks
              </Badge>
            )}
            <Button
              component={Link}
              href="/new"
              variant="subtle"
              color="gray"
              radius="md"
              size="sm"
              leftSection={<IconPlus size={14} />}
            >
              New
            </Button>
          </Group>

        </Stack>
      )}
    </Transition>
  );
}
