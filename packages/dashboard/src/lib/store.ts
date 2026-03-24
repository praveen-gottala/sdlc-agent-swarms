'use client';

import { create } from 'zustand';

/** UI state for the AgentForge dashboard */
export interface DashboardStore {
  // Sidebar
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // Task view mode
  taskViewMode: 'board' | 'list';
  setTaskViewMode: (mode: 'board' | 'list') => void;

  // Filters
  statusFilter: string[];
  agentFilter: string | null;
  phaseFilter: string | null;
  setStatusFilter: (statuses: string[]) => void;
  setAgentFilter: (agent: string | null) => void;
  setPhaseFilter: (phase: string | null) => void;

  // Active page
  pageTitle: string;
  setPageTitle: (title: string) => void;
}

/** Zustand store for dashboard UI state */
export const useDashboardStore = create<DashboardStore>((set) => ({
  // Sidebar defaults
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: true,
  toggleLeftSidebar: () =>
    set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () =>
    set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),

  // Task view defaults
  taskViewMode: 'board',
  setTaskViewMode: (mode) => set({ taskViewMode: mode }),

  // Filter defaults
  statusFilter: [],
  agentFilter: null,
  phaseFilter: null,
  setStatusFilter: (statuses) => set({ statusFilter: statuses }),
  setAgentFilter: (agent) => set({ agentFilter: agent }),
  setPhaseFilter: (phase) => set({ phaseFilter: phase }),

  // Page title
  pageTitle: 'Dashboard',
  setPageTitle: (title) => set({ pageTitle: title }),
}));
