'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAutoResize } from '@/lib/hooks/use-auto-resize';

const MAX_FILE_SIZE_BYTES = 512 * 1024;
const ACCEPTED_EXTENSIONS = new Set(['.md', '.txt', '.yaml', '.yml']);

interface AttachedFile {
  readonly name: string;
  readonly content: string;
}

const BLOB_COLORS = [
  'var(--color-gradient-1)',
  'var(--color-gradient-2)',
  'var(--color-gradient-3)',
  'var(--color-gradient-5)',
] as const;

const PLACEHOLDER_SUGGESTIONS = [
  'Build a personal expense tracker with budgets...',
  'Design an e-commerce store with product catalog...',
  'Create a project management dashboard...',
  'Build a recipe sharing app with search...',
  'Design a SaaS analytics dashboard...',
  'Create a real-time chat application...',
] as const;

const ACTIVE_BLOB_COLORS = [
  'var(--color-gradient-2)',
  'var(--color-gradient-3)',
] as const;

interface WelcomeHeroProps {
  readonly onSubmit: (text: string, attachment?: { name: string; displayText?: string }) => void;
  readonly isRunning?: boolean;
}

export function WelcomeHero({ onSubmit, isRunning = false }: WelcomeHeroProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [blobColor1, setBlobColor1] = useState(0);
  const [blobColor2, setBlobColor2] = useState(2);
  const [submitted, setSubmitted] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (prefersReducedMotion.current) return;

    const t1 = setInterval(() => {
      setBlobColor1((i) => (i + 1) % BLOB_COLORS.length);
    }, 5000);

    const t2 = setInterval(() => {
      setBlobColor2((i) => (i + 1) % BLOB_COLORS.length);
    }, 7000);

    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  useEffect(() => {
    if (value.length > 0 || prefersReducedMotion.current) return;

    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
        setPlaceholderVisible(true);
      }, 400);
    }, 3500);

    return () => clearInterval(interval);
  }, [value.length]);

  useAutoResize(inputRef, value);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(ext)) return;
    if (file.size > MAX_FILE_SIZE_BYTES || file.size === 0) return;

    const content = await file.text();
    setAttachedFile({ name: file.name, content });
  }, []);

  const handleSubmit = useCallback(() => {
    const hasFile = attachedFile !== null;
    const hasText = value.trim().length > 0;
    if (!hasFile && !hasText) return;

    let rawInput: string;
    if (hasFile && hasText) {
      rawInput = `${attachedFile.content}\n\n---\n\nAdditional context:\n${value.trim()}`;
    } else if (hasFile) {
      rawInput = attachedFile.content;
    } else {
      rawInput = value.trim();
    }

    setSubmitted(true);
    onSubmit(rawInput, hasFile ? { name: attachedFile.name, displayText: hasText ? value.trim() : undefined } : undefined);
    setValue('');
    setAttachedFile(null);
  }, [value, attachedFile, onSubmit]);

  return (
    <div className="flex flex-1 flex-col items-center pt-[18vh] px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div data-gradient-blob className="absolute left-1/4 top-1/4 h-[40vh] w-[40vw] rounded-full blur-[200px]"
             style={{
               background: isRunning ? ACTIVE_BLOB_COLORS[0] : BLOB_COLORS[blobColor1],
               opacity: isRunning ? 0.45 : 0.30,
               animation: 'gradient-drift 20s ease-in-out infinite',
               transition: 'background 1.5s ease-in-out, opacity 1.5s ease-in-out',
             }} />
        <div data-gradient-blob className="absolute right-1/4 bottom-1/4 h-[30vh] w-[30vw] rounded-full blur-[180px]"
             style={{
               background: isRunning ? ACTIVE_BLOB_COLORS[1] : BLOB_COLORS[blobColor2],
               opacity: isRunning ? 0.35 : 0.20,
               animation: 'gradient-drift 25s ease-in-out infinite reverse',
               transition: 'background 1.5s ease-in-out, opacity 1.5s ease-in-out',
             }} />
      </div>

      <div
        className="relative z-10 w-full max-w-[640px]"
        style={{
          opacity: submitted ? 0 : 1,
          transform: submitted ? 'scale(0.95) translateY(-12px)' : 'scale(1) translateY(0)',
          transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
          pointerEvents: submitted ? 'none' : 'auto',
        }}
      >
        <div className="text-center mb-8">
          <div className="mb-4 flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-accent-indigo/8 border border-accent-indigo/15">
            <svg className="h-5 w-5 text-accent-indigo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight text-text-primary">What do you want to build?</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-text-muted max-w-sm mx-auto">
            Describe your idea. The Clarifier will analyze gaps, ask targeted questions, and produce a comprehensive PRD.
          </p>
        </div>

        {/* Two-row input card */}
        <div className="input-inline rounded-2xl px-5 pt-4 pb-3 flex flex-col gap-3 relative">
          {/* Top row: textarea with animated placeholder */}
          <div className="relative">
            {value.length === 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 text-[15px] text-text-muted/50 leading-relaxed"
                style={{
                  opacity: placeholderVisible ? 1 : 0,
                  transition: 'opacity 400ms ease-in-out',
                }}
              >
                {PLACEHOLDER_SUGGESTIONS[placeholderIdx]}
              </span>
            )}
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
              placeholder=""
              rows={1}
              className="relative z-10 w-full resize-none bg-transparent text-[15px] text-text-primary placeholder:text-transparent focus:outline-none leading-relaxed"
            />
          </div>

          {/* Bottom toolbar row */}
          <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-1.5 text-text-muted/50 transition-colors hover:text-text-muted hover:bg-bg-elevated/50">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
              {attachedFile && (
                <div className="flex items-center gap-1.5 rounded-lg bg-bg-elevated/60 border border-border/40 px-2.5 py-1 text-[12px] text-text-secondary animate-[fadeSlideUp_0.2s_ease-out]">
                  <svg className="h-3.5 w-3.5 text-text-muted/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span className="max-w-[160px] truncate">{attachedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="ml-0.5 rounded p-0.5 text-text-muted/50 transition-colors hover:text-text-muted hover:bg-bg-elevated"
                    aria-label="Remove attached file"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.yaml,.yml"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-muted/40 mr-1">Opus</span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!value.trim() && attachedFile === null}
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
    </div>
  );
}
