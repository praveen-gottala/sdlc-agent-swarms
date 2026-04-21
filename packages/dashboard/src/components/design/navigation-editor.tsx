'use client';

import { useCallback, useEffect, useState } from 'react';
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

function screenTypeBadgeColor(st: ScreenType): string {
  switch (st) {
    case 'modal': return 'bg-purple-500/20 text-purple-400';
    case 'drawer': return 'bg-blue-500/20 text-blue-400';
    case 'sheet': return 'bg-amber-500/20 text-amber-400';
    default: return '';
  }
}

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
    <div className="flex flex-col gap-2 p-3 border-t border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          Navigation from {activePage?.name ?? activePageId}
        </span>
        {dirty && (
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>

      {loading ? (
        <span className="text-xs text-text-muted">Loading...</span>
      ) : navTargets.length === 0 && !picking ? (
        <span className="text-xs text-text-muted">No navigation targets defined</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {navTargets.map((nav, i) => {
            const targetPage = pages.find(p => p.id === nav.target);
            const targetType = getScreenType(nav.target);
            const effectiveMode = nav.mode ?? deriveMode(targetType);
            return (
              <div key={i} className="flex items-center gap-1.5 text-xs rounded-md bg-bg-elevated/30 px-2 py-1.5">
                <span className="flex-1 text-text-primary truncate" title={`${nav.trigger}${nav.source_node ? ` (${nav.source_node})` : ''}`}>
                  {nav.trigger}
                </span>
                <span className="text-text-muted">→</span>
                <span className="text-accent-blue font-medium truncate max-w-[120px]">{targetPage?.name ?? nav.target}</span>
                {targetType !== 'page' && (
                  <span className={`px-1 py-0.5 rounded text-[10px] font-medium leading-none ${screenTypeBadgeColor(targetType)}`}>
                    {targetType}
                  </span>
                )}
                <button
                  onClick={() => handleToggleMode(i)}
                  className={`px-1 py-0.5 rounded text-[10px] font-medium leading-none cursor-pointer transition-colors ${
                    effectiveMode === 'overlay'
                      ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
                      : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                  }`}
                  title={`Mode: ${effectiveMode}. Click to toggle.`}
                >
                  {effectiveMode}
                </button>
                <button
                  onClick={() => handleRemove(i)}
                  className="text-text-muted hover:text-accent-red transition-colors"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {picking ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-accent-blue/50 bg-accent-blue/5 p-2">
          {!pickedNodeId ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
              <span className="text-xs text-accent-blue font-medium">Click an element in the prototype...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">Element:</span>
                <span className="text-text-primary font-medium">{pickedLabel}</span>
                <span className="text-text-muted">({pickedNodeId})</span>
              </div>
              <select
                value={newTarget}
                onChange={e => setNewTarget(e.target.value)}
                className="text-xs rounded border border-border bg-bg-base px-2 py-1 text-text-primary"
              >
                <option value="">Navigate to...</option>
                {availableTargets.map(p => {
                  const st = getScreenType(p.id);
                  const suffix = st !== 'page' ? ` [${st}]` : '';
                  return (
                    <option key={p.id} value={p.id}>{p.name}{suffix}</option>
                  );
                })}
              </select>
            </>
          )}
          <div className="flex gap-1.5">
            {pickedNodeId && (
              <Button variant="primary" size="sm" onClick={handleConfirmBinding} disabled={!newTarget}>
                Add
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleCancelPicking}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={handleStartPicking}>
          + Add navigation
        </Button>
      )}
    </div>
  );
}
