'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { CreatePageModal } from '@/components/pages/create-page-modal';

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  description: string;
}

const modules = [
  { name: 'Pipeline View', path: '/pipeline', description: 'SDLC phase pipeline visualization', icon: '\uD83D\uDD04' },
  { name: 'Design Studio', path: '/design', description: 'Visual design generation & editing', icon: '\uD83C\uDFA8' },
  { name: 'Tasks', path: '/tasks', description: 'Task tracking across agents', icon: '\uD83D\uDCCB' },
  { name: 'Approval Center', path: '/approvals', description: 'HITL approval queue', icon: '\u2705' },
  { name: 'Spec Viewer', path: '/spec', description: 'Specification browser', icon: '\uD83D\uDCC4' },
  { name: 'Agent Config', path: '/agents', description: 'Agent configuration management', icon: '\uD83E\uDD16' },
  { name: 'Trace Viewer', path: '/traces', description: 'Agent execution traces', icon: '\uD83D\uDD0D' },
  { name: 'Cost Dashboard', path: '/costs', description: 'Budget and cost tracking', icon: '\uD83D\uDCB0' },
  { name: 'Integrations', path: '/integrations', description: 'External service connections', icon: '\uD83D\uDD0C' },
] as const;

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => setProjects(data as ProjectInfo[]))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-bg-elevated rounded" />
          <div className="h-4 w-64 bg-bg-elevated rounded" />
        </div>
      </main>
    );
  }

  if (!projects || projects.length === 0) {
    return <OnboardingWizard />;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-text-primary">AgentForge Dashboard</h1>
      <p className="mt-2 text-text-muted">V3 multi-agent orchestration dashboard</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.path}
            href={m.path}
            className="group rounded-lg border border-border bg-sidebar p-4 hover:border-accent-blue transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{m.icon}</span>
              <h2 className="font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
                {m.name}
              </h2>
            </div>
            <p className="text-sm text-text-muted">{m.description}</p>
          </Link>
        ))}

        {/* New Page CTA card */}
        <button
          type="button"
          onClick={() => setShowCreatePage(true)}
          className="group rounded-lg border border-dashed border-border bg-sidebar p-4 hover:border-accent-blue transition-colors text-left"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">+</span>
            <h2 className="font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
              New Page
            </h2>
          </div>
          <p className="text-sm text-text-muted">Design a new page with AI</p>
        </button>

        {/* New Project CTA card */}
        <Link
          href="/onboarding"
          className="group rounded-lg border border-dashed border-border bg-sidebar p-4 hover:border-accent-blue transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">+</span>
            <h2 className="font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
              New Project
            </h2>
          </div>
          <p className="text-sm text-text-muted">Create a new AgentForge project</p>
        </Link>
      </div>

      <CreatePageModal open={showCreatePage} onClose={() => setShowCreatePage(false)} />
    </main>
  );
}
