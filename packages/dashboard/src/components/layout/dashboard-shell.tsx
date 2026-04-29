'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Notification } from '@mantine/core';
import { SidebarNav, type ProjectContext, type ProjectInfo } from './sidebar-nav';
import { HeaderBar } from './header-bar';
import { ActivitySidebar } from './activity-sidebar';

const DEFAULT_WIDTH = 220;
const COLLAPSED_WIDTH = 64;
const MIN_WIDTH = 140;
const MAX_WIDTH = 360;
const STORAGE_KEY = 'chip-sidebar-width';
const ACTIVITY_KEY = 'chip-activity-open';

export interface DashboardShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function DashboardShell({
  children,
  pageTitle = 'Dashboard',
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
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(ACTIVITY_KEY);
    return stored !== null ? stored === 'true' : true;
  });
  const [project, setProject] = useState<ProjectContext | undefined>();
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const switchErrorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedWidth = useRef(sidebarWidth === COLLAPSED_WIDTH ? DEFAULT_WIDTH : sidebarWidth);

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

  const navbarWidth = isCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: navbarWidth, breakpoint: 0 }}
      aside={{
        width: 280,
        breakpoint: 0,
        collapsed: { desktop: !activityOpen, mobile: true },
      }}
      padding="md"
      transitionDuration={isResizing ? 0 : 200}
      transitionTimingFunction="ease"
      styles={{
        main: {
          background: 'var(--color-bg-base)',
          minHeight: '100vh',
        },
        navbar: {
          background: 'var(--color-sidebar)',
          borderRight: 'none',
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
          title={pageTitle}
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
            right: -2,
            top: 0,
            bottom: 0,
            width: 5,
            cursor: 'col-resize',
            zIndex: 20,
          }}
          className={isResizing ? 'bg-accent-blue/40' : 'hover:bg-accent-blue/20'}
        />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Aside>
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
