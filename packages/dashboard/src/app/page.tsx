const modules = [
  { name: 'Pipeline View', path: '/pipeline', description: 'SDLC phase pipeline visualization' },
  { name: 'Kanban Board', path: '/kanban', description: 'Task tracking across agents' },
  { name: 'Approval Center', path: '/approvals', description: 'HITL approval queue' },
  { name: 'Trace Viewer', path: '/traces', description: 'Agent execution traces' },
  { name: 'Cost Dashboard', path: '/costs', description: 'Budget and cost tracking' },
  { name: 'Spec Viewer', path: '/specs', description: 'Specification browser' },
  { name: 'Agent Config', path: '/agents', description: 'Agent configuration management' },
  { name: 'Integrations', path: '/integrations', description: 'External service connections' },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-primary-900">AgentForge Dashboard</h1>
      <p className="mt-2 text-gray-600">V3 multi-agent orchestration dashboard</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <div
            key={m.path}
            className="rounded-lg border border-gray-200 p-4 hover:border-primary-500"
          >
            <h2 className="font-semibold text-primary-700">{m.name}</h2>
            <p className="mt-1 text-sm text-gray-500">{m.description}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
