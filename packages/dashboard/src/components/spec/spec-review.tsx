'use client';

import { useState } from 'react';

interface PageSpec {
  id: string;
  name: string;
  route: string;
  description: string;
  components: string[];
  data_sources: string[];
}

interface ModelSpec {
  id: string;
  name: string;
  fields: Array<{ name: string; type: string; required?: boolean }>;
}

interface EndpointSpec {
  method: string;
  path: string;
  description: string;
}

export interface GeneratedSpec {
  pages: PageSpec[];
  models: ModelSpec[];
  endpoints: EndpointSpec[];
}

interface SpecReviewProps {
  spec: GeneratedSpec;
  onApprove: (spec: GeneratedSpec) => void;
  onRegenerate: () => void;
  approving?: boolean;
}

export function SpecReview({ spec, onApprove, onRegenerate, approving = false }: SpecReviewProps) {
  const [activeTab, setActiveTab] = useState<'pages' | 'models' | 'endpoints'>('pages');
  const [editedSpec] = useState<GeneratedSpec>(spec);

  const tabs = [
    { key: 'pages' as const, label: 'Pages', count: editedSpec.pages.length },
    { key: 'models' as const, label: 'Models', count: editedSpec.models.length },
    { key: 'endpoints' as const, label: 'Endpoints', count: editedSpec.endpoints.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent-blue text-accent-blue'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded-full">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Pages tab */}
      {activeTab === 'pages' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {editedSpec.pages.map((page, idx) => (
            <div key={page.id || idx} className="rounded-lg border border-border bg-bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text-primary">{page.name}</h3>
                <span className="text-[10px] text-text-muted font-mono bg-bg-elevated px-2 py-0.5 rounded">
                  {page.route}
                </span>
              </div>
              <p className="text-xs text-text-secondary mb-3">{page.description}</p>
              {page.components.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-text-muted font-medium">Components:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {page.components.map((c) => (
                      <span key={c} className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {page.data_sources.length > 0 && (
                <div>
                  <span className="text-[10px] text-text-muted font-medium">Data sources:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {page.data_sources.map((d) => (
                      <span key={d} className="text-[10px] bg-accent-green/10 text-accent-green px-2 py-0.5 rounded">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Models tab */}
      {activeTab === 'models' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {editedSpec.models.map((model, idx) => (
            <div key={model.id || idx} className="rounded-lg border border-border bg-bg-card p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">{model.name}</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-muted border-b border-border">
                    <th className="text-left py-1 font-medium">Field</th>
                    <th className="text-left py-1 font-medium">Type</th>
                    <th className="text-left py-1 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {model.fields.map((field) => (
                    <tr key={field.name} className="border-b border-border/30">
                      <td className="py-1.5 text-text-primary font-mono">{field.name}</td>
                      <td className="py-1.5 text-text-secondary">{field.type}</td>
                      <td className="py-1.5 text-text-muted">{field.required ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Endpoints tab */}
      {activeTab === 'endpoints' && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted bg-bg-elevated border-b border-border">
                <th className="text-left px-4 py-2 font-medium w-20">Method</th>
                <th className="text-left px-4 py-2 font-medium">Path</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {editedSpec.endpoints.map((ep, idx) => {
                const methodColors: Record<string, string> = {
                  GET: 'text-accent-green',
                  POST: 'text-accent-blue',
                  PUT: 'text-accent-yellow',
                  PATCH: 'text-accent-yellow',
                  DELETE: 'text-red-400',
                };
                return (
                  <tr key={idx} className="border-b border-border/30 hover:bg-bg-elevated/30">
                    <td className={`px-4 py-2 font-mono font-bold ${methodColors[ep.method] ?? 'text-text-primary'}`}>
                      {ep.method}
                    </td>
                    <td className="px-4 py-2 font-mono text-text-primary">{ep.path}</td>
                    <td className="px-4 py-2 text-text-secondary">{ep.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onRegenerate}
          disabled={approving}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-elevated/50 transition-colors disabled:opacity-40"
        >
          Regenerate
        </button>
        <button
          onClick={() => onApprove(editedSpec)}
          disabled={approving}
          className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent-blue/90 transition-colors"
        >
          {approving ? 'Approving...' : 'Approve & Write YAML'}
        </button>
      </div>
    </div>
  );
}
