'use client';

import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '@mantine/core';
import { ResizeHandle } from './resize-handle';

const PRD_PANEL_STORAGE_KEY = 'chip-prd-panel-width';
const PRD_PANEL_MIN = 320;
const PRD_PANEL_MAX = 640;
const PRD_PANEL_DEFAULT = 480;

interface SplitPanelLayoutProps {
  readonly children: [ReactNode, ReactNode];
  readonly prdPanelVisible: boolean;
}

export function SplitPanelLayout({ children, prdPanelVisible }: SplitPanelLayoutProps): React.JSX.Element {
  const [chatPanel, prdPanel] = children;

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return PRD_PANEL_DEFAULT;
    const saved = localStorage.getItem(PRD_PANEL_STORAGE_KEY);
    return saved ? Math.max(PRD_PANEL_MIN, Math.min(PRD_PANEL_MAX, Number(saved))) : PRD_PANEL_DEFAULT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [mobileTab, setMobileTab] = useState<string>('chat');

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Mobile tab switcher */}
      {prdPanelVisible && (
        <div className="flex md:hidden border-b border-border px-4 py-2 bg-bg-surface">
          <SegmentedControl
            value={mobileTab}
            onChange={setMobileTab}
            data={[
              { label: 'Chat', value: 'chat' },
              { label: 'Document', value: 'document' },
            ]}
            size="xs"
            fullWidth
          />
        </div>
      )}

      {/* Desktop split panel */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Chat panel — always visible on desktop */}
        <div className="flex flex-col flex-1 min-w-[360px] min-h-0 overflow-hidden">
          {chatPanel}
        </div>

        {/* Resize handle + Right panel — only when PRD visible */}
        {prdPanelVisible && (
          <>
            <ResizeHandle
              onWidthChange={setPanelWidth}
              currentWidth={panelWidth}
              minWidth={PRD_PANEL_MIN}
              maxWidth={PRD_PANEL_MAX}
              storageKey={PRD_PANEL_STORAGE_KEY}
              isResizing={isResizing}
              setIsResizing={setIsResizing}
            />
            <div
              className="overflow-hidden border-l border-border bg-bg-base animate-[slideInRight_0.3s_ease-out]"
              style={{
                width: panelWidth,
                transition: isResizing ? 'none' : 'width 200ms ease',
              }}
            >
              {prdPanel}
            </div>
          </>
        )}
      </div>

      {/* Mobile: show one panel at a time */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        {!prdPanelVisible || mobileTab === 'chat' ? chatPanel : prdPanel}
      </div>
    </div>
  );
}
