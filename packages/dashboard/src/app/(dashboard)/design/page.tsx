'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageRegistry, type Page } from '@/components/design/page-registry';
import { DesignCanvas } from '@/components/design/design-canvas';
import { DesignInspector } from '@/components/design/design-inspector';
import { useRendererBridge, type UseRendererBridgeResult } from '@/lib/hooks/use-renderer-bridge';
import { propertyToCss } from '@/lib/design/property-to-css';
import { Button } from '@/components/ui/button';
import { CoherenceResultsModal } from '@/components/design/coherence-results-modal';
import { PipelineProgress } from '@/components/design/pipeline-progress';
import type { CoherenceResult } from '@/lib/design/coherence-check';
import { DesignLogProvider, useDesignLog } from '@/lib/hooks/use-design-log';
import { DesignLogPanel } from '@/components/design/design-log-panel';
import { NavigationEditor } from '@/components/design/navigation-editor';

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

  // Model selection for design generation
  const DESIGN_MODELS = [
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Best cost/quality balance' },
    { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Highest quality, 5x cost' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5', description: 'Fastest, lowest cost' },
  ] as const;
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-6');

  // Coherence check state
  const [coherenceResults, setCoherenceResults] = useState<CoherenceResult[]>([]);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);
  const [coherenceLoading, setCoherenceLoading] = useState(false);
  const [showCoherenceModal, setShowCoherenceModal] = useState(false);

  // Audit state
  const [mechanicalAudit, setMechanicalAudit] = useState<import('@/lib/design/audit-types').MechanicalAuditResult | null>(null);
  const [mechanicalAuditLoading, setMechanicalAuditLoading] = useState(false);
  const [visionAudit, setVisionAudit] = useState<import('@/lib/design/audit-types').VisionAuditResult | null>(null);
  const [visionAuditLoading, setVisionAuditLoading] = useState(false);
  const [visionAuditAvailable, setVisionAuditAvailable] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'ai-edits' | 'chat' | 'audit' | undefined>(undefined);

  // Prototype mode state
  const [prototypeMode, setPrototypeMode] = useState(false);
  const [prototypeLoading, setPrototypeLoading] = useState(false);
  const [prototypePayload, setPrototypePayload] = useState<string | null>(null);
  const [showNavEditor, setShowNavEditor] = useState(false);
  const [prototypeScreens, setPrototypeScreens] = useState<{ id: string; name: string; screenType?: 'page' | 'modal' | 'drawer' | 'sheet' }[]>([]);
  const [activeProtoScreen, setActiveProtoScreen] = useState<string | null>(null);
  const [pickedNode, setPickedNode] = useState<{ nodeId: string; catalogType: string | null } | null>(null);
  const [protoKey, setProtoKey] = useState(0);
  const protoSpecsRef = useRef<Record<string, Record<string, unknown>>>({});

  const approvedCount = pages.filter(
    (p) => p.designStatus === 'approved' || p.designStatus === 'rendered',
  ).length;

  const handleLoadPrototype = useCallback(async () => {
    setPrototypeLoading(true);
    try {
      // Prototype iframe loads http://localhost:4100 — wait until Vite actually serves HTML.
      await fetch('/api/renderer/start', { method: 'POST' }).catch(() => {});
      const rendererDeadline = Date.now() + 90_000;
      while (Date.now() < rendererDeadline) {
        const stRes = await fetch('/api/renderer/status');
        const st = await stRes.json().catch(() => ({}));
        if (st.status === 'ready') {
          break;
        }
        if (st.status === 'stopped' && st.error) {
          showToast(`Design renderer: ${st.error}`, 'error');
          return;
        }
        await new Promise(r => setTimeout(r, 400));
      }
      const finalStatus = await fetch('/api/renderer/status').then(r => r.json()).catch(() => ({}));
      if (finalStatus.status !== 'ready') {
        showToast(
          'Design renderer on port 4100 is not ready. Start it from the repo: npm run dev in packages/designspec-renderer/src/renderer/browser/app — or reload this page to retry auto-start.',
          'error',
        );
        return;
      }

      const res = await fetch('/api/prototype');
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to load prototype' }));
        showToast(data.error ?? 'No prototype available', 'error');
        return;
      }
      const data = await res.json();
      const payload = JSON.stringify({
        manifest: data.manifest,
        specs: data.specs,
        tokens: data.tokens,
        catalog: data.catalog,
        chromeSpec: data.chromeSpec ?? null,
      });
      setPrototypePayload(payload);
      setPrototypeScreens(
        (data.manifest.screens as Array<{ screenId: string; name: string; screenType?: 'page' | 'modal' | 'drawer' | 'sheet' }>)
          .map(s => ({ id: s.screenId, name: s.name, screenType: s.screenType })),
      );
      setActiveProtoScreen(
        (data.manifest.screens as Array<{ screenId: string; isDefault?: boolean }>)
          .find(s => s.isDefault)?.screenId ?? data.manifest.screens[0]?.screenId ?? null,
      );
      protoSpecsRef.current = data.specs as Record<string, Record<string, unknown>>;
      bridgeRef.current = null;
      setPrototypeMode(true);
      setSelectedNode(null);
      log('INFO', 'studio', `Prototype loaded: ${data.manifest.screens.length} screens`);
    } catch {
      showToast('Failed to load prototype', 'error');
    } finally {
      setPrototypeLoading(false);
    }
  }, [showToast, log]);

  const handleExitPrototype = useCallback(() => {
    setPrototypeMode(false);
    setPrototypePayload(null);
    setShowNavEditor(false);
    bridgeRef.current = null;
    if (selectedId && designSpec) {
      const rd = rendererDataRef.current;
      const payload = rd ? { spec: designSpec, tokens: rd.tokens, catalog: rd.catalog } : designSpec;
      setTimeout(() => bridgeRef.current?.loadSpec(JSON.stringify(payload)), 500);
    }
  }, [selectedId, designSpec]);

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

  // ── Audit handlers ──────────────────────────────────────
  const handleRunMechanicalAudit = useCallback(async () => {
    if (!designSpec || !bridgeRef.current) return;
    setInspectorTab('audit');
    setMechanicalAuditLoading(true);
    setMechanicalAudit(null);
    try {
      const rawDom = await bridgeRef.current.extractDOM();
      const res = await fetch('/api/design/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selectedId, domData: rawDom }),
      });
      if (!res.ok) throw new Error(`Audit failed: ${res.status}`);
      const data = await res.json();
      setMechanicalAudit({
        reports: data.reports,
        mechanicalIssues: data.mechIssues,
        summary: data.summary,
      });
    } catch (err) {
      console.error('Mechanical audit failed:', err);
    } finally {
      setMechanicalAuditLoading(false);
    }
  }, [designSpec]);

  const handleRunVisionAudit = useCallback(async () => {
    if (!selectedId) return;
    setVisionAuditLoading(true);
    setVisionAudit(null);
    try {
      const res = await fetch('/api/design/audit/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selectedId }),
      });
      if (res.ok) {
        setVisionAudit(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: 'Vision audit failed' }));
        console.error('Vision audit error:', err.error);
      }
    } catch (err) {
      console.error('Vision audit request failed:', err);
    } finally {
      setVisionAuditLoading(false);
    }
  }, [selectedId]);

  // Check vision audit auth availability on mount
  useEffect(() => {
    fetch('/api/design/audit/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: '__auth_check__' }),
    }).then(res => {
      setVisionAuditAvailable(res.status !== 503);
    }).catch(() => setVisionAuditAvailable(false));
  }, []);

  // Fetch pages and project name on mount.
  // Also pre-warm the design renderer so it's ready by the time the user
  // clicks a rendered page. The start call is idempotent (returns
  // 'already_running' if the process is up).
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

    // Pre-warm renderer: start Vite dev server while the user browses
    // the page registry. By the time they click a rendered page, the
    // renderer is already compiled and serving on port 4100.
    // Handles stale processes from previous sessions (restart needed).
    fetch('/api/renderer/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'ready') return; // already running
        if (data.status === 'stale') {
          // Orphan from previous session — kill and restart
          return fetch('/api/renderer/restart', { method: 'POST' });
        }
        if (data.status === 'stopped') {
          return fetch('/api/renderer/start', { method: 'POST' });
        }
        // 'starting' — already in progress, nothing to do
      })
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
        const res = await fetch(`/api/pages/${pageId}`, { cache: 'no-store' });
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

  // Fetch design spec when a page is selected with rendered/correction/approved status.
  // Only re-fetches when selectedId or the selected page's designStatus changes —
  // NOT on every pages array re-render.
  const selectedDesignStatus = pages.find((p) => p.id === selectedId)?.designStatus ?? 'draft';
  useEffect(() => {
    if (!selectedId) { setDesignSpec(null); setMechanicalAudit(null); setVisionAudit(null); return; }
    if (!['rendered', 'correction', 'approved'].includes(selectedDesignStatus)) { setDesignSpec(null); setMechanicalAudit(null); setVisionAudit(null); return; }
    setMechanicalAudit(null);
    setVisionAudit(null);

    const controller = new AbortController();

    log('REQ', 'studio', `Fetching design spec bundle for page ${selectedId}`);
    fetch(`/api/pages/${selectedId}/design/spec?bundle=true&t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        log('ERROR', 'studio', `Failed to fetch design spec: ${err instanceof Error ? err.message : 'unknown'}`);
        setDesignSpec(null);
        savedDesignSpecRef.current = null;
      });

    // Also fetch design metadata for score/iteration
    fetch(`/api/pages/${selectedId}/design`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) {
          setScore(data.score ?? null);
          setIteration(data.correctionIteration ?? 0);
        }
      })
      .catch(() => {});

    return () => controller.abort();
    // Only re-fetch when page selection or its design status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedDesignStatus]);

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
        const key = parts[parts.length - 1];
        if (value === undefined || value === null) {
          delete target[key];
        } else {
          const numericFields = new Set(['width', 'height', 'gap', 'px', 'py', 'pt', 'pb', 'pl', 'pr']);
          if (numericFields.has(key) && typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
            target[key] = Number(value);
          } else {
            target[key] = value;
          }
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

  const prototypeModeRef = useRef(false);
  prototypeModeRef.current = prototypeMode;

  const sendSpecToBridge = useCallback((spec: any) => {
    if (prototypeModeRef.current) return;
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

  // Send prototype payload to iframe when bridge is ready in prototype mode
  // protoKey increments on save to force re-send even with same payload
  useEffect(() => {
    if (!prototypeMode || !prototypePayload) return;
    const sendPayload = () => {
      if (bridgeRef.current?.isReady) {
        bridgeRef.current.loadPrototype(prototypePayload);
        return true;
      }
      return false;
    };
    if (sendPayload()) return;
    const interval = setInterval(() => {
      if (sendPayload()) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [prototypeMode, prototypePayload, protoKey]);

  const handleGenerateDesign = useCallback(() => {
    if (!selectedId) return;
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Regenerating will overwrite them. Continue?')) return;
    }
    setShowPipelineChoice(true);
  }, [selectedId, hasUnsavedChanges]);

  const handleQuickGenerate = useCallback(() => {
    if (!selectedId) return;
    log('INFO', 'studio', `Quick generate started for page ${selectedId} (model: ${selectedModel})`);
    setShowPipelineChoice(false);
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, designStatus: 'generating' } : p,
      ),
    );
    fetch(`/api/pages/${selectedId}/design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel }),
    })
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
  }, [selectedId, selectedModel, refreshPage, showToast, log]);

  const handleFullPipeline = useCallback(() => {
    if (!selectedId) return;
    setShowPipelineChoice(false);
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, designStatus: 'generating' } : p,
      ),
    );
    log('INFO', 'pipeline', `Full pipeline started for page ${selectedId} (model: ${selectedModel}): Research → Planning → Design`);
    fetch(`/api/pages/${selectedId}/design?pipeline=full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel }),
    })
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
  }, [selectedId, selectedModel, refreshPage, showToast, log]);

  const handlePipelineComplete = useCallback(() => {
    if (selectedId) {
      delete pipelineRunMapRef.current[selectedId];
      refreshPage(selectedId);
      setPipelineRunId(null);
    }
  }, [selectedId, refreshPage]);

  const handlePipelineRetry = useCallback(() => {
    if (!selectedId) return;
    delete pipelineRunMapRef.current[selectedId];
    setPipelineRunId(null);
    handleFullPipeline();
  }, [selectedId, handleFullPipeline]);

  const handlePipelineDismiss = useCallback(() => {
    if (!selectedId) return;
    delete pipelineRunMapRef.current[selectedId];
    setPipelineRunId(null);
    refreshPage(selectedId);
  }, [selectedId, refreshPage]);

  const handleChatSubmit = useCallback(async (message: string) => {
    if (!selectedId) return;
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, designStatus: 'generating' } : p,
      ),
    );
    log('INFO', 'chat', `Chat iteration started for page ${selectedId}: "${message.slice(0, 80)}"`);
    try {
      const res = await fetch(`/api/pages/${selectedId}/design/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model: selectedModel }),
      });
      if (res.ok) {
        const data = await res.json();
        setPipelineRunId(data.runId);
        pipelineRunMapRef.current[selectedId] = data.runId;
      } else {
        const data = await res.json().catch(() => ({ error: 'Chat pipeline failed' }));
        showToast(data.error ?? 'Chat pipeline failed');
        refreshPage(selectedId);
      }
    } catch {
      showToast('Network error — could not reach server');
      refreshPage(selectedId);
    }
  }, [selectedId, selectedModel, refreshPage, showToast, log]);

  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllProgress, setGenAllProgress] = useState<{ current: number; total: number } | null>(null);

  const handleGenerateAll = useCallback(async () => {
    const pendingPages = pages.filter(p => p.designStatus !== 'rendered' && p.designStatus !== 'approved');
    if (pendingPages.length === 0) return;
    setGeneratingAll(true);
    setGenAllProgress({ current: 0, total: pendingPages.length });
    log('INFO', 'studio', `Generating designs for ${pendingPages.length} pages (model: ${selectedModel})`);

    for (let i = 0; i < pendingPages.length; i++) {
      const pg = pendingPages[i];
      setGenAllProgress({ current: i + 1, total: pendingPages.length });
      setPages(prev => prev.map(p => p.id === pg.id ? { ...p, designStatus: 'generating' } : p));
      log('INFO', 'studio', `[${i + 1}/${pendingPages.length}] Generating design for "${pg.name}"...`);
      try {
        const res = await fetch(`/api/pages/${pg.id}/design?pipeline=full`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const runId = (data as Record<string, unknown>).runId as string | undefined;
          if (runId) {
            for (let poll = 0; poll < 120; poll++) {
              await new Promise(r => setTimeout(r, 3_000));
              const statusRes = await fetch(`/api/runs?limit=1`).then(r => r.json()).catch(() => null);
              const runs = (statusRes as Record<string, unknown>[] | null) ?? [];
              const run = Array.isArray(runs) ? runs.find((r: Record<string, unknown>) => r.runId === runId) : null;
              if (run && ((run as Record<string, unknown>).status === 'complete' || (run as Record<string, unknown>).status === 'failed')) break;
              refreshPage(pg.id);
            }
          }
          log('INFO', 'studio', `Design generated for "${pg.name}"`);
        } else {
          const data = await res.json().catch(() => ({ error: 'Unknown error' }));
          log('WARN', 'studio', `Design failed for "${pg.name}": ${(data as Record<string, unknown>).error}`);
        }
      } catch {
        log('WARN', 'studio', `Network error generating "${pg.name}"`);
      }
      refreshPage(pg.id);
    }

    setGeneratingAll(false);
    setGenAllProgress(null);
    log('INFO', 'studio', `Batch generation complete`);
  }, [pages, selectedModel, refreshPage, log]);

  const handleApprove = useCallback(async () => {
    if (!selectedId) return;
    await refreshPage(selectedId);
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
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border bg-bg-card/50 px-4 py-2 flex-shrink-0">
        {prototypeMode ? (
          <>
            <Button variant="secondary" size="sm" onClick={handleExitPrototype}>
              Exit Prototype
            </Button>
            <div className="w-px h-4 bg-border" />
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNavEditor(!showNavEditor)}
              >
                Navigation
              </Button>
              {showNavEditor && (
                <div className="absolute top-full left-0 mt-1 z-50 w-80 rounded-lg border border-border bg-sidebar shadow-xl">
                  <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
                    {prototypeScreens.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setActiveProtoScreen(s.id)}
                        className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                          activeProtoScreen === s.id
                            ? 'bg-accent-blue/10 text-accent-blue font-medium'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <NavigationEditor
                    pages={prototypeScreens}
                    activePageId={activeProtoScreen}
                    pickedNode={pickedNode}
                    onStartPicking={() => {
                      bridgeRef.current?.enableTagging();
                      bridgeRef.current?.onNodeClicked((nodeId, catalogType) => {
                        setPickedNode({ nodeId, catalogType });
                        for (const [screenId, spec] of Object.entries(protoSpecsRef.current)) {
                          const nodes = (spec as { nodes?: Record<string, unknown> }).nodes;
                          if (nodes && nodeId in nodes) {
                            setActiveProtoScreen(screenId);
                            break;
                          }
                        }
                      });
                    }}
                    onStopPicking={() => {
                      bridgeRef.current?.disableTagging();
                      bridgeRef.current?.onNodeClicked(null);
                      setPickedNode(null);
                    }}
                    onSaved={async () => {
                      try {
                        const res = await fetch('/api/prototype');
                        if (!res.ok) return;
                        const data = await res.json();
                        const payload = JSON.stringify({
                          manifest: data.manifest,
                          specs: data.specs,
                          tokens: data.tokens,
                          catalog: data.catalog,
                          chromeSpec: data.chromeSpec ?? null,
                        });
                        protoSpecsRef.current = data.specs as Record<string, Record<string, unknown>>;
                        setPrototypePayload(payload);
                        setProtoKey(k => k + 1);
                        log('INFO', 'studio', 'Prototype refreshed with updated navigation');
                      } catch {
                        // ignore
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <span className="text-xs text-text-muted">
              {prototypeScreens.length} screens
            </span>
            <span className="ml-auto text-xs font-medium text-accent-blue">
              Prototype Mode
            </span>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={approvedCount < 2 || prototypeLoading}
              onClick={handleLoadPrototype}
            >
              {prototypeLoading ? 'Loading...' : 'Prototype'}
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button
              variant="secondary"
              size="sm"
              disabled={approvedCount < 2 || coherenceLoading}
              onClick={handleCheckCoherence}
            >
              {coherenceLoading ? 'Checking...' : 'Check Coherence'}
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedId || !designSpec || mechanicalAuditLoading}
              onClick={handleRunMechanicalAudit}
            >
              {mechanicalAuditLoading ? 'Auditing...' : 'Audit'}
            </Button>
            {pages.some(p => p.designStatus !== 'rendered' && p.designStatus !== 'approved' && p.designStatus !== 'generating') && (
              <>
                <div className="w-px h-4 bg-border" />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={generatingAll}
                  onClick={handleGenerateAll}
                  data-testid="generate-all-designs"
                >
                  {generatingAll && genAllProgress
                    ? `Generating ${genAllProgress.current}/${genAllProgress.total}...`
                    : 'Generate All'}
                </Button>
              </>
            )}
            <span className="text-xs text-text-muted">
              {approvedCount < 2
                ? `Need 2+ designed pages (${approvedCount} available)`
                : `${approvedCount} designed pages`}
            </span>
          </>
        )}
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
            <p className="text-sm text-text-muted mb-4">Choose a model and generation method:</p>

            {/* Model selector */}
            <div className="mb-4">
              <label htmlFor="model-select" className="block text-xs font-medium text-text-secondary mb-1.5">
                Model
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
              >
                {DESIGN_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </div>

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
      {/* Left panel: Page Registry — hidden in prototype mode */}
      {!prototypeMode && (
      <div className="w-[200px] flex-shrink-0 border-r border-border bg-bg-card/30">
        <PageRegistry
          pages={pages}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>
      )}

      {/* Center panel */}
      <div className="flex-1 min-w-0 bg-bg-base">
        {prototypeMode ? (
          <PrototypeView onBridgeReady={handleBridgeReady} />
        ) : pipelineRunId ? (
          <PipelineProgress
            runId={pipelineRunId}
            model={selectedModel}
            onComplete={handlePipelineComplete}
            onRetry={handlePipelineRetry}
            onDismiss={handlePipelineDismiss}
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

      {/* Right panel: Inspector — hidden in prototype mode */}
      {!prototypeMode && (
      <div className="w-[260px] flex-shrink-0 border-l border-border overflow-hidden flex flex-col">
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
          onChatSubmit={handleChatSubmit}
          chatDisabled={!!pipelineRunId}
          activeTabOverride={inspectorTab}
          mechanicalAudit={mechanicalAudit}
          mechanicalAuditLoading={mechanicalAuditLoading}
          visionAudit={visionAudit}
          visionAuditLoading={visionAuditLoading}
          onRunVisionAudit={handleRunVisionAudit}
          visionAuditAvailable={visionAuditAvailable}
        />
      </div>
      )}
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

const RENDERER_URL = 'http://localhost:4100';

function PrototypeView({ onBridgeReady }: { onBridgeReady: (bridge: UseRendererBridgeResult) => void }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bridge = useRendererBridge(iframeRef);

  useEffect(() => {
    if (bridge.isReady) onBridgeReady(bridge);
  }, [bridge.isReady, onBridgeReady, bridge]);

  return (
    <div className="h-full relative">
      <iframe
        ref={iframeRef}
        src={RENDERER_URL}
        data-testid="prototype-iframe"
        title="Prototype Renderer"
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-full border-none"
      />
    </div>
  );
}
