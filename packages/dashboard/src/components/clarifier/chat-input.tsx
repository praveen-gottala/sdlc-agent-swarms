'use client';

import { useState, useRef, useCallback } from 'react';
import { useAutoResize } from '@/lib/hooks/use-auto-resize';
import type { PagePhase } from '@/lib/clarifier-chat-types';

interface ChatInputProps {
  readonly phase: PagePhase;
  readonly onSubmit: (text: string) => void;
  readonly disabled?: boolean;
}

function getPlaceholder(phase: PagePhase): string {
  switch (phase) {
    case 'welcome': return 'Describe what you want to build...';
    case 'questions': return 'Type your answer...';
    case 'complete': return 'Ask a follow-up or request revisions...';
    default: return 'Type a message...';
  }
}

export function ChatInput({ phase, onSubmit, disabled }: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useAutoResize(inputRef, value);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue('');
  }, [value, disabled, onSubmit]);

  const showGlow = phase !== 'welcome';

  return (
    <div className="relative z-10 border-t border-border/20 px-6 pt-3 pb-4">
      {showGlow && (
        <div className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 h-32 w-[60%] rounded-full blur-[80px] opacity-[0.15]"
            style={{ background: 'linear-gradient(135deg, var(--color-gradient-1), var(--color-gradient-3))' }}
          />
        </div>
      )}
      <div className="relative mx-auto max-w-[640px]">
        <div className="input-inline rounded-2xl px-5 pt-3.5 pb-2.5 flex flex-col gap-2.5">
          {/* Top row: textarea */}
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={getPlaceholder(phase)}
            rows={1}
            disabled={disabled}
            className="w-full resize-none bg-transparent text-[15px] text-text-primary placeholder:text-text-muted/50 focus:outline-none leading-relaxed disabled:opacity-50"
          />

          {/* Bottom toolbar row */}
          <div className="flex items-center justify-between border-t border-border/30 pt-2">
            <div className="flex items-center gap-1">
              <button type="button" disabled={disabled} className="rounded-lg p-1.5 text-text-muted/50 transition-colors hover:text-text-muted hover:bg-bg-elevated/50 disabled:opacity-30">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className="flex-shrink-0 rounded-xl bg-accent-indigo p-2 transition-all hover:bg-accent-indigo/85 active:scale-[0.95] disabled:opacity-20 disabled:pointer-events-none"
            >
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
