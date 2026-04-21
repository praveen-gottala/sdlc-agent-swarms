import React, { useRef } from 'react';
import { DesignSpecRenderer } from './DesignSpecRenderer';
import { filterSpecToNodes } from '../../spec-split';
import type { SharedChromeSpec } from '@shared/types/shared-chrome';
import type { RendererTokens } from '@shared/types/tokens';
import type { CatalogMap } from '@shared/types/catalog';

interface NavigationBinding {
  sourceNodeId: string;
  sourceScreenId: string;
  targetScreenId: string;
  reason: string;
  mode?: 'navigate' | 'overlay';
}

export interface LayoutShellProps {
  chromeSpec: SharedChromeSpec;
  tokens: RendererTokens;
  catalog: CatalogMap;
  onNavigate: (screenId: string) => void;
  /** Full manifest navigation — chrome hotspots must resolve overlay vs navigate. */
  navigationBindings: readonly NavigationBinding[];
  children: React.ReactNode;
}

export function LayoutShell({
  chromeSpec,
  tokens,
  catalog,
  onNavigate,
  navigationBindings,
  children,
}: LayoutShellProps) {
  const mountIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `mount-${Math.random().toString(36).slice(2)}`,
  );

  const regions = chromeSpec.regions;

  const headerIds = regions?.header ?? [];
  const sidebarIds = regions?.sidebar ?? [];
  const footerIds = regions?.footer ?? [];

  const headerSpec = headerIds.length > 0 ? filterSpecToNodes(chromeSpec, headerIds) : null;
  const sidebarSpec = sidebarIds.length > 0 ? filterSpecToNodes(chromeSpec, sidebarIds) : null;
  const footerSpec = footerIds.length > 0 ? filterSpecToNodes(chromeSpec, footerIds) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {headerSpec && (
        <div
          data-persistent="header"
          data-mount-id={mountIdRef.current}
          style={{ flexShrink: 0 }}
        >
          <DesignSpecRenderer
            spec={headerSpec}
            tokens={tokens}
            catalog={catalog}
            onNavigate={onNavigate}
            navigationBindings={navigationBindings}
          />
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {sidebarSpec && (
          <div
            data-persistent="sidebar"
            data-mount-id={mountIdRef.current}
            style={{ flexShrink: 0, overflow: 'auto' }}
          >
            <DesignSpecRenderer
              spec={sidebarSpec}
              tokens={tokens}
              catalog={catalog}
              onNavigate={onNavigate}
              navigationBindings={navigationBindings}
            />
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {children}
        </div>
      </div>
      {footerSpec && (
        <div
          data-persistent="footer"
          data-mount-id={mountIdRef.current}
          style={{ flexShrink: 0 }}
        >
          <DesignSpecRenderer
            spec={footerSpec}
            tokens={tokens}
            catalog={catalog}
            onNavigate={onNavigate}
            navigationBindings={navigationBindings}
          />
        </div>
      )}
    </div>
  );
}

