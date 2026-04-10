'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageRegistry, type Page } from '@/components/design/page-registry';
import { DesignCanvas } from '@/components/design/design-canvas';
import { DesignInspector } from '@/components/design/design-inspector';
import type { UseRendererBridgeResult } from '@/lib/hooks/use-renderer-bridge';
import { propertyToCss } from '@/lib/design/property-to-css';
import { Button } from '@/components/ui/button';
import { CoherenceResultsModal } from '@/components/design/coherence-results-modal';
import { PipelineProgress } from '@/components/design/pipeline-progress';
import type { CoherenceResult } from '@/lib/design/coherence-check';
import { DesignLogProvider, useDesignLog } from '@/lib/hooks/use-design-log';
import { DesignLogPanel } from '@/components/design/design-log-panel';

/**
 * Design Studio page — three-panel layout for managing page designs.
 *
 * Left: page registry
 * Center: design canvas
 * Right: inspector placeholder (Phase 8)
 */
export default function DesignStudioPage() {
  return (
    <DesignLogProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64 text-text-muted">
            Loading design studio...
          </div>
        }
      >
        <DesignStudioContent />
      </Suspense>
    </DesignLogProvider>
  );
}

function DesignStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { log } = useDesignLog();

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('page'));
  const [projectName, setProjectName] = useState('Project');

  // Inspector state
  const [selectedNode, setSelectedNode] = useState<{
    nodeId: string;
    catalogType: string | null;
    computedStyles: Record<string, string>;
  } | null>(null);
  const [designSpec, setDesignSpec] = useState<any>(null);
  const [tags, setTags] = useState<{ nodeId: string; feedback: string; status?: string }[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [iteration, setIteration] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'error') => {
    setToastMsg({ text: msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const MAX_ITERATIONS = 3;

  // Bridge ref for live preview
  const bridgeRef = useRef<UseRendererBridgeResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Snapshot of last-saved designSpec for revert
  const savedDesignSpecRef = useRef<any>(null);

  // Color map for token resolution in inspector
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  // Renderer tokens + catalog for the iframe renderer
  const [rendererData, setRendererData] = useState<{ tokens: any; catalog: any } | null>(null);

  // Pipeline run state — keyed by pageId so switching pages preserves each run
  const pipelineRunMapRef = useRef<Record<string, string>>({});
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [showPipelineChoice, setShowPipelineChoice] = useState(false);

  // Coherence check state
  const [coherenceResults, setCoherenceResults] = useState<CoherenceResult[]>([]);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);
  const [coherenceLoading, setCoherenceLoading] = useState(false);
  const [showCoherenceModal, setShowCoherenceModal] = useState(false);

  const approvedCount = pages.filter(
    (p) => p.designStatus === 'approved' || p.designStatus === 'rendered',
  ).length;

  const handleCheckCoherence = useCallback(async () => {
    setCoherenceLoading(true);
    try {
      const res = await fetch('/api/design/coherence');
      if (res.ok) {
        const data = await res.json();
        setCoherenceResults(data.results ?? []);
        setCoherenceWarnings(data.warnings ?? []);
        setShowCoherenceModal(true);
      }
    } catch {
      // ignore
    } finally {
      setCoherenceLoading(false);
    }
  }, []);

  // Fetch pages and project name on mount
  useEffect(() => {
    fetch('/api/pages')
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((data) => {
        const fetched: Page[] = (data.pages ?? []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          description: (p.description as string) ?? undefined,
          status: (p.status as string) ?? undefined,
          designStatus: (p.designStatus as string) ?? 'draft',
          components: (p.components as string[]) ?? undefined,
        }));
        setPages(fetched);
        setLoading(false);

        // Auto-select from query param
        const qp = searchParams.get('page');
        if (qp && fetched.some((p) => p.id === qp)) {
          setSelectedId(qp);
        }
      })
      .catch(() => setLoading(false));

    fetch('/api/projects/active')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.name) setProjectName(data.name); })
      .catch(() => {});
  }, [searchParams]);

  // Fetch design tokens for color map (inspector use)
  useEffect(() => {
    fetch('/api/projects/tokens')
      .then((r) => (r.ok ? r.json() : { colorMap: {} }))
      .then((data) => setColorMap(data.colorMap ?? {}))
      .catch(() => {});
  }, []);

  // Poll pipeline events into the Logs panel while a pipeline run is active
  const lastEventTsRef = useRef(0);
  useEffect(() => {
    if (!pipelineRunId) {
      lastEventTsRef.current = 0;
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/events?runId=${encodeURIComponent(pipelineRunId)}&since=${lastEventTsRef.current}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const events = data.events as Array<{
          status?: string;
          detail?: string;
          stage?: string;
          type?: string;
          timestamp?: number;
          cost?: { totalCostUsd?: number; tokensUsed?: number };
          llmMeta?: { model?: string; inputTokens?: number; outputTokens?: number; durationMs?: number };
          logMeta?: { level?: string; context?: Record<string, unknown> };
        }>;

        for (const event of events) {
          let level: 'INFO' | 'WARN' | 'ERROR' = 'INFO';
          if (event.status === 'failed') {
            level = 'ERROR';
          } else if (event.status === 'log' && event.logMeta?.level) {
            const logLevel = event.logMeta.level;
            if (logLevel === 'error') level = 'ERROR';
            else if (logLevel === 'warn') level = 'WARN';
          }
          const message = event.detail ?? event.stage ?? event.type ?? 'Pipeline event';
          const metadata: Record<string, unknown> = {};
          if (event.cost?.totalCostUsd) metadata.cost = `$${event.cost.totalCostUsd.toFixed(4)}`;
          if (event.llmMeta?.inputTokens) metadata.tokens = `${event.llmMeta.inputTokens + (event.llmMeta.outputTokens ?? 0)}`;
          if (event.llmMeta?.durationMs) metadata.duration = `${(event.llmMeta.durationMs / 1000).toFixed(1)}s`;
          if (event.logMeta?.context) Object.assign(metadata, event.logMeta.context);

          log(level, 'pipeline', message, Object.keys(metadata).length > 0 ? metadata : undefined);

          if (event.timestamp && event.timestamp > lastEventTsRef.current) {
            lastEventTsRef.current = event.timestamp;
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    // Initial poll + interval
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pipelineRunId, log]);

  // Refresh a single page's data (after status changes)
  const refreshPage = useCallback(
    async (pageId: string) => {
      try {
        const res = await fetch(`/api/pages/${pageId}`);
        if (!res.ok) return;
        const updated = await res.json();
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, status: updated.status ?? p.status, designStatus: updated.designStatus ?? p.designStatus }
              : p,
          ),
        );

        // Recover lost pipelineRunId from server when a run is active
        if (updated.activeRunId && pageId === selectedId && !pipelineRunId) {
          setPipelineRunId(updated.activeRunId);
          pipelineRunMapRef.current[pageId] = updated.activeRunId;
        }
      } catch {
        // ignore
      }
    },
    [selectedId, pipelineRunId],
  );

  // Safety net: if a page shows "generating" but we have no pipelineRunId,
  // the pipeline likely finished while we were on another page. Re-check the
  // server status every 5s until it resolves.
  useEffect(() => {
    if (!selectedId || pipelineRunId) return;
    const page = pages.find((p) => p.id === selectedId);
    if (!page || page.designStatus !== 'generating') return;

    const timer = setInterval(() => {
      refreshPage(selectedId);
    }, 5_000);

    refreshPage(selectedId);
    return () => clearInterval(timer);
  }, [selectedId, pipelineRunId, pages, refreshPage]);

  // Refresh all pages
  const refreshAllPages = useCallback(async () => {
    try {
      const res = await fetch('/api/pages');
      if (!res.ok) return;
      const data = await res.json();
      const fetched: Page[] = (data.pages ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        description: (p.description as string) ?? undefined,
        status: (p.status as string) ?? undefined,
        designStatus: (p.designStatus as string) ?? 'draft',
        components: (p.components as string[]) ?? undefined,
      }));
      setPages(fetched);
    } catch {
      // ignore
    }
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      log('INFO', 'registry', `Page selected: ${id}`);
      // Save current page's runId, restore the target page's runId
      if (selectedId && pipelineRunId) {
        pipelineRunMapRef.current[selectedId] = pipelineRunId;
      }
      setSelectedId(id);
      setPipelineRunId(pipelineRunMapRef.current[id] ?? null);
      refreshPage(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', id);
      router.replace(`/design?${params.toString()}`);
    },
    [searchParams, router, log, refreshPage, selectedId, pipelineRunId],
  );

  const handleCreateNew = useCallback(async () => {
    const description = window.prompt('Enter page description:');
    if (!description?.trim()) return;
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        await refreshAllPages();
        if (created.pageId) {
          handleSelect(created.pageId);
        }
      }
    } catch {
      // ignore
    }
  }, [refreshAllPages, handleSelect]);

  // Fetch design spec when a page is selected with rendered/correction/approved status
  useEffect(() => {
    if (!selectedId) { setDesignSpec(null); return; }
    const page = pages.find((p) => p.id === selectedId);
    if (!page) return;
    const status = page.designStatus ?? 'draft';
    if (!['rendered', 'correction', 'approved'].includes(status)) { setDesignSpec(null); return; }

    log('REQ', 'studio', `Fetching design spec bundle for page ${selectedId}`);
    fetch(`/api/pages/${selectedId}/design/spec?bundle=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.spec) {
          log('INFO', 'studio', `Design spec bundle loaded for page ${selectedId}`);
          setDesignSpec(data.spec);
          setRendererData({ tokens: data.tokens, catalog: data.catalog });
          savedDesignSpecRef.current = JSON.parse(JSON.stringify(data.spec));
        } else if (data) {
          log('INFO', 'studio', `Design spec loaded for page ${selectedId} (no bundle)`);
          setDesignSpec(data);
          savedDesignSpecRef.current = JSON.parse(JSON.stringify(data));
        } else {
          log('WARN', 'studio', `No design spec returned for page ${selectedId}`);
          setDesignSpec(null);
          savedDesignSpecRef.current = null;
        }
      })
      .catch((err) => {
        log('ERROR', 'studio', `Failed to fetch design spec: ${err instanceof Error ? err.message : 'unknown'}`);
        setDesignSpec(null);
        savedDesignSpecRef.current = null;
      });

    // Also fetch design metadata for score/iteration
    fetch(`/api/pages/${selectedId}/design`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setScore(data.score ?? null);
          setIteration(data.correctionIteration ?? 0);
        }
      })
      .catch(() => {});
  }, [selectedId, pages]);

  // Handle property changes from inspector — patch spec in memory + live preview
  const handlePropertyChange = useCallback(
    (nodeId: string, path: string, value: string | number) => {
      if (!designSpec || !selectedId) return;
      // Deep clone and patch
      const updated = JSON.parse(JSON.stringify(designSpec));
      const nodes = Array.isArray(updated.nodes) ? updated.nodes : Object.values(updated.nodes ?? {});
      const node = Array.isArray(updated.nodes)
        ? nodes.find((n: any) => n.id === nodeId)
        : updated.nodes?.[nodeId];
      if (node) {
        const parts = path.split('.');
        let target = node;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        if (value === undefined || value === null) {
          delete target[parts[parts.length - 1]];
        } else {
          target[parts[parts.length - 1]] = value;
        }
      }
      setDesignSpec(updated);
      setHasUnsavedChanges(true);

      // Push live preview to iframe
      const cssStyles = propertyToCss(path, value);
      if (Object.keys(cssStyles).length > 0) {
        bridgeRef.current?.updateNodeStyle(nodeId, cssStyles);
      }
    },
    [designSpec, selectedId],
  );

  // Handle node click from canvas (will be passed to DesignCanvas)
  const handleNodeClicked = useCallback(
    (data: { nodeId: string; catalogType: string | null; computedStyles: Record<string, string> }) => {
      setSelectedNode(data);
    },
    [],
  );

  // Ref to always have latest rendererData in callbacks without re-creating them
  const rendererDataRef = useRef(rendererData);
  rendererDataRef.current = rendererData;

  const sendSpecToBridge = useCallback((spec: any) => {
    const rd = rendererDataRef.current;
    const payload = rd ? { spec, tokens: rd.tokens, catalog: rd.catalog } : spec;
    bridgeRef.current?.loadSpec(JSON.stringify(payload));
  }, []);

  // Save spec to server and reload in iframe for consistency
  const handleSaveSpec = useCallback(async () => {
    if (!selectedId || !designSpec) return;
    try {
      const res = await fetch(`/api/pages/${selectedId}/design/spec`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designSpec),
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        savedDesignSpecRef.current = JSON.parse(JSON.stringify(designSpec));
        sendSpecToBridge(designSpec);
        showToast('Design saved & preview updated', 'success');
      } else {
        showToast(`Save failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      showToast(`Save failed: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }, [selectedId, designSpec, showToast, sendSpecToBridge]);

  const handleRevertSpec = useCallback(() => {
    if (!savedDesignSpecRef.current) return;
    const reverted = JSON.parse(JSON.stringify(savedDesignSpecRef.current));
    setDesignSpec(reverted);
    setHasUnsavedChanges(false);
    sendSpecToBridge(reverted);
    showToast('Reverted to last saved state', 'success');
  }, [showToast, sendSpecToBridge]);

  const handleRevertNode = useCallback((nodeId: string) => {
    if (!savedDesignSpecRef.current || !designSpec) return;
    const saved = savedDesignSpecRef.current;
    // Find the saved version of this node
    const savedNodes = Array.isArray(saved.nodes) ? saved.nodes : Object.values(saved.nodes ?? {});
    const savedNode = Array.isArray(saved.nodes)
      ? savedNodes.find((n: any) => n.id === nodeId)
      : saved.nodes?.[nodeId];
    if (!savedNode) return;

    // Deep clone current spec and replace just this node
    const updated = JSON.parse(JSON.stringify(designSpec));
    const restoredNode = JSON.parse(JSON.stringify(savedNode));
    if (Array.isArray(updated.nodes)) {
      const idx = updated.nodes.findIndex((n: any) => n.id === nodeId);
      if (idx >= 0) updated.nodes[idx] = restoredNode;
    } else if (updated.nodes) {
      updated.nodes[nodeId] = restoredNode;
    }
    setDesignSpec(updated);
    sendSpecToBridge(updated);
    showToast('Element reverted to last saved state', 'success');
  }, [designSpec, showToast, sendSpecToBridge]);

  const bridgeLoggedRef = useRef(false);
  const handleBridgeReady = useCallback((bridge: UseRendererBridgeResult) => {
    bridgeRef.current = bridge;
    if (!bridgeLoggedRef.current) {
      bridgeLoggedRef.current = true;
      log('INFO', 'studio', 'Bridge ready — renderer connected');
    }
  }, [log]);

  const handleGenerateDesign = useCallback(() => {
    if (!selectedId) return;
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Regenerating will overwrite them. Continue?')) return;
    }
    setShowPipelineChoice(true);
  }, [selectedId, hasUnsavedChanges]);

  const handleQuickGenerate = useCallback(() => {
    if (!selectedId) return;
    log('INFO', 'studio', `Quick generate started for page ${selectedId}`);
    setShowPipelineChoice(false);
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, designStatus: 'generating' } : p,
      ),
    );
    fetch(`/api/pages/${selectedId}/design`, { method: 'POST' })
      .then((r) => {
        refreshPage(selectedId);
        if (!r.ok) {
          r.json().then((data) => {
            const msg = data.error ?? 'Design generation failed';
            showToast(typeof msg === 'string' ? msg : 'Design generation failed');
          }).catch(() => {
            showToast('Design generation failed');
          });
        }
      })
      .catch(() => {
        showToast('Network error — could not reach server');
        refreshPage(selectedId);
      });
  }, [selectedId, refreshPage, showToast]);

  const handleFullPipeline = useCallback(() => {
    if (!selectedId) return;
    setShowPipelineChoice(false);
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, designStatus: 'generating' } : p,
      ),
    );
    log('INFO', 'pipeline', `Full pipeline started for page ${selectedId}: Research → Planning → Design`);
    fetch(`/api/pages/${selectedId}/design?pipeline=full`, { method: 'POST' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setPipelineRunId(data.runId);
          pipelineRunMapRef.current[selectedId] = data.runId;
        } else {
          const data = await r.json().catch(() => ({ error: 'Pipeline failed' }));
          showToast(data.error ?? 'Full pipeline failed');
          refreshPage(selectedId);
        }
      })
      .catch(() => {
        showToast('Network error — could not reach server');
        refreshPage(selectedId);
      });
  }, [selectedId, refreshPage, showToast, log]);

  const handlePipelineComplete = useCallback(() => {
    if (selectedId) {
      delete pipelineRunMapRef.current[selectedId];
      refreshPage(selectedId);
      setPipelineRunId(null);
    }
  }, [selectedId, refreshPage]);

  const handleApprove = useCallback(() => {
    if (!selectedId) return;
    refreshPage(selectedId);
  }, [selectedId, refreshPage]);

  // Add a feedback tag for the selected node
  const handleAddTag = useCallback(
    (tag: { nodeId: string; feedback: string; status: string }) => {
      setTags((prev) => [...prev, tag]);
    },
    [],
  );

  // Submit all pending feedback tags to the correction endpoint
  const handleSubmitFeedback = useCallback(async () => {
    if (!selectedId) return;

    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved property changes that will be lost after correction. Continue?')) return;
    }

    const pendingTags = tags.filter((t) => t.status === 'pending');
    if (pendingTags.length === 0) return;

    setCorrecting(true);
    setCorrectionError(null);

    try {
      const res = await fetch(`/api/pages/${selectedId}/design/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: pendingTags.map((t) => ({ nodeId: t.nodeId, feedback: t.feedback })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Clear tags on success
        setTags([]);
        setIteration(data.iteration ?? iteration + 1);

        // Refresh page data and reload spec
        await refreshPage(selectedId);

        // Re-fetch spec bundle and reload in iframe
        try {
          const specRes = await fetch(`/api/pages/${selectedId}/design/spec?bundle=true`);
          if (specRes.ok) {
            const bundle = await specRes.json();
            const spec = bundle.spec ?? bundle;
            setDesignSpec(spec);
            if (bundle.tokens) setRendererData({ tokens: bundle.tokens, catalog: bundle.catalog });
            setHasUnsavedChanges(false);
            sendSpecToBridge(spec);
          }
        } catch {
          // Spec reload failure is non-critical
        }

        // Re-fetch design metadata
        try {
          const metaRes = await fetch(`/api/pages/${selectedId}/design`);
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            setScore(metaData.score ?? null);
            setIteration(metaData.correctionIteration ?? 0);
          }
        } catch {
          // Metadata reload failure is non-critical
        }
      } else {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        setCorrectionError(errData.error ?? `Correction failed (${res.status})`);
        // Mark tags as failed
        setTags((prev) =>
          prev.map((t) => (t.status === 'pending' ? { ...t, status: 'failed' } : t)),
        );
      }
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Network error');
      setTags((prev) =>
        prev.map((t) => (t.status === 'pending' ? { ...t, status: 'failed' } : t)),
      );
    } finally {
      setCorrecting(false);
    }
  }, [selectedId, tags, iteration, refreshPage, hasUnsavedChanges]);

  // onLog callback for DesignCanvas → forwards to log store
  const handleCanvasLog = useCallback(
    (level: string, source: string, message: string) => {
      const safeLevel = (['INFO', 'WARN', 'ERROR', 'REQ', 'BRIDGE'].includes(level) ? level : 'INFO') as any;
      const safeSource = (['registry', 'studio', 'canvas', 'bridge', 'renderer'].includes(source) ? source : 'canvas') as any;
      log(safeLevel, safeSource, message);
    },
    [log],
  );

  const selectedPage = pages.find((p) => p.id === selectedId) ?? null;
  const hasPendingTags = tags.some((t) => t.status === 'pending');
  const canSubmitFeedback = hasPendingTags && !correcting && iteration < MAX_ITERATIONS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        Loading design studio...
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] -m-6">
        <div className="max-w-md rounded-xl border border-border bg-bg-card p-8 text-center">
          <h2 className="text-lg font-semibold text-text-primary">Generate a spec first</h2>
          <p className="text-sm text-text-muted mt-2">
            The Design Studio needs page definitions to work with. Generate your app spec to get started.
          </p>
          <button
            onClick={() => router.push('/spec?generate=true')}
            className="mt-6 rounded-md bg-accent-blue px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
          >
            Go to Spec
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-6 overflow-hidden">
      {/* Coherence toolbar */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-card/50 px-4 py-2 flex-shrink-0">
        <Button
          variant="secondary"
          size="sm"
          disabled={approvedCount < 2 || coherenceLoading}
          onClick={handleCheckCoherence}
        >
          {coherenceLoading ? 'Checking...' : 'Check Coherence'}
        </Button>
        <span className="text-xs text-text-muted">
          {approvedCount < 2
            ? `Need 2+ designed pages (${approvedCount} available)`
            : `${approvedCount} designed pages`}
        </span>
      </div>

      <CoherenceResultsModal
        open={showCoherenceModal}
        onClose={() => setShowCoherenceModal(false)}
        results={coherenceResults}
        warnings={coherenceWarnings}
        onSelectPage={(id) => {
          setShowCoherenceModal(false);
          handleSelect(id);
        }}
      />

      {/* Pipeline choice modal */}
      {showPipelineChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-sidebar p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-1">Generate Design</h2>
            <p className="text-sm text-text-muted mb-5">Choose a generation method:</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleQuickGenerate}
                className="flex flex-col items-start rounded-lg border border-border p-4 text-left hover:bg-bg-elevated/30 transition-colors"
              >
                <span className="text-sm font-medium text-text-primary">Quick Generate</span>
                <span className="text-xs text-text-muted mt-0.5">Single LLM call for fast results (~30s)</span>
              </button>
              <button
                onClick={handleFullPipeline}
                className="flex flex-col items-start rounded-lg border border-accent-blue/50 bg-accent-blue/5 p-4 text-left hover:bg-accent-blue/10 transition-colors"
              >
                <span className="text-sm font-medium text-text-primary">Full Pipeline</span>
                <span className="text-xs text-text-muted mt-0.5">
                  Research → Planning → Design (3 stages, ~2min, higher quality)
                </span>
              </button>
            </div>
            <button
              onClick={() => setShowPipelineChoice(false)}
              className="mt-4 w-full rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-elevated/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden px-6">
      {/* Left panel: Page Registry (200px) */}
      <div className="w-[200px] flex-shrink-0 border-r border-border bg-bg-card/30">
        <PageRegistry
          pages={pages}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>

      {/* Center panel: Design Canvas or Pipeline Progress */}
      <div className="flex-1 min-w-0 bg-bg-base">
        {pipelineRunId ? (
          <PipelineProgress
            runId={pipelineRunId}
            onComplete={handlePipelineComplete}
          />
        ) : (
        <DesignCanvas
          page={selectedPage}
          pageCount={pages.length}
          projectName={projectName}
          onGenerateDesign={handleGenerateDesign}
          onApprove={handleApprove}
          onNodeClicked={handleNodeClicked}
          onSaveSpec={handleSaveSpec}
          onSubmitFeedback={handleSubmitFeedback}
          canSubmitFeedback={canSubmitFeedback}
          correcting={correcting}
          correctionError={correctionError}
          iteration={iteration}
          maxIterations={MAX_ITERATIONS}
          onBridgeReady={handleBridgeReady}
          hasUnsavedChanges={hasUnsavedChanges}
          onRevertSpec={handleRevertSpec}
          designSpec={designSpec}
          rendererData={rendererData}
          onLog={handleCanvasLog}
        />
        )}
      </div>

      {/* Right panel: Inspector */}
      <div className="w-[260px] flex-shrink-0 border-l border-border overflow-hidden">
        <DesignInspector
          selectedNode={selectedNode}
          designSpec={designSpec}
          tags={tags}
          score={score}
          iteration={iteration}
          maxIterations={MAX_ITERATIONS}
          colorMap={colorMap}
          onPropertyChange={handlePropertyChange}
          onRevertNode={handleRevertNode}
          onAddTag={handleAddTag}
          onChatSubmit={(msg) => console.log('[DesignStudio] Chat:', msg)}
        />
      </div>
      </div>

      {/* Log panel */}
      <DesignLogPanel />

      {/* Toast notification */}
      {toastMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-lg px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-sm animate-fade-toast pointer-events-none ${
          toastMsg.type === 'success'
            ? 'bg-emerald-900/80 text-emerald-200'
            : 'bg-red-900/80 text-red-200'
        }`}>
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}
