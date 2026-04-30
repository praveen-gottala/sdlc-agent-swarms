'use client';

import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Group, Stack, Text, Badge as MantineBadge, Loader, Paper, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type ScreenType = 'page' | 'modal' | 'drawer' | 'sheet';
type NavigationMode = 'navigate' | 'overlay';

interface NavigationTarget {
  target: string;
  trigger: string;
  source_node?: string;
  mode?: NavigationMode;
}

interface PageInfo {
  id: string;
  name: string;
  screenType?: ScreenType;
}

export interface NavigationEditorProps {
  readonly pages: readonly PageInfo[];
  readonly activePageId: string | null;
  readonly onStartPicking?: () => void;
  readonly onStopPicking?: () => void;
  readonly pickedNode?: { nodeId: string; catalogType: string | null } | null;
  readonly onSaved?: () => void;
}

function deriveMode(targetScreenType: ScreenType | undefined): NavigationMode {
  return targetScreenType && targetScreenType !== 'page' ? 'overlay' : 'navigate';
}

const SCREEN_TYPE_COLOR: Record<ScreenType, string> = {
  modal: 'violet',
  drawer: 'blue',
  sheet: 'yellow',
  page: 'gray',
};

export function NavigationEditor({ pages, activePageId, onStartPicking, onStopPicking, pickedNode, onSaved }: NavigationEditorProps) {
  const [navTargets, setNavTargets] = useState<NavigationTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickedNodeId, setPickedNodeId] = useState<string | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [newTarget, setNewTarget] = useState('');
  const [screenTypeMap, setScreenTypeMap] = useState<Map<string, ScreenType>>(new Map());

  const getScreenType = useCallback((pageId: string): ScreenType => {
    return screenTypeMap.get(pageId) ?? pages.find(p => p.id === pageId)?.screenType ?? 'page';
  }, [screenTypeMap, pages]);

  useEffect(() => {
    if (!activePageId) return;
    setLoading(true);
    setPicking(false);
    setPickedNodeId(null);
    fetch('/api/navigation')
      .then(r => r.ok ? r.json() : { navigation: [] })
      .then(data => {
        const navData = data.navigation as Array<{ pageId: string; screen_type: ScreenType; navigates_to: NavigationTarget[] }>;
        const stMap = new Map<string, ScreenType>();
        for (const entry of navData) {
          stMap.set(entry.pageId, entry.screen_type ?? 'page');
        }
        setScreenTypeMap(stMap);
        const pageNav = navData.find(n => n.pageId === activePageId);
        setNavTargets(pageNav?.navigates_to ?? []);
        setDirty(false);
      })
      .catch(() => setNavTargets([]))
      .finally(() => setLoading(false));
  }, [activePageId]);

  useEffect(() => {
    if (!picking || !pickedNode) return;
    setPickedNodeId(pickedNode.nodeId);
    setPickedLabel(pickedNode.catalogType ?? pickedNode.nodeId);
  }, [picking, pickedNode]);

  const handleSave = useCallback(async () => {
    if (!activePageId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/navigation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: activePageId, navigates_to: navTargets }),
      });
      if (res.ok) {
        setDirty(false);
        onSaved?.();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [activePageId, navTargets]);

  const handleStartPicking = useCallback(() => {
    setPicking(true);
    setPickedNodeId(null);
    setPickedLabel(null);
    setNewTarget('');
    onStartPicking?.();
  }, [onStartPicking]);

  const handleCancelPicking = useCallback(() => {
    setPicking(false);
    setPickedNodeId(null);
    setPickedLabel(null);
    onStopPicking?.();
  }, [onStopPicking]);

  const handleConfirmBinding = useCallback(() => {
    if (!pickedNodeId || !newTarget) return;
    const targetType = getScreenType(newTarget);
    setNavTargets(prev => [...prev, {
      target: newTarget,
      trigger: pickedLabel ?? pickedNodeId,
      source_node: pickedNodeId,
      mode: deriveMode(targetType),
    }]);
    setPicking(false);
    setPickedNodeId(null);
    setPickedLabel(null);
    setNewTarget('');
    setDirty(true);
    onStopPicking?.();
  }, [pickedNodeId, pickedLabel, newTarget, getScreenType, onStopPicking]);

  const handleToggleMode = useCallback((index: number) => {
    setNavTargets(prev => prev.map((nav, i) => {
      if (i !== index) return nav;
      const currentMode = nav.mode ?? deriveMode(getScreenType(nav.target));
      return { ...nav, mode: currentMode === 'overlay' ? 'navigate' : 'overlay' };
    }));
    setDirty(true);
  }, [getScreenType]);

  const handleRemove = useCallback((index: number) => {
    setNavTargets(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  if (!activePageId) return null;

  const activePage = pages.find(p => p.id === activePageId);
  const availableTargets = pages.filter(p => p.id !== activePageId);

  return (
    <Stack gap="xs" p="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
      <Group justify="space-between">
        <Text size="xs" fw={500} c="dimmed">
          Navigation from {activePage?.name ?? activePageId}
        </Text>
        {dirty && (
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </Group>

      {loading ? (
        <Text size="xs" c="dimmed">Loading...</Text>
      ) : navTargets.length === 0 && !picking ? (
        <Text size="xs" c="dimmed">No navigation targets defined</Text>
      ) : (
        <Stack gap={6}>
          {navTargets.map((nav, i) => {
            const targetPage = pages.find(p => p.id === nav.target);
            const targetType = getScreenType(nav.target);
            const effectiveMode = nav.mode ?? deriveMode(targetType);
            return (
              <Group key={i} gap={6} wrap="nowrap" style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 6, padding: '6px 8px' }}>
                <Text size="xs" truncate style={{ flex: 1 }} title={`${nav.trigger}${nav.source_node ? ` (${nav.source_node})` : ''}`}>
                  {nav.trigger}
                </Text>
                <Text size="xs" c="dimmed">→</Text>
                <Text size="xs" c="blue" fw={500} truncate maw={120}>{targetPage?.name ?? nav.target}</Text>
                {targetType !== 'page' && (
                  <MantineBadge variant="light" color={SCREEN_TYPE_COLOR[targetType]} size="xs">
                    {targetType}
                  </MantineBadge>
                )}
                <UnstyledButton
                  onClick={() => handleToggleMode(i)}
                  title={`Mode: ${effectiveMode}. Click to toggle.`}
                  style={{ lineHeight: 1 }}
                >
                  <MantineBadge
                    variant="light"
                    color={effectiveMode === 'overlay' ? 'violet' : 'green'}
                    size="xs"
                    style={{ cursor: 'pointer' }}
                  >
                    {effectiveMode}
                  </MantineBadge>
                </UnstyledButton>
                <ActionIcon variant="subtle" size="xs" onClick={() => handleRemove(i)} aria-label="Remove">
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            );
          })}
        </Stack>
      )}

      {picking ? (
        <Paper withBorder radius="sm" p="xs" style={{ borderColor: 'var(--mantine-color-blue-5)', background: 'var(--mantine-color-blue-light)' }}>
          <Stack gap={6}>
            {!pickedNodeId ? (
              <Group gap="xs">
                <Loader size="xs" color="blue" type="dots" />
                <Text size="xs" c="blue" fw={500}>Click an element in the prototype...</Text>
              </Group>
            ) : (
              <>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Element:</Text>
                  <Text size="xs" fw={500}>{pickedLabel}</Text>
                  <Text size="xs" c="dimmed">({pickedNodeId})</Text>
                </Group>
                <Select
                  options={availableTargets.map(p => {
                    const st = getScreenType(p.id);
                    const suffix = st !== 'page' ? ` [${st}]` : '';
                    return { label: `${p.name}${suffix}`, value: p.id };
                  })}
                  value={newTarget}
                  placeholder="Navigate to..."
                  onChange={e => setNewTarget(e.target.value)}
                />
              </>
            )}
            <Group gap={6}>
              {pickedNodeId && (
                <Button variant="primary" size="sm" onClick={handleConfirmBinding} disabled={!newTarget}>
                  Add
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleCancelPicking}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <Button variant="ghost" size="sm" onClick={handleStartPicking}>
          + Add navigation
        </Button>
      )}
    </Stack>
  );
}
