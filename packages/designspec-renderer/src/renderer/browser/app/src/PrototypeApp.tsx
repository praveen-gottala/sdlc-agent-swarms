import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DesignSpecRenderer } from './DesignSpecRenderer';
import { LayoutShell } from './LayoutShell';
import {
  applyChromeActiveForPage,
  collectChromeRootIds,
  findPageChromeRootIds,
  stripChromeFromSpec,
} from '../../spec-split';
import type { DesignSpecV2 } from '@shared/types/design-spec-v2';
import type { SharedChromeSpec } from '@shared/types/shared-chrome';
import type { RendererTokens } from '@shared/types/tokens';
import type { CatalogMap } from '@shared/types/catalog';

type ScreenType = 'page' | 'modal' | 'drawer' | 'sheet';

interface PrototypeScreen {
  screenId: string;
  name: string;
  route: string;
  specPath: string;
  isDefault?: boolean;
  screenType?: ScreenType;
}

interface NavigationBinding {
  sourceNodeId: string;
  sourceScreenId: string;
  targetScreenId: string;
  reason: string;
  mode?: 'navigate' | 'overlay';
}

interface PrototypeManifest {
  version: string;
  projectName: string;
  screens: PrototypeScreen[];
  navigation: NavigationBinding[];
}

interface PrototypeAppProps {
  manifest: PrototypeManifest;
  specs: Record<string, DesignSpecV2>;
  tokens: RendererTokens;
  catalog: CatalogMap;
  /** Optional shared chrome from Chrome Pass — enables persistent header/footer in LayoutShell. */
  chromeSpec?: SharedChromeSpec | null;
}

function getScreenIdFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash || hash === '#') return null;
  return hash.replace(/^#\/?/, '');
}

function getOverlayClass(screenType: ScreenType): string {
  switch (screenType) {
    case 'modal': return 'overlay-modal';
    case 'drawer': return 'overlay-drawer';
    case 'sheet': return 'overlay-sheet';
    default: return '';
  }
}

function getOverlayWidth(screenType: ScreenType): number | undefined {
  switch (screenType) {
    case 'modal': return 560;
    case 'drawer': return 320;
    case 'sheet': return undefined; // full-width, controlled by CSS
    default: return undefined;
  }
}

export function PrototypeApp({ manifest, specs, tokens, catalog, chromeSpec }: PrototypeAppProps) {
  const defaultScreen = manifest.screens.find(s => s.isDefault) ?? manifest.screens[0];
  const [activeScreenId, setActiveScreenId] = useState(
    () => getScreenIdFromHash() ?? defaultScreen?.screenId ?? '',
  );
  const [overlayScreenId, setOverlayScreenId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const screenMap = useMemo(
    () => new Map(manifest.screens.map(s => [s.screenId, s])),
    [manifest.screens],
  );

  // Hash changes triggered by navigateTo are already processed — skip them.
  const handledHashRef = useRef<string | null>(null);

  useEffect(() => {
    function onHashChange(): void {
      const id = getScreenIdFromHash();
      if (!id) return;
      if (handledHashRef.current === id) {
        handledHashRef.current = null;
        return;
      }
      const screen = screenMap.get(id);
      if (!screen) return;
      const effectiveType = screen.screenType ?? 'page';
      if (effectiveType !== 'page') {
        setOverlayScreenId(id);
      } else {
        setActiveScreenId(id);
        setOverlayScreenId(null);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [screenMap]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (overlayScreenId) {
      if (!dialog.open) dialog.showModal();
      pageContainerRef.current?.setAttribute('inert', '');
    } else {
      if (dialog.open) dialog.close();
      pageContainerRef.current?.removeAttribute('inert');
    }
  }, [overlayScreenId]);

  const closeOverlayRef = useRef<() => void>(() => {});

  const closeOverlay = useCallback(() => {
    setOverlayScreenId(null);
    try { window.location.hash = `/${activeScreenId}`; } catch { /* sandbox */ }
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
      triggerRef.current = null;
    });
  }, [activeScreenId]);

  closeOverlayRef.current = closeOverlay;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function onCancel(e: Event): void {
      e.preventDefault();
      closeOverlayRef.current();
    }
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, []);

  const navigateTo = useCallback((screenId: string, resolvedMode?: 'navigate' | 'overlay') => {
    const screen = screenMap.get(screenId);
    const effectiveType = screen?.screenType ?? 'page';

    const binding = manifest.navigation.find(
      b => b.targetScreenId === screenId && b.sourceScreenId === activeScreenId,
    );
    const mode = resolvedMode ?? binding?.mode ?? (effectiveType !== 'page' ? 'overlay' : 'navigate');

    handledHashRef.current = screenId;
    if (mode === 'overlay') {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setOverlayScreenId(screenId);
      try { window.location.hash = `/${screenId}`; } catch { /* sandbox */ }
    } else {
      setOverlayScreenId(null);
      setActiveScreenId(screenId);
      try { window.location.hash = `/${screenId}`; } catch { /* sandbox */ }
    }
  }, [screenMap, manifest.navigation, activeScreenId]);

  const activeSpec = specs[activeScreenId];
  const overlaySpec = overlayScreenId ? specs[overlayScreenId] : null;

  const chromeRootIds = useMemo(
    () => (chromeSpec?.regions ? collectChromeRootIds(chromeSpec.regions) : []),
    [chromeSpec],
  );

  const layoutShellEnabled = Boolean(chromeSpec && chromeRootIds.length > 0);

  const chromeForActivePage = useMemo(
    () => (chromeSpec && layoutShellEnabled ? applyChromeActiveForPage(chromeSpec, activeScreenId) : null),
    [chromeSpec, layoutShellEnabled, activeScreenId],
  );

  const contentSpec = useMemo(() => {
    if (!activeSpec || !layoutShellEnabled) return activeSpec;
    const pageIds = findPageChromeRootIds(activeSpec, chromeSpec?.regions);
    return stripChromeFromSpec(activeSpec, pageIds);
  }, [activeSpec, layoutShellEnabled, chromeSpec?.regions]);
  const overlayScreen = overlayScreenId ? screenMap.get(overlayScreenId) : null;
  const overlayType = overlayScreen?.screenType ?? 'modal';

  const activeBindings = useMemo(
    () => manifest.navigation.filter(
      b => b.sourceScreenId === activeScreenId || b.sourceScreenId === '__chrome__',
    ),
    [manifest.navigation, activeScreenId],
  );
  const overlayBindings = useMemo(
    () => overlayScreenId
      ? manifest.navigation.filter(
          b => b.sourceScreenId === overlayScreenId || b.sourceScreenId === '__chrome__',
        )
      : [],
    [manifest.navigation, overlayScreenId],
  );

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.nav-hotspot') || target.closest('[data-node]')) return;
    document.body.classList.remove('show-hotspots');
    void document.body.offsetWidth;
    document.body.classList.add('show-hotspots');
    setTimeout(() => document.body.classList.remove('show-hotspots'), 1500);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      closeOverlay();
    }
  }, [closeOverlay]);

  if (!activeSpec) {
    return (
      <div style={{ padding: 48, fontFamily: 'system-ui', color: '#666' }}>
        Screen &quot;{activeScreenId}&quot; not found. Available: {manifest.screens.map(s => s.screenId).join(', ')}
      </div>
    );
  }

  const pageBody = layoutShellEnabled && chromeForActivePage ? (
    <LayoutShell
      chromeSpec={chromeForActivePage}
      tokens={tokens}
      catalog={catalog}
      onNavigate={navigateTo}
      navigationBindings={manifest.navigation}
    >
      <div
        ref={pageContainerRef}
        style={{ flex: 1, overflow: 'auto' }}
        data-persistent="content"
        onClick={handleBackgroundClick}
      >
        <div data-screen-marker={activeScreenId}>
          <DesignSpecRenderer
            spec={contentSpec!}
            tokens={tokens}
            catalog={catalog}
            onNavigate={navigateTo}
            navigationBindings={activeBindings}
            prototypeScreenId={activeScreenId}
          />
        </div>
      </div>
    </LayoutShell>
  ) : (
    <div
      ref={pageContainerRef}
      style={{ flex: 1, overflow: 'auto' }}
      onClick={handleBackgroundClick}
    >
      <DesignSpecRenderer
        spec={activeSpec}
        tokens={tokens}
        catalog={catalog}
        onNavigate={navigateTo}
        navigationBindings={activeBindings}
        prototypeScreenId={activeScreenId}
      />
    </div>
  );

  const overlayWidth = getOverlayWidth(overlayType);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {pageBody}

      <dialog
        ref={dialogRef}
        className={`overlay-dialog ${getOverlayClass(overlayType)}`}
        aria-modal="true"
        role="dialog"
        aria-label={overlayScreen?.name ?? 'Overlay'}
        onClick={handleBackdropClick}
      >
        {overlaySpec && (
          <div style={{ position: 'relative' }}>
            <button
              className="overlay-close-system"
              onClick={closeOverlay}
              aria-label="Close"
              type="button"
            >
              &#x2715;
            </button>
            <div
              className="overlay-content"
              style={overlayWidth ? { width: overlayWidth } : undefined}
            >
              <div className="overlay-body">
                <DesignSpecRenderer
                  spec={overlaySpec}
                  tokens={tokens}
                  catalog={catalog}
                  onNavigate={navigateTo}
                  navigationBindings={overlayBindings}
                  prototypeScreenId={overlayScreenId ?? undefined}
                />
              </div>
            </div>
          </div>
        )}
      </dialog>

      <ScreenSelectorBar
        screens={manifest.screens}
        activeScreenId={activeScreenId}
        overlayScreenId={overlayScreenId}
        onSelect={navigateTo}
        projectName={manifest.projectName}
      />
    </div>
  );
}

interface ScreenSelectorBarProps {
  screens: PrototypeScreen[];
  activeScreenId: string;
  overlayScreenId: string | null;
  onSelect: (screenId: string) => void;
  projectName: string;
}

function ScreenSelectorBar({ screens, activeScreenId, overlayScreenId, onSelect, projectName }: ScreenSelectorBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderTop: '1px solid #e5e7eb',
        background: '#fafafa',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#9ca3af', marginRight: 8 }}>{projectName}</span>
      {screens.map(screen => {
        const isActive = screen.screenId === activeScreenId || screen.screenId === overlayScreenId;
        const typeLabel = screen.screenType && screen.screenType !== 'page'
          ? ` [${screen.screenType}]`
          : '';
        const badgeTitle = screen.screenType && screen.screenType !== 'page'
          ? `Screen type: ${screen.screenType}. Override in pages.yaml → screen_type`
          : undefined;
        return (
          <button
            key={screen.screenId}
            onClick={() => onSelect(screen.screenId)}
            title={badgeTitle}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: isActive ? '1px solid #3b82f6' : '1px solid transparent',
              background: isActive ? '#eff6ff' : 'transparent',
              color: isActive ? '#2563eb' : '#6b7280',
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
            }}
          >
            {screen.name}{typeLabel}
          </button>
        );
      })}
    </div>
  );
}
