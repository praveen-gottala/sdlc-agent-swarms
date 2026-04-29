'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  NavLink,
  Tooltip,
  Select,
  ActionIcon,
  Badge,
  ScrollArea,
  Box,
  Group,
  Text,
  Divider,
} from '@mantine/core';
import {
  IconPipeline,
  IconPalette,
  IconListCheck,
  IconCircleCheck,
  IconFileText,
  IconRobot,
  IconShieldCheck,
  IconCurrencyDollar,
  IconPlugConnected,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
} from '@tabler/icons-react';
import type { ComponentType, ReactNode } from 'react';

interface NavItem {
  icon: ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  href: string;
  badge?: number;
  external?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Build',
    items: [
      { icon: IconPipeline, label: 'Pipeline', href: '/pipeline' },
      { icon: IconPalette, label: 'Design Studio', href: '/design' },
      { icon: IconFileText, label: 'Spec', href: '/spec' },
    ],
  },
  {
    title: 'Execute',
    items: [
      { icon: IconListCheck, label: 'Tasks', href: '/tasks' },
      { icon: IconRobot, label: 'Agents', href: '/agents' },
      { icon: IconCircleCheck, label: 'Approvals', href: '/approvals', badge: 3 },
    ],
  },
  {
    title: 'Govern',
    items: [
      { icon: IconShieldCheck, label: 'Trust', href: '/trust' },
      { icon: IconCurrencyDollar, label: 'Budget', href: '/costs' },
    ],
  },
  {
    title: 'Configure',
    items: [
      { icon: IconPlugConnected, label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    title: 'External',
    items: [
      {
        icon: IconExternalLink,
        label: 'Observability',
        href: 'http://localhost:3001',
        external: true,
      },
    ],
  },
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
  collapsed: boolean;
  onToggle: () => void;
  project?: ProjectContext;
  allProjects?: ProjectInfo[];
  onSwitchProject?: (path: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }): React.JSX.Element {
  if (collapsed) {
    return <Divider my={4} color="var(--color-border)" />;
  }
  return (
    <Text
      size="xs"
      fw={600}
      c="var(--color-text-dim)"
      tt="uppercase"
      lts={0.5}
      px="sm"
      pt="sm"
      pb={4}
      style={{ fontSize: 10 }}
    >
      {children}
    </Text>
  );
}

export function SidebarNav({
  collapsed,
  onToggle,
  project,
  allProjects,
  onSwitchProject,
}: SidebarNavProps): React.JSX.Element {
  const pathname = usePathname();
  const projectName = project?.name ?? 'my-saas-app';

  return (
    <>
      {/* Logo + collapse toggle */}
      <Box px={collapsed ? 6 : 'sm'} py="sm" className="border-b border-border">
        {collapsed ? (
          <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chip-symbol.png"
              alt="CHIP"
              width={28}
              height={28}
              style={{ borderRadius: 4 }}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={onToggle}
              data-testid="sidebar-toggle"
              aria-label="Expand sidebar"
            >
              <IconChevronRight size={14} stroke={1.5} />
            </ActionIcon>
          </Box>
        ) : (
          <Group justify="space-between" align="center" wrap="nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/chip-full-logo-dark.png"
              alt="CHIP — Crafted Human Intelligence Platform"
              style={{ height: 36, width: 'auto', objectFit: 'contain' }}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={onToggle}
              data-testid="sidebar-toggle"
              aria-label="Collapse sidebar"
              style={{ flexShrink: 0 }}
            >
              <IconChevronLeft size={14} stroke={1.5} />
            </ActionIcon>
          </Group>
        )}
      </Box>

      {/* New Project link */}
      <Box px={collapsed ? 6 : 'xs'} pt="xs">
        <Tooltip label="New Project" position="right" withArrow disabled={!collapsed}>
          <NavLink
            component={Link}
            href="/new"
            label={collapsed ? undefined : 'New Project'}
            leftSection={<IconPlus size={18} stroke={1.5} />}
            active={pathname === '/new'}
            color="blue"
            variant="light"
            className="gradient-btn"
            styles={{
              root: {
                borderRadius: 'var(--mantine-radius-md)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
              },
            }}
            data-testid="nav-new-project"
          />
        </Tooltip>
      </Box>

      {/* Grouped navigation */}
      <ScrollArea flex={1} py={4} px={collapsed ? 6 : 'xs'}>
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <Box key={section.title}>
            {sectionIdx > 0 && (
              <SectionLabel collapsed={collapsed}>{section.title}</SectionLabel>
            )}
            {sectionIdx === 0 && !collapsed && (
              <SectionLabel collapsed={false}>{section.title}</SectionLabel>
            )}
            {sectionIdx === 0 && collapsed && <Box pt={4} />}

            {section.items.map((item) => {
              const isActive =
                !item.external &&
                (pathname === item.href || pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;

              if (item.external) {
                return (
                  <Tooltip
                    key={item.href}
                    label={item.label}
                    position="right"
                    withArrow
                    disabled={!collapsed}
                  >
                    <NavLink
                      component="a"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      label={
                        collapsed ? undefined : (
                          <Group gap={4} wrap="nowrap">
                            <span>{item.label}</span>
                            <IconExternalLink size={12} stroke={1.5} style={{ opacity: 0.5 }} />
                          </Group>
                        )
                      }
                      leftSection={<Icon size={18} stroke={1.5} />}
                      color="gray"
                      variant="subtle"
                      styles={{
                        root: {
                          borderRadius: 'var(--mantine-radius-sm)',
                          fontSize: 13,
                          padding: '6px 10px',
                          opacity: 0.7,
                        },
                      }}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  </Tooltip>
                );
              }

              return (
                <Tooltip
                  key={item.href}
                  label={item.label}
                  position="right"
                  withArrow
                  disabled={!collapsed}
                >
                  <NavLink
                    component={Link}
                    href={item.href}
                    label={collapsed ? undefined : item.label}
                    leftSection={<Icon size={18} stroke={1.5} />}
                    active={isActive}
                    color="blue"
                    variant="light"
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    rightSection={
                      !collapsed && item.badge ? (
                        <Badge size="xs" variant="filled" color="orange" circle>
                          {item.badge}
                        </Badge>
                      ) : undefined
                    }
                    styles={{
                      root: {
                        borderRadius: 'var(--mantine-radius-sm)',
                        fontSize: 13,
                        padding: '6px 10px',
                        ...(isActive && {
                          borderLeft: '2px solid var(--color-accent-blue)',
                        }),
                      },
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </ScrollArea>

      {/* Project switcher */}
      <Box className="border-t border-border" px={collapsed ? 6 : 'sm'} py="xs">
        {!collapsed ? (
          <Select
            data={
              allProjects?.map((p) => ({ value: p.path, label: p.name })) ?? []
            }
            value={project?.path ?? null}
            onChange={(value) => value && onSwitchProject?.(value)}
            placeholder={projectName}
            size="xs"
            data-testid="project-switcher"
            comboboxProps={{ withinPortal: true }}
            styles={{
              input: {
                background: 'var(--color-bg-elevated)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 12,
              },
            }}
          />
        ) : (
          <Tooltip label={projectName} position="right" withArrow>
            <Box
              data-testid="project-switcher"
              style={{
                display: 'flex',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(59,130,246,0.15)',
                  color: 'var(--color-accent-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {getInitials(projectName)}
              </div>
            </Box>
          </Tooltip>
        )}
      </Box>
    </>
  );
}
