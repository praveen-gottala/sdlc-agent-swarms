'use client';

import { useCallback } from 'react';

interface ResizeHandleProps {
  readonly onWidthChange: (width: number) => void;
  readonly currentWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly storageKey: string;
  readonly isResizing: boolean;
  readonly setIsResizing: (v: boolean) => void;
}

export function ResizeHandle({
  onWidthChange,
  currentWidth,
  minWidth,
  maxWidth,
  storageKey,
  isResizing,
  setIsResizing,
}: ResizeHandleProps): React.JSX.Element {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let latestWidth = startWidth;

    const onMouseMoveTracked = (ev: MouseEvent): void => {
      const delta = startX - ev.clientX;
      latestWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      onWidthChange(latestWidth);
    };

    const onMouseUp = (): void => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMoveTracked);
      document.removeEventListener('mouseup', onMouseUp);
      localStorage.setItem(storageKey, String(latestWidth));
    };

    document.addEventListener('mousemove', onMouseMoveTracked);
    document.addEventListener('mouseup', onMouseUp);
  }, [currentWidth, minWidth, maxWidth, storageKey, onWidthChange, setIsResizing]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      className={`group hidden md:flex w-2 cursor-col-resize items-center justify-center transition-colors flex-shrink-0 ${
        isResizing ? 'bg-accent-blue/20' : ''
      }`}
    >
      <div className={`h-8 w-1 rounded-full transition-opacity ${
        isResizing ? 'opacity-100 bg-accent-blue/60' : 'opacity-0 group-hover:opacity-100 bg-text-muted/40'
      }`} />
    </div>
  );
}
