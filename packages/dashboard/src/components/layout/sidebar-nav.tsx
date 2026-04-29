'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/** Single navigation entry in the sidebar. */
interface NavItem {
  icon: string;
  label: string;
  href: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { icon: '\u{1F504}', label: 'Pipeline', href: '/pipeline' },
  { icon: '\u{1F3A8}', label: 'Design Studio', href: '/design' },
  { icon: '\u{1F4CB}', label: 'Tasks', href: '/tasks' },
  { icon: '\u2705', label: 'Approvals', href: '/approvals', badge: 3 },
  { icon: '\u{1F4C4}', label: 'Spec', href: '/spec' },
  { icon: '\u{1F916}', label: 'Agents', href: '/agents' },
  { icon: '\u{1F50D}', label: 'Traces', href: '/traces' },
  { icon: '\u{1F4B0}', label: 'Costs', href: '/costs' },
  { icon: '\u{1F4CA}', label: 'Audit', href: '/audit' },
  { icon: '\u{1F6E1}\uFE0F', label: 'Trust', href: '/trust' },
  { icon: '\u{1F50C}', label: 'Integrations', href: '/integrations' },
];

export interface ProjectContext {
  name: string;
  path?: string;
  repo?: string;
  stack?: { frontend?: string; backend?: string };
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  description: string;
}

export interface SidebarNavProps {
  /** Whether the sidebar is collapsed to icon-only mode. */
  collapsed: boolean;
  /** Callback to toggle collapsed state. */
  onToggle: () => void;
  /** Project context from the active project API. */
  project?: ProjectContext;
  /** All discovered projects for the switcher dropdown. */
  allProjects?: ProjectInfo[];
  /** Callback when user switches to a different project. */
  onSwitchProject?: (path: string) => void;
  /** Project name displayed in the bottom context section. */
  projectName?: string;
  /** Repository path shown in the bottom context section. */
  repoPath?: string;
  /** Technology stack tags rendered as pills. */
  stackTags?: string[];
}

/** Get initials from a project name (up to 2 chars). */
function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Left sidebar navigation for the AgentForge dashboard. */
export function SidebarNav({
  collapsed,
  onToggle,
  project,
  allProjects,
  onSwitchProject,
  projectName: projectNameProp,
  repoPath: repoPathProp,
  stackTags: stackTagsProp,
}: SidebarNavProps) {
  const projectName = project?.name ?? projectNameProp ?? 'my-saas-app';
  const repoPath = project?.repo ?? repoPathProp ?? 'github.com/acme/my-saas-app';
  const stackTags = project?.stack
    ? [project.stack.frontend, project.stack.backend].filter(Boolean) as string[]
    : (stackTagsProp ?? ['React', 'Node', 'Prisma']);
  const pathname = usePathname();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    if (switcherOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [switcherOpen]);

  return (
    <aside
      className={`flex flex-col h-full bg-sidebar border-r border-border transition-all duration-200 ${collapsed ? 'w-[60px]' : 'w-[240px]'
        }`}
    >
      {/* Logo & version */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chip-logo.svg" alt="CHIP" className="w-7 h-7 shrink-0" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-text-primary font-semibold text-sm leading-tight">
              CHIP
            </span>
            <span className="text-text-muted text-[10px] leading-tight">
              v0.1.0
            </span>
          </div>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors relative ${isActive
                    ? 'bg-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated/50 border-l-2 border-transparent'
                    }`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="text-base flex-shrink-0 w-5 text-center">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto bg-accent-orange text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute top-1 right-1 bg-accent-orange w-2 h-2 rounded-full" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        data-testid="sidebar-toggle"
        className="flex justify-end pr-[10px] py-2 border-t border-b border-border text-text-muted hover:text-text-primary transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="text-xs">{collapsed ? '\u{25B6}' : '\u{25C0}'}</span>
      </button>

      {/* Project context with switcher */}
      <div className="relative" ref={switcherRef}>
        {collapsed ? (
          /* Collapsed: clickable initials circle */
          <button
            onClick={() => setSwitcherOpen((prev) => !prev)}
            data-testid="project-switcher"
            className="flex items-center justify-center w-full py-3 hover:bg-bg-elevated/50 transition-colors"
            title={projectName}
          >
            <span className="w-8 h-8 rounded-full bg-accent-blue/15 text-accent-blue text-xs font-bold flex items-center justify-center">
              {getInitials(projectName)}
            </span>
          </button>
        ) : (
          /* Expanded: clickable project section */
          <button
            onClick={() => setSwitcherOpen((prev) => !prev)}
            data-testid="project-switcher"
            className="w-full px-4 py-3 text-left hover:bg-bg-elevated/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <p data-testid="project-name" className="text-text-primary text-xs font-medium truncate">
                {projectName}
              </p>
              <span className={`text-text-muted text-[10px] transition-transform ${switcherOpen ? 'rotate-180' : ''}`}>
                &#9660;
              </span>
            </div>
            <p className="text-text-muted text-[10px] truncate mt-0.5">
              {repoPath}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {stackTags.map((tag) => (
                <span
                  key={tag}
                  className="bg-bg-elevated text-text-secondary text-[10px] px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </button>
        )}

        {/* Project switcher dropdown */}
        {switcherOpen && (
          <div
            className={`absolute z-50 bg-sidebar border border-border rounded-lg shadow-lg overflow-hidden ${collapsed ? 'left-[60px] bottom-0 w-56' : 'left-0 bottom-full w-full'
              }`}
          >
            <div className="px-3 py-2 border-b border-border">
              <p className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
                Switch project
              </p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {allProjects && allProjects.length > 0 ? (
                allProjects.map((proj) => {
                  const isActive = proj.path === project?.path;
                  return (
                    <button
                      key={proj.path}
                      data-testid={`project-option-${proj.id}`}
                      onClick={() => {
                        if (!isActive && onSwitchProject) {
                          onSwitchProject(proj.path);
                        }
                        setSwitcherOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${isActive
                        ? 'bg-accent-blue/10 text-accent-blue'
                        : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                        }`}
                    >
                      <p className="text-xs font-medium truncate">{proj.name}</p>
                      {proj.description && (
                        <p className="text-[10px] text-text-muted truncate mt-0.5">
                          {proj.description}
                        </p>
                      )}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-text-muted text-xs">No projects found</p>
              )}
            </div>
            <button
              onClick={() => {
                setSwitcherOpen(false);
                router.push('/onboarding');
              }}
              className="w-full px-3 py-2 text-left text-xs font-medium text-accent-blue hover:bg-accent-blue/5 transition-colors border-t border-border"
            >
              + New project
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
