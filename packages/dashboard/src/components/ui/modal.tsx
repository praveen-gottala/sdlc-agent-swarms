'use client';

import React, { useEffect, useCallback } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Tailwind max-width class, e.g. 'max-w-lg', 'max-w-2xl'. */
  width?: string;
  children: React.ReactNode;
}

/**
 * Modal dialog with backdrop and close button.
 * Closes on Escape key and backdrop click.
 */
export function Modal({
  open,
  onClose,
  title,
  width = 'max-w-lg',
  children,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className={[
          'relative z-10 w-full rounded-lg border border-border bg-bg-card shadow-xl',
          width,
        ].join(' ')}
      >
        {/* header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-text-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-ring"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {/* body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
