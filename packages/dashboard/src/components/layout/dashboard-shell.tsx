'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SidebarNav, type ProjectContext, type ProjectInfo } from './sidebar-nav';
import { HeaderBar } from './header-bar';
import { ActivitySidebar } from './activity-sidebar';

export interface DashboardShellProps {
  children: React.ReactNode;
  /** Page title passed through to the header bar. */
  pageTitle?: string;
}

/**
 * Root layout shell composing left nav, header, content area, and right activity sidebar.
 * Provides collapse controls for both sidebars.
 */
export function DashboardShell({
  children,
  pageTitle = 'Dashboard',
}: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [project, setProject] = useState<ProjectContext | undefined>();
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchErrorTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Fetch active project and all projects in parallel
    Promise.all([
      fetch('/api/projects/active')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/projects')
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([activeData, projectsList]) => {
      if (activeData && !activeData.error) {
        setProject(activeData as ProjectContext);
      }
      setAllProjects(projectsList as ProjectInfo[]);
    });
  }, []);

  const handleSwitchProject = useCallback(async (path: string) => {
    setSwitchError(null);
    clearTimeout(switchErrorTimer.current);
    try {
      const res = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const msg = `Failed to switch project (${res.status})`;
        setSwitchError(msg);
        switchErrorTimer.current = setTimeout(() => setSwitchError(null), 3000);
      }
    } catch {
      setSwitchError('Network error — could not switch project');
      switchErrorTimer.current = setTimeout(() => setSwitchError(null), 3000);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base">
      {/* Left navigation sidebar */}
      <SidebarNav
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        project={project}
        allProjects={allProjects}
        onSwitchProject={handleSwitchProject}
      />

      {/* Center: header + scrollable content */}
      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar title={pageTitle} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Switch-project error toast */}
      {switchError && (
        <div
          data-testid="switch-error-toast"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
        >
          {switchError}
        </div>
      )}

      {/* Right activity sidebar */}
      <ActivitySidebar
        open={activityOpen}
        onToggle={() => setActivityOpen((prev) => !prev)}
      />
    </div>
  );
}
