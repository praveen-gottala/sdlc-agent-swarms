'use client';

import { useState } from 'react';
import { SidebarNav } from './sidebar-nav';
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base">
      {/* Left navigation sidebar */}
      <SidebarNav
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* Center: header + scrollable content */}
      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar title={pageTitle} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {/* Right activity sidebar */}
      <ActivitySidebar
        open={activityOpen}
        onToggle={() => setActivityOpen((prev) => !prev)}
      />
    </div>
  );
}
