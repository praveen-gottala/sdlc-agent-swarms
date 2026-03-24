'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Single navigation entry in the sidebar. */
interface NavItem {
  icon: string;
  label: string;
  href: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { icon: '\u{1F504}', label: 'Pipeline', href: '/pipeline' },
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

export interface SidebarNavProps {
  /** Whether the sidebar is collapsed to icon-only mode. */
  collapsed: boolean;
  /** Callback to toggle collapsed state. */
  onToggle: () => void;
  /** Project name displayed in the bottom context section. */
  projectName?: string;
  /** Repository path shown in the bottom context section. */
  repoPath?: string;
  /** Technology stack tags rendered as pills. */
  stackTags?: string[];
}

/** Left sidebar navigation for the AgentForge dashboard. */
export function SidebarNav({
  collapsed,
  onToggle,
  projectName = 'my-saas-app',
  repoPath = 'github.com/acme/my-saas-app',
  stackTags = ['React', 'Node', 'Prisma'],
}: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col h-full bg-sidebar border-r border-border transition-all duration-200 ${
        collapsed ? 'w-[60px]' : 'w-[240px]'
      }`}
    >
      {/* Logo & version */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <span className="text-accent-blue font-bold text-lg leading-none select-none">
          AF
        </span>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-text-primary font-semibold text-sm leading-tight">
              AgentForge
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
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors relative ${
                    isActive
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
        className="flex items-center justify-center py-2 border-t border-b border-border text-text-muted hover:text-text-primary transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="text-xs">{collapsed ? '\u{25B6}' : '\u{25C0}'}</span>
      </button>

      {/* Project context */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-text-primary text-xs font-medium truncate">
            {projectName}
          </p>
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
        </div>
      )}
    </aside>
  );
}
