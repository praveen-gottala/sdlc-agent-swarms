'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useRendererBridge, type UseRendererBridgeResult, type OnLogCallback } from '../../lib/hooks/use-renderer-bridge';
import type { Page } from './page-registry';

export interface DesignCanvasProps {
  page: Page | null;
  /** Total number of pages in the project (for context bar) */
  pageCount?: number;
  /** Project name for context bar */
  projectName?: string;
  onGenerateDesign?: () => void;
  onApprove?: () => void;
  onNodeClicked?: (data: { nodeId: string; catalogType: string | null; computedStyles: Record<string, string> }) => void;
  onSaveSpec?: () => void;
  /** Called when the user clicks "Submit feedback" to run the correction pipeline */
  onSubmitFeedback?: () => void;
  /** Whether there are pending tags and the correction pipeline can be invoked */
  canSubmitFeedback?: boolean;
  /** Whether correction is currently in progress */
  correcting?: boolean;
  /** Error message from the last correction attempt */
  correctionError?: string | null;
  /** Current correction iteration */
  iteration?: number;
  /** Maximum allowed correction iterations */
  maxIterations?: number;
  /** Active pipeline run ID (shows pipeline progress instead of generating dots) */
  pipelineRunId?: string | null;
  /** Called when the renderer bridge becomes ready, exposing the bridge to the parent */
  onBridgeReady?: (bridge: UseRendererBridgeResult) => void;
  /** Whether there are unsaved property changes */
  hasUnsavedChanges?: boolean;
  /** Called to revert all unsaved changes back to last saved state */
  onRevertSpec?: () => void;
  /** Design spec passed from parent — eliminates duplicate fetch */
  designSpec?: object | null;
  /** Pre-loaded renderer tokens + catalog for the iframe renderer */
  rendererData?: { tokens: any; catalog: any } | null;
  /** Log callback for structured logging */
  onLog?: (level: string, source: string, message: string) => void;
}

const RENDERER_URL = 'http://localhost:4100';

/**
 * Central design canvas that renders design specs in an iframe
 * or shows contextual CTAs based on page design status.
 */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const DESIGN_WIDTH = 1440;

export function DesignCanvas({
  page,
  pageCount = 0,
  projectName = 'Project',
  onGenerateDesign,
  onApprove,
  onNodeClicked,
  onSaveSpec,
  onSubmitFeedback,
  canSubmitFeedback = false,
  correcting = false,
  correctionError = null,
  iteration = 0,
  maxIterations = 3,
  onBridgeReady,
  hasUnsavedChanges = false,
  onRevertSpec,
  designSpec,
  rendererData,
  onLog,
}: DesignCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const bridgeOnLog = useCallback<OnLogCallback>(
    (level, message, logSource) => onLog?.(level, logSource ?? 'bridge', message),
    [onLog],
  );
  const bridge = useRendererBridge(iframeRef, { onLog: bridgeOnLog });
  const [rendererHealthy, setRendererHealthy] = useState<boolean | null>(null);
  const [rendererStarting, setRendererStarting] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [correctionIteration, setCorrectionIteration] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(1);

  // Compute fit-to-width scale when the container resizes
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableWidth = entry.contentRect.width;
        const scale = Math.min(availableWidth / DESIGN_WIDTH, 1);
        setFitScale(scale);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const effectiveScale = zoom === 'fit' ? fitScale : zoom;

  const handleZoomIn = useCallback(() => {
    const current = zoom === 'fit' ? fitScale : zoom;
    const next = ZOOM_STEPS.find((s) => s > current + 0.01);
    if (next) setZoom(next);
  }, [zoom, fitScale]);

  const handleZoomOut = useCallback(() => {
    const current = zoom === 'fit' ? fitScale : zoom;
    const next = [...ZOOM_STEPS].reverse().find((s) => s < current - 0.01);
    if (next) setZoom(next);
  }, [zoom, fitScale]);

  const handleFitToWidth = useCallback(() => setZoom('fit'), []);

  // Expose bridge to parent when ready
  useEffect(() => {
    if (bridge.isReady && onBridgeReady) {
      onBridgeReady(bridge);
    }
  }, [bridge.isReady, onBridgeReady, bridge]);

  // Track render failures from the iframe
  useEffect(() => {
    bridge.onRenderComplete((success) => {
      setRenderFailed(!success);
    });
    return () => bridge.onRenderComplete(null);
  }, [bridge]);

  // Reset renderFailed when page changes or regeneration starts
  useEffect(() => {
    setRenderFailed(false);
  }, [page?.id, page?.designStatus]);

  // Forward node click events from bridge to parent
  useEffect(() => {
    if (!onNodeClicked) {
      bridge.onNodeClicked(null);
      return;
    }
    bridge.onNodeClicked((nodeId, catalogType, computedStyles) => {
      onNodeClicked({ nodeId, catalogType, computedStyles });
    });
    return () => bridge.onNodeClicked(null);
  }, [bridge, onNodeClicked]);

  // Auto-start renderer and poll until ready
  const retryRendererStart = useCallback(() => {
    setRendererHealthy(null);
    setRendererStarting(false);
    setRendererError(null);
    setRendererRetry((c) => c + 1);
  }, []);

  const restartRenderer = useCallback(async () => {
    setRendererHealthy(null);
    setRendererStarting(true);
    setRendererError(null);
    onLog?.('INFO', 'canvas', 'Manually restarting renderer');
    try {
      const res = await fetch('/api/renderer/restart', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'failed') {
        setRendererHealthy(false);
        setRendererStarting(false);
        setRendererError(data.error ?? 'Restart failed');
      } else {
        setRendererRetry((c) => c + 1);
      }
    } catch {
      setRendererHealthy(false);
      setRendererStarting(false);
      setRendererError('Network error during restart');
    }
  }, [onLog]);
  const [rendererRetry, setRendererRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndStart() {
      try {
        const res = await fetch('/api/renderer/status');
        const data = await res.json();

        if (cancelled) return;

        if (data.status === 'ready') {
          onLog?.('INFO', 'canvas', 'Renderer health check: ready');
          setRendererHealthy(true);
          setRendererStarting(false);
          return;
        }

        if (data.status === 'stale') {
          onLog?.('WARN', 'canvas', `Renderer stale: ${data.error ?? 'unknown reason'}, auto-restarting`);
          setRendererStarting(true);
          const restartRes = await fetch('/api/renderer/restart', { method: 'POST' });
          const restartData = await restartRes.json();
          if (cancelled) return;
          if (restartData.status === 'failed') {
            setRendererHealthy(false);
            setRendererStarting(false);
            setRendererError(restartData.error ?? 'Restart failed');
            return;
          }
          startPolling();
          return;
        }

        if (data.status === 'starting') {
          onLog?.('INFO', 'canvas', 'Renderer health check: already starting, polling');
          setRendererStarting(true);
          startPolling();
          return;
        }

        // status === 'stopped' → auto-start
        onLog?.('INFO', 'canvas', 'Renderer stopped, auto-starting');
        setRendererStarting(true);
        const startRes = await fetch('/api/renderer/start', { method: 'POST' });
        const startData = await startRes.json();

        if (cancelled) return;

        if (startData.status === 'already_running') {
          setRendererHealthy(true);
          setRendererStarting(false);
          return;
        }

        if (startData.status === 'failed') {
          setRendererHealthy(false);
          setRendererStarting(false);
          setRendererError(startData.error ?? 'Unknown error starting renderer');
          return;
        }

        // Started — poll until ready
        startPolling();
      } catch {
        if (!cancelled) {
          setRendererHealthy(false);
          setRendererStarting(false);
        }
      }
    }

    function startPolling() {
      let attempts = 0;
      const MAX_ATTEMPTS = 20;

      pollTimer = setInterval(async () => {
        if (cancelled) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        attempts++;
        try {
          const res = await fetch('/api/renderer/status');
          const data = await res.json();
          if (data.status === 'ready') {
            if (pollTimer) clearInterval(pollTimer);
            if (!cancelled) {
              setRendererHealthy(true);
              setRendererStarting(false);
            }
          } else if (data.status === 'stopped' && data.error) {
            if (pollTimer) clearInterval(pollTimer);
            if (!cancelled) {
              setRendererHealthy(false);
              setRendererStarting(false);
              setRendererError(data.error);
            }
          } else if (attempts >= MAX_ATTEMPTS) {
            if (pollTimer) clearInterval(pollTimer);
            if (!cancelled) {
              setRendererHealthy(false);
              setRendererStarting(false);
              setRendererError(data.error ?? 'Renderer failed to start within 30 seconds');
            }
          }
        } catch {
          if (attempts >= MAX_ATTEMPTS) {
            if (pollTimer) clearInterval(pollTimer);
            if (!cancelled) {
              setRendererHealthy(false);
              setRendererStarting(false);
              setRendererError('Network error checking renderer status');
            }
          }
        }
      }, 1500);
    }

    checkAndStart();
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [rendererRetry]);

  // Load designSpec prop into bridge when ready (replaces duplicate fetch)
  useEffect(() => {
    if (!page) return;
    const status = page.designStatus ?? 'draft';
    if (!['rendered', 'correction', 'approved'].includes(status)) return;
    if (!rendererHealthy || !bridge.isReady || !designSpec) return;

    onLog?.('INFO', 'canvas', `Loading spec into bridge for page ${page.id}`);
    setSpecLoading(true);
    const payload = rendererData
      ? { spec: designSpec, tokens: rendererData.tokens, catalog: rendererData.catalog }
      : designSpec;
    bridge.loadSpec(JSON.stringify(payload));
    if (status === 'rendered' || status === 'correction') {
      bridge.enableTagging();
    } else {
      bridge.disableTagging();
    }
    setSpecLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.designStatus, rendererHealthy, bridge.isReady, designSpec, rendererData]);

  // Fetch design metadata for iteration counter
  useEffect(() => {
    if (!page) return;
    fetch(`/api/pages/${page.id}/design`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.correctionIteration !== undefined) {
          setCorrectionIteration(data.correctionIteration);
        }
      })
      .catch(() => {});
  }, [page?.id, page?.designStatus]);

  const handleRegenerate = useCallback(() => {
    console.log('[DesignCanvas] Regenerate design for page:', page?.id);
    onGenerateDesign?.();
  }, [page?.id, onGenerateDesign]);

  const handleApprove = useCallback(() => {
    if (!page) return;
    fetch(`/api/pages/${page.id}/design/approve`, { method: 'POST' })
      .then((r) => {
        if (r.ok) onApprove?.();
      })
      .catch(() => {});
  }, [page, onApprove]);

  const status = page?.designStatus ?? undefined;
  const showIframe = rendererHealthy && (status === 'rendered' || status === 'correction' || status === 'approved');

  return (
    <div className="flex flex-col h-full">
      {/* Context bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-card/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">{projectName}</span>
          <span className="text-xs text-text-muted">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
        </div>
        {page && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{page.name}</span>
            <Badge variant={status === 'approved' ? 'success' : status === 'generating' ? 'info' : 'default'}>
              {status ?? 'draft'}
            </Badge>
          </div>
        )}
      </div>

      {/* Zoom controls — shown when iframe is visible */}
      {showIframe && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-border bg-bg-card/30">
          <button
            onClick={handleZoomOut}
            className="px-1.5 py-0.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-elevated/50 rounded transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-[11px] text-text-muted w-12 text-center tabular-nums">
            {Math.round(effectiveScale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-1.5 py-0.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-elevated/50 rounded transition-colors"
            title="Zoom in"
          >
            +
          </button>
          <div className="w-px h-3 bg-border mx-1" />
          <button
            onClick={handleFitToWidth}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              zoom === 'fit'
                ? 'text-accent-blue bg-accent-blue/10'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated/50'
            }`}
            title="Fit to width"
          >
            Fit
          </button>
          <button
            onClick={() => setZoom(1)}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              zoom === 1
                ? 'text-accent-blue bg-accent-blue/10'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated/50'
            }`}
            title="Actual size"
          >
            100%
          </button>
        </div>
      )}

      {/* Main canvas area */}
      <div ref={canvasContainerRef} className="flex-1 relative overflow-auto">
        {/* Empty state: no page selected */}
        {!page && (
          <EmptyState
            title="Select a page"
            description="Choose a page from the registry to view or generate its design."
          />
        )}

        {/* Draft: show generate CTA */}
        {page && status === 'draft' && (
          <EmptyState title="No design yet" description="Generate a design spec for this page.">
            <Button
              variant="primary"
              onClick={() => {
                console.log('[DesignCanvas] Generate design for page:', page.id);
                onGenerateDesign?.();
              }}
            >
              Generate design
            </Button>
          </EmptyState>
        )}

        {/* Generating: show progress animation */}
        {page && status === 'generating' && (
          <EmptyState title="Generating design" description="The design agent is working on this page.">
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </EmptyState>
        )}

        {/* Renderer starting */}
        {page && rendererStarting && ['rendered', 'correction', 'approved'].includes(status ?? '') && (
          <EmptyState
            title="Starting design renderer"
            description="The design renderer is starting up. This usually takes a few seconds."
          >
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </EmptyState>
        )}

        {/* Renderer failed to start */}
        {page && !rendererStarting && rendererHealthy === false && ['rendered', 'correction', 'approved'].includes(status ?? '') && (
          <EmptyState
            title="Renderer unavailable"
            description={rendererError ?? 'Could not start the design renderer. Check that packages are installed.'}
          >
            {rendererError && (
              <code className="mt-2 block max-w-md text-xs text-text-muted bg-bg-surface-raised px-3 py-2 rounded-md break-all whitespace-pre-wrap">
                {rendererError}
              </code>
            )}
            <div className="flex gap-2 mt-1">
              <Button variant="secondary" size="sm" onClick={retryRendererStart}>
                Retry
              </Button>
              <Button variant="secondary" size="sm" onClick={restartRenderer}>
                Kill &amp; Restart
              </Button>
            </div>
          </EmptyState>
        )}

        {/* Spec loading */}
        {specLoading && showIframe && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-base/60 z-10">
            <span className="text-sm text-text-muted">Loading spec...</span>
          </div>
        )}

        {/* Iframe for rendered/correction/approved — scaled to fit */}
        {showIframe && (
          <iframe
            ref={iframeRef}
            src={RENDERER_URL}
            data-testid="design-iframe"
            title="Design Renderer"
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: `${DESIGN_WIDTH}px`,
              height: `${Math.ceil(100 / effectiveScale)}vh`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
              border: 'none',
            }}
          />
        )}

        {/* Render failure overlay — shown when iframe reports empty/truncated spec */}
        {showIframe && renderFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-base/80 z-20">
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-bg-card border border-border shadow-lg max-w-sm text-center">
              <div className="w-10 h-10 rounded-full bg-accent-red/10 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent-red">
                  <path d="M10 6v4m0 4h.01M3.07 16h13.86c1.1 0 1.79-1.19 1.24-2.14L11.24 3.57a1.43 1.43 0 0 0-2.48 0L1.83 13.86C1.28 14.81 1.97 16 3.07 16z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Design Spec Error</h3>
              <p className="text-xs text-text-muted">
                The design spec has no renderable nodes. This usually happens when the LLM response was truncated due to token limits.
              </p>
              <Button
                variant="primary"
                size="sm"
                data-testid="regenerate-on-error-btn"
                onClick={handleRegenerate}
              >
                Regenerate Design
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {page && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-bg-card/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canSubmitFeedback || correcting || iteration >= maxIterations}
              onClick={onSubmitFeedback}
            >
              {correcting ? 'Correcting...' : 'Submit feedback'}
            </Button>
            {(correctionIteration > 0 || iteration > 0) && (
              <span className="text-xs text-text-muted">
                Iteration {iteration || correctionIteration} / {maxIterations}
              </span>
            )}
            {iteration >= maxIterations && (
              <span className="text-[10px] text-accent-yellow">Max reached</span>
            )}
            {correctionError && (
              <span className="text-[10px] text-accent-red truncate max-w-[200px]" title={correctionError}>
                {correctionError}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && onRevertSpec && (
              <Button variant="ghost" size="sm" data-testid="revert-spec-btn" onClick={onRevertSpec}>
                Revert
              </Button>
            )}
            {onSaveSpec && ['rendered', 'correction'].includes(status ?? '') && (
              <Button variant="ghost" size="sm" data-testid="save-spec-btn" onClick={onSaveSpec}>
                {hasUnsavedChanges ? 'Save *' : 'Save'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRegenerate}
              disabled={status === 'generating'}
            >
              Regenerate
            </Button>
            {status === 'approved' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Unlock: set back to rendered
                  fetch(`/api/pages/${page.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ designStatus: 'rendered' }),
                  }).then(() => onApprove?.());
                }}
              >
                Unlock
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                data-testid="approve-btn"
                onClick={handleApprove}
                disabled={!['rendered', 'correction'].includes(status ?? '')}
              >
                Approve
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Reusable centered empty-state helper. */
function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="text-sm text-text-muted mt-1 max-w-sm">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
