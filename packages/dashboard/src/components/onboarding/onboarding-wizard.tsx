'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DesignLogPanel } from '@/components/design/design-log-panel';
import { useDesignLog } from '@/lib/hooks/use-design-log';

interface DesignOption {
  label: string;
  vibe: string;
  colors: {
    primitive: Record<string, string>;
    semantic: Record<string, string>;
  };
  fonts: { display: string; body: string };
  brand: {
    tone: string;
    illustrationDirection: string;
    illustrationDescription: string;
    motionFeel: string;
  };
  elevation?: {
    levels: { level: number; shadow: string; description: string }[];
  };
}

type Step = 1 | 2 | 3 | 4 | 5;
type DesignSubStep = 'prompt' | 'preview';

export function OnboardingWizard() {
  const router = useRouter();
  const { log } = useDesignLog();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prdContent, setPrdContent] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [componentLibrary, setComponentLibrary] = useState<string>('shadcn');
  const [colorScheme, setColorScheme] = useState<string>('light');

  // Design step state
  const [designSubStep, setDesignSubStep] = useState<DesignSubStep>('prompt');
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [designOptions, setDesignOptions] = useState<DesignOption[] | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [designSource, setDesignSource] = useState<'llm' | 'fallback'>('fallback');

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for postMessage from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== 'agentforge-design-preview') return;
      if (event.data.type === 'design-option-selected') {
        setSelectedOptionIndex(event.data.optionIndex);
      } else if (event.data.type === 'design-option-viewed') {
        // Track which option is being viewed (optional)
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPrdContent(text);
  }

  async function generateDesignOptions(useFallback: boolean) {
    setGenerating(true);
    setError(null);
    log('INFO', 'studio', `Generating design options${useFallback ? ' (fallback)' : ' via AI'}...`);
    try {
      log('REQ', 'studio', 'POST /api/design-options', { useFallback, appName: name });
      const res = await fetch('/api/design-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: name,
          description,
          targetAudience,
          prdContent: prdContent || undefined,
          useFallback,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to generate design options');
      }
      const data = await res.json();
      setPreviewHtml(data.previewHtml);
      setDesignOptions(data.options);
      setDesignSource(data.source);
      setSelectedOptionIndex(null);
      setDesignSubStep('preview');
      log('INFO', 'studio', `${data.options?.length ?? 0} design options received`, { source: data.source });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log('ERROR', 'studio', `Design generation failed: ${msg}`);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        description,
        prdContent,
        targetAudience,
        componentLibrary,
        colorScheme,
      };

      if (designOptions && selectedOptionIndex !== null) {
        body.designOption = designOptions[selectedOptionIndex];
        body.designSource = designSource;
      } else {
        body.designArchetype = 'professional';
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create project');
      }
      // Navigate to spec generation so the spec is created automatically
      router.push('/spec?generate=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const totalSteps = 5;
  const isDesignPreview = step === 3 && designSubStep === 'preview';
  const showLogs = step === 3 && (generating || designSubStep === 'preview');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg-base p-4">
      <div
        className={`w-full rounded-xl border border-border bg-sidebar p-8 transition-all duration-300 ${
          isDesignPreview ? 'max-w-5xl' : 'max-w-lg'
        }`}
      >
        <h1 className="text-2xl font-bold text-text-primary mb-1">Create a project</h1>
        <p className="text-text-muted text-sm mb-6">
          Step {step} of {totalSteps}
        </p>

        {/* Step indicators */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-accent-blue' : 'bg-border'}`}
            />
          ))}
        </div>

        {/* Step 1: Project name + description */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1">
                Project name <span className="text-accent-orange">*</span>
              </label>
              <input
                type="text"
                data-testid="onboarding-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My SaaS App"
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1">
                Short description
              </label>
              <input
                type="text"
                data-testid="onboarding-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A project management tool for teams"
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
              />
            </div>
            <button
              data-testid="onboarding-next"
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              className="w-full mt-4 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent-blue/90 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: PRD input */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1">
                Product Requirements Document
              </label>
              <p className="text-text-muted text-[11px] mb-2">
                Paste your PRD or upload a Markdown file. This helps the AI understand what to build.
              </p>
              <textarea
                value={prdContent}
                onChange={(e) => setPrdContent(e.target.value)}
                placeholder="# My App PRD&#10;&#10;## Overview&#10;Describe your product..."
                rows={8}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/50 font-mono"
              />
              <div className="mt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-accent-blue text-xs hover:underline">
                  <input
                    type="file"
                    accept=".md,.txt,.markdown"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  Upload .md file
                </label>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors"
              >
                Back
              </button>
              <button
                data-testid="onboarding-next"
                onClick={() => setStep(3)}
                className="flex-1 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
              >
                {prdContent.trim() ? 'Next' : 'Skip'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Design options */}
        {step === 3 && designSubStep === 'prompt' && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-2">
                Design system
              </label>
              <p className="text-text-muted text-sm mb-4">
                Generate 3 unique design directions for your app. The AI will create complete design tokens including:
              </p>
              <div className="rounded-md border border-border bg-bg-base p-4 space-y-2 mb-4">
                <TokenItem label="design-tokens.yaml" desc="Colors, typography, spacing, elevation" />
                <TokenItem label="brand.yaml" desc="Brand tone, illustration direction, motion feel" />
                <TokenItem label="tailwind.config.ts" desc="Tailwind theme configuration" />
                <TokenItem label="globals.css" desc="CSS variables for design tokens" />
              </div>
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2 mb-3">{error}</p>
              )}
              <button
                onClick={() => generateDesignOptions(false)}
                disabled={generating}
                className="w-full rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent-blue/90 transition-colors"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Generating design options...
                  </span>
                ) : (
                  'Generate Design Options'
                )}
              </button>
              <button
                data-testid="onboarding-use-defaults"
                onClick={() => generateDesignOptions(true)}
                disabled={generating}
                className="w-full mt-2 text-center text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Use defaults (no AI)
              </button>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setStep(2)}
                disabled={generating}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors disabled:opacity-40"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 3 && designSubStep === 'preview' && previewHtml && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-2">
                Pick a design direction
              </label>
              <p className="text-text-muted text-[11px] mb-3">
                Browse the 3 options using the tabs, then click &quot;Select This Option&quot; inside the preview.
                {designSource === 'fallback' && ' (Using built-in archetypes)'}
              </p>
            </div>

            <iframe
              ref={iframeRef}
              srcDoc={previewHtml}
              className="w-full rounded-lg border border-border"
              style={{ minHeight: '80vh' }}
              sandbox="allow-scripts allow-same-origin"
              title="Design preview"
            />

            {selectedOptionIndex !== null && designOptions && (
              <div className="flex items-center gap-2 rounded-md border border-accent-blue/30 bg-accent-blue/5 px-4 py-3">
                <svg className="w-4 h-4 text-accent-blue shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-text-primary">
                  Selected: <strong>{designOptions[selectedOptionIndex].label}</strong>
                </span>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDesignSubStep('prompt');
                  setSelectedOptionIndex(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => generateDesignOptions(false)}
                disabled={generating}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors disabled:opacity-40"
              >
                {generating ? <Spinner /> : 'Regenerate'}
              </button>
              <div className="flex-1" />
              <button
                data-testid="onboarding-next"
                onClick={() => setStep(4)}
                disabled={selectedOptionIndex === null}
                className="rounded-md bg-accent-blue px-6 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent-blue/90 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Target audience + library */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1">
                Target audience
              </label>
              <input
                type="text"
                data-testid="onboarding-audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., fitness enthusiasts, small business owners, students"
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-2">
                Component library
              </label>
              <div className="flex gap-2">
                {['shadcn', 'material', 'custom'].map((lib) => (
                  <button
                    key={lib}
                    onClick={() => setComponentLibrary(lib)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      componentLibrary === lib
                        ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                        : 'border-border text-text-secondary hover:bg-bg-elevated/50'
                    }`}
                  >
                    {lib === 'shadcn' ? 'shadcn/ui' : lib === 'material' ? 'Material UI' : 'Custom'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-2">
                Color scheme
              </label>
              <div className="flex gap-2">
                {['light', 'dark', 'both'].map((scheme) => (
                  <button
                    key={scheme}
                    onClick={() => setColorScheme(scheme)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      colorScheme === scheme
                        ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                        : 'border-border text-text-secondary hover:bg-bg-elevated/50'
                    }`}
                  >
                    {scheme}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(3)}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors"
              >
                Back
              </button>
              <button
                data-testid="onboarding-next"
                onClick={() => setStep(5)}
                className="flex-1 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review + create */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Review</h2>
            <div className="rounded-md border border-border bg-bg-base p-4 space-y-2">
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Description" value={description || '(none)'} />
              <ReviewRow label="PRD" value={prdContent ? `${prdContent.length} chars` : 'Not provided'} />
              <ReviewRow
                label="Design"
                value={
                  designOptions && selectedOptionIndex !== null
                    ? designOptions[selectedOptionIndex].label
                    : 'Default (Professional)'
                }
              />
              <ReviewRow label="Audience" value={targetAudience || '(not specified)'} />
              <ReviewRow label="Library" value={componentLibrary} />
              <ReviewRow label="Color scheme" value={colorScheme} />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(4)}
                disabled={loading}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors disabled:opacity-40"
              >
                Back
              </button>
              <button
                data-testid="onboarding-create"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent-blue/90 transition-colors"
              >
                {loading ? 'Creating...' : 'Create project'}
              </button>
            </div>
          </div>
        )}
      </div>
      {showLogs && (
        <div className={`w-full mt-2 rounded-xl border border-border bg-sidebar transition-all duration-300 ${
          isDesignPreview ? 'max-w-5xl' : 'max-w-lg'
        }`}>
          <DesignLogPanel />
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs gap-6">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-medium capitalize">{value}</span>
    </div>
  );
}

function TokenItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <code className="text-[11px] text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded shrink-0">
        {label}
      </code>
      <span className="text-text-muted text-[11px]">{desc}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
