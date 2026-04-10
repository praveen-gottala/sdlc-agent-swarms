'use client';

import React from 'react';
import { Badge, type BadgeVariant } from '../ui/badge';
import { Button } from '../ui/button';

export interface Page {
  id: string;
  name: string;
  description?: string;
  status?: string;
  designStatus?: string;
  components?: string[];
}

export interface PageRegistryProps {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}

const statusBadgeConfig: Record<string, { label: string; variant: BadgeVariant; pulse?: boolean }> = {
  draft: { label: 'Draft', variant: 'default' },
  generating: { label: 'Generating', variant: 'info', pulse: true },
  rendered: { label: 'Rendered', variant: 'warning' },
  correction: { label: 'Correction', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  locked: { label: 'Locked', variant: 'purple' },
};

function PageStatusBadge({ designStatus, specStatus }: { designStatus: string; specStatus?: string }) {
  // If design pipeline has been touched (not draft), show designStatus
  if (designStatus && designStatus !== 'draft') {
    const config = statusBadgeConfig[designStatus] ?? { label: designStatus, variant: 'default' as BadgeVariant };
    return (
      <Badge variant={config.variant} className={config.pulse ? 'animate-pulse' : ''}>
        {config.label}
      </Badge>
    );
  }

  // Derive from spec status when design is still draft
  if (specStatus === 'approved') {
    return <Badge variant="info">Ready to design</Badge>;
  }
  if (specStatus === 'requested' || specStatus === 'draft') {
    return <Badge variant="default">Spec pending</Badge>;
  }

  // Fallback
  const config = statusBadgeConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Left-panel page registry listing all pages with their design status.
 * Allows selecting a page and creating new ones.
 */
export function PageRegistry({ pages, selectedId, onSelect, onCreateNew }: PageRegistryProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Pages</h2>
        <p className="text-xs text-text-muted mt-0.5">{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
        {pages.map((page) => {
          const isSelected = page.id === selectedId;
          return (
            <button
              key={page.id}
              data-testid={`page-${page.id}`}
              onClick={() => onSelect(page.id)}
              className={[
                'w-full text-left rounded-md px-3 py-2.5 transition-colors',
                isSelected
                  ? 'bg-accent-blue/15 border border-accent-blue/40'
                  : 'hover:bg-bg-elevated border border-transparent',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">{page.name}</span>
                <PageStatusBadge designStatus={page.designStatus ?? 'draft'} specStatus={page.status} />
              </div>
              {page.description && (
                <p className="text-xs text-text-muted mt-1 line-clamp-2">{page.description}</p>
              )}
              {page.components && page.components.length > 0 && (
                <p className="text-xs text-text-muted mt-0.5">{page.components.length} component{page.components.length !== 1 ? 's' : ''}</p>
              )}
            </button>
          );
        })}

        {pages.length === 0 && (
          <div className="text-center py-8 text-text-muted text-xs">
            No pages yet. Create one to get started.
          </div>
        )}
      </div>

      <div className="px-3 py-3 border-t border-border">
        <Button variant="secondary" size="sm" className="w-full" data-testid="create-page-btn" onClick={onCreateNew}>
          + New page
        </Button>
      </div>
    </div>
  );
}
