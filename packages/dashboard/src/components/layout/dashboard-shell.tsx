'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Notification } from '@mantine/core';
import { SidebarNav, type ProjectContext, type ProjectInfo } from './sidebar-nav';
import { HeaderBar } from './header-bar';
import { ActivitySidebar } from './activity-sidebar';
import { useRunProgress } from '@/lib/hooks/use-run-progress';
import { usePipelineNotifications } from '@/lib/hooks/use-pipeline-notifications';

const DEFAULT_WIDTH = 220;
const COLLAPSED_WIDTH = 64;
const MIN_WIDTH = 140;
const MAX_WIDTH = 360;
const STORAGE_KEY = 'chip-sidebar-width';
const ACTIVITY_KEY = 'chip-activity-open';
const ASIDE_WIDTH_KEY = 'chip-aside-width';
const ASIDE_DEFAULT = 280;
const ASIDE_MIN = 200;
const ASIDE_MAX = 480;

export interface DashboardShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function DashboardShell({
  children,
  pageTitle: _pageTitle = 'Dashboard',
}: DashboardShellProps): React.JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (w < MIN_WIDTH) return COLLAPSED_WIDTH;
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) return w;
    }
    return DEFAULT_WIDTH;
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return parseInt(stored, 10) < MIN_WIDTH;
    return false;
  });
  const [activityOpen, setActivityOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(ACTIVITY_KEY);
    return stored !== null ? stored === 'true' : false;
  });
  const [project, setProject] = useState<ProjectContext | undefined>();
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [asideWidth, setAsideWidth] = useState(() => {
    if (typeof window === 'undefined') return ASIDE_DEFAULT;
    const stored = localStorage.getItem(ASIDE_WIDTH_KEY);
    return stored ? Math.max(ASIDE_MIN, Math.min(ASIDE_MAX, parseInt(stored, 10))) : ASIDE_DEFAULT;
  });
  const [isAsideResizing, setIsAsideResizing] = useState(false);
  const switchErrorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedWidth = useRef(sidebarWidth === COLLAPSED_WIDTH ? DEFAULT_WIDTH : sidebarWidth);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [headerPhase, setHeaderPhase] = useState<string | undefined>(undefined);
  const [headerAgents, setHeaderAgents] = useState(0);
  const [budgetUsed, setBudgetUsed] = useState(0);
  const [budgetTotal, setBudgetTotal] = useState(0);

  const runProgress = useRunProgress(activeRunId);
  const { unreadCount } = usePipelineNotifications(activeRunId, runProgress);

  useEffect(() => {
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

  useEffect(() => {
    function checkActiveRuns(): void {
      fetch('/api/runs?limit=5')
        .then((r) => (r.ok ? r.json() : { runs: [] }))
        .then((data: { runs?: Array<{ id: string; status: string; stage?: string }> }) => {
          const runs = data.runs ?? [];
          const active = runs.find((r) => r.status === 'running' || r.status === 'pending');
          setActiveRunId(active?.id ?? null);
          setHeaderPhase(active?.stage ?? undefined);
          setHeaderAgents(runs.filter((r) => r.status === 'running').length);
        })
        .catch(() => { /* ignore */ });
    }
    checkActiveRuns();
    const id = setInterval(checkActiveRuns, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function fetchBudget(): void {
      fetch('/api/costs')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { costs?: { monthly?: { totalCost?: number; budget?: number } } } | null) => {
          if (data?.costs?.monthly) {
            setBudgetUsed(data.costs.monthly.totalCost ?? 0);
            setBudgetTotal(data.costs.monthly.budget ?? 0);
          }
        })
        .catch(() => { /* ignore */ });
    }
    fetchBudget();
    const id = setInterval(fetchBudget, 30_000);
    return () => clearInterval(id);
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
        window.location.href = '/';
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

  const handleToggleCollapse = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setSidebarWidth(savedWidth.current);
      localStorage.setItem(STORAGE_KEY, String(savedWidth.current));
    } else {
      setIsCollapsed(true);
      setSidebarWidth(COLLAPSED_WIDTH);
      localStorage.setItem(STORAGE_KEY, String(COLLAPSED_WIDTH));
    }
  }, [isCollapsed]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = ev.clientX;
        if (newWidth < MIN_WIDTH) {
          setIsCollapsed(true);
          setSidebarWidth(COLLAPSED_WIDTH);
        } else {
          setIsCollapsed(false);
          const clamped = Math.min(newWidth, MAX_WIDTH);
          setSidebarWidth(clamped);
          savedWidth.current = clamped;
        }
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        localStorage.setItem(
          STORAGE_KEY,
          String(isCollapsed ? COLLAPSED_WIDTH : savedWidth.current),
        );
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [isCollapsed],
  );

  const handleResizeDoubleClick = useCallback(() => {
    handleToggleCollapse();
  }, [handleToggleCollapse]);

  const handleAsideResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = asideWidth;
    setIsAsideResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setAsideWidth(Math.max(ASIDE_MIN, Math.min(ASIDE_MAX, startW + delta)));
    };

    const onMouseUp = () => {
      setIsAsideResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setAsideWidth(w => { localStorage.setItem(ASIDE_WIDTH_KEY, String(w)); return w; });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [asideWidth]);

  const navbarWidth = isCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: navbarWidth, breakpoint: 0 }}
      aside={{
        width: asideWidth,
        breakpoint: 0,
        collapsed: { desktop: !activityOpen, mobile: true },
      }}
      padding="md"
      transitionDuration={(isResizing || isAsideResizing) ? 0 : 200}
      transitionTimingFunction="ease"
      styles={{
        root: {
          background: 'var(--color-sidebar)',
        },
        main: {
          background: 'var(--color-bg-base)',
          minHeight: '100vh',
          borderRadius: '16px 0 0 0',
          borderLeft: '1px solid var(--color-border-bright)',
          borderTop: '1px solid var(--color-border-bright)',
          boxShadow: '-8px -4px 24px rgba(0,0,0,0.12), -2px -1px 8px rgba(0,0,0,0.06)',
        },
        navbar: {
          background: 'var(--color-sidebar)',
          borderRight: '1px solid var(--color-border)',
          overflow: 'visible',
        },
        header: {
          background: 'var(--color-sidebar)',
          borderBottom: '1px solid var(--color-border)',
        },
        aside: {
          background: 'var(--color-sidebar)',
          borderLeft: '1px solid var(--color-border)',
        },
      }}
    >
      <AppShell.Header>
        <HeaderBar
          phase={headerPhase}
          budgetUsed={budgetUsed}
          budgetTotal={budgetTotal}
          activeAgents={headerAgents}
          unreadCount={unreadCount}
          activityOpen={activityOpen}
          onToggleActivity={() => {
            setActivityOpen((prev) => {
              const next = !prev;
              localStorage.setItem(ACTIVITY_KEY, String(next));
              return next;
            });
          }}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <SidebarNav
          collapsed={isCollapsed}
          onToggle={handleToggleCollapse}
          project={project}
          allProjects={allProjects}
          onSwitchProject={handleSwitchProject}
        />
        {/* Draggable resize handle */}
        <div
          onMouseDown={handleResizeStart}
          onDoubleClick={handleResizeDoubleClick}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          style={{
            position: 'absolute',
            right: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className={`group ${isResizing ? 'bg-accent-blue/20' : ''}`}
        >
          <div className={`h-8 w-1 rounded-full transition-opacity ${
            isResizing ? 'opacity-100 bg-accent-blue/60' : 'opacity-0 group-hover:opacity-100 bg-text-muted/40'
          }`} />
        </div>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Aside data-shell-aside>
        {/* Aside resize handle */}
        <div
          onMouseDown={handleAsideResizeStart}
          style={{
            position: 'absolute',
            left: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className={`group ${isAsideResizing ? 'bg-accent-blue/20' : ''}`}
        >
          <div className={`h-8 w-1 rounded-full transition-opacity ${
            isAsideResizing ? 'opacity-100 bg-accent-blue/60' : 'opacity-0 group-hover:opacity-100 bg-text-muted/40'
          }`} />
        </div>
        <ActivitySidebar />
      </AppShell.Aside>

      {switchError && (
        <Notification
          color="red"
          title="Error"
          onClose={() => setSwitchError(null)}
          data-testid="switch-error-toast"
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          {switchError}
        </Notification>
      )}
    </AppShell>
  );
}
