'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { SpecTree } from '@/components/spec/spec-tree';
import { YamlViewer } from '@/components/spec/yaml-viewer';
import { StatusBadge } from '@/components/spec/status-badge';
import { DriftBadge } from '@/components/spec/drift-badge';
import { CreatePageModal } from '@/components/pages/create-page-modal';
import { LogEntry, type LogLevel } from '@/components/live-monitor/log-entry';

interface SpecTreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: SpecTreeNode[];
}

interface ApiLogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

function apiLevelToLogLevel(level: ApiLogEntry['level']): LogLevel {
  const map: Record<string, LogLevel> = { info: 'INFO', warn: 'WARN', error: 'ERROR' };
  return map[level] ?? 'INFO';
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/** Flatten the API tree response into the format SpecTree expects. */
function flattenApiTree(
  apiFiles: Array<{ name: string; type: string; children?: Array<Record<string, unknown>> }>,
): SpecTreeNode[] {
  return apiFiles.map((f) => ({
    name: f.name,
    type: f.type === 'folder' ? 'folder' : 'file',
    children: f.children
      ? flattenApiTree(f.children as Array<{ name: string; type: string; children?: Array<Record<string, unknown>> }>)
      : undefined,
  }));
}

/** Extract the first file name from a tree for default selection. */
function firstFileName(nodes: SpecTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'file') return node.name;
    if (node.children) {
      const found = firstFileName(node.children);
      if (found) return found;
    }
  }
  return null;
}

export default function SpecPage() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>}
    >
      <SpecPageContent />
    </Suspense>
  );
}

function SpecPageContent() {
  const searchParams = useSearchParams();

  const [specTree, setSpecTree] = useState<SpecTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genLogs, setGenLogs] = useState<ApiLogEntry[]>([]);
  const autoTriggered = useRef(false);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch('/api/spec');
      const json = await res.json();
      const files = json.files ?? [];
      const tree = flattenApiTree(files);
      setSpecTree(tree);
      return tree;
    } catch {
      setSpecTree([]);
      return [];
    }
  }, []);

  // Fetch the spec file tree on mount
  useEffect(() => {
    fetchTree().then((tree) => {
      const first = firstFileName(tree);
      if (first) setSelectedFile(first);
      setTreeLoading(false);
    });
  }, [fetchTree]);

  const fetchSpec = useCallback((filename: string) => {
    if (!filename) return;
    setLoading(true);
    const specPath = filename.replace(/\.ya?ml$/, '');
    fetch(`/api/spec/${specPath}`)
      .then(res => res.json())
      .then(json => {
        if (json.content) {
          setContent(json.content);
        } else if (json.error) {
          setContent(`# ${json.error}\n# Available paths: ${(json.availablePaths ?? []).join(', ')}`);
        } else {
          setContent(JSON.stringify(json, null, 2));
        }
        setLoading(false);
      })
      .catch(() => {
        setContent('# Error loading spec file');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedFile) fetchSpec(selectedFile);
  }, [selectedFile, fetchSpec]);

  const handleSelectFile = (filename: string) => {
    setSelectedFile(filename);
  };

  const handleSave = useCallback(async (newContent: string) => {
    if (!selectedFile) return;
    setSaving(true);
    const specPath = selectedFile.replace(/\.ya?ml$/, '');
    try {
      const res = await fetch(`/api/spec/${specPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.ok) {
        setContent(newContent);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [selectedFile]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    setGenLogs([]);

    try {
      const res = await fetch('/api/spec/generate', { method: 'POST' });
      const data = await res.json();

      if (data.logs) setGenLogs(data.logs);

      if (!res.ok) {
        throw new Error(data.error ?? 'Spec generation failed');
      }

      // Auto-approve: write the spec files
      const spec = data.spec;
      if (spec) {
        const approveRes = await fetch('/api/spec/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spec),
        });
        if (!approveRes.ok) {
          const approveData = await approveRes.json();
          throw new Error(approveData.error ?? 'Spec approval failed');
        }
      }

      // Re-fetch tree and select pages.yaml
      const tree = await fetchTree();
      const pagesFile = firstFileName(tree);
      if (pagesFile) setSelectedFile(pagesFile);

      setGenerating(false);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Unknown error');
      setGenerating(false);
    }
  }, [fetchTree]);

  // Auto-trigger generation when ?generate=true
  useEffect(() => {
    if (searchParams.get('generate') === 'true' && !autoTriggered.current && !generating) {
      autoTriggered.current = true;
      handleGenerate();
    }
  }, [searchParams, generating, handleGenerate]);

  if (treeLoading) {
    return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-white">Spec Viewer</h1>
          <p className="text-sm text-gray-400">Browse, generate, and edit project specifications</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="generate-spec-btn"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-blue/80 disabled:opacity-40"
          >
            {generating ? 'Generating...' : 'Generate Spec'}
          </button>
          <button
            type="button"
            data-testid="spec-new-page"
            onClick={() => setShowCreatePage(true)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5"
          >
            + New Page
          </button>
          {selectedFile && <StatusBadge status="specced" />}
          <DriftBadge hasDrift={false} />
        </div>
      </div>

      <CreatePageModal open={showCreatePage} onClose={() => setShowCreatePage(false)} />

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <SpecTree selectedFile={selectedFile} onSelectFile={handleSelectFile} tree={specTree} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-4">
            {generating ? (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent-blue animate-pulse" />
                  <span className="text-sm font-medium text-text-primary">Generating specification...</span>
                </div>
              </div>
            ) : genError ? (
              <div className="flex flex-col items-center justify-center h-64">
                <h2 className="text-base font-semibold text-red-400">Generation failed</h2>
                <p className="text-sm text-text-muted mt-1 max-w-md text-center">{genError}</p>
                <button
                  onClick={handleGenerate}
                  className="mt-4 rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : specTree.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-text-muted">No spec files found</div>
            ) : loading ? (
              <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>
            ) : (
              <YamlViewer
                content={content}
                filename={selectedFile}
                editable
                onSave={handleSave}
                saving={saving}
              />
            )}
          </div>

          {/* Log panel */}
          {genLogs.length > 0 && <SpecLogPanel logs={genLogs} />}
        </div>
      </div>
    </div>
  );
}

function SpecLogPanel({ logs }: { logs: ApiLogEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, expanded]);

  return (
    <div data-testid="spec-log-panel" className="border-t border-border bg-bg-card/50 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span
            className="transition-transform"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            &#9650;
          </span>
          Logs ({logs.length})
        </span>
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-[200px] overflow-y-auto bg-[#0b0e14] px-4 py-2"
        >
          {logs.map((entry, i) => (
            <LogEntry
              key={i}
              timestamp={formatTs(entry.ts)}
              level={apiLevelToLogLevel(entry.level)}
              message={entry.message}
            />
          ))}
        </div>
      )}
    </div>
  );
}
