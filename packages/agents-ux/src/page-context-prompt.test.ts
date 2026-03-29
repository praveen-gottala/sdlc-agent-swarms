/**
 * Unit tests for page-context-prompt utilities.
 */

import { formatPageContextPrompt, buildPageContext, resolvePageEntry } from './page-context-prompt.js';
import type { PageEntry, ModelEntry, EndpointEntry, PageContext } from '@agentforge/core';

// ============================================================================
// Fixtures
// ============================================================================

const BILL_ENTRY_PAGE: PageEntry = {
  id: 'bill-entry',
  name: 'Bill Entry',
  description: 'The primary input screen where users enter all bill details',
  route: '/',
  status: 'active',
  components: ['AppHeader', 'BillTotalInput', 'TipSegmentedControl', 'PersonList'],
  data_sources: ['BillState', 'PersonEntry'],
  viewports: [1440],
};

const SPLIT_BREAKDOWN_PAGE: PageEntry = {
  id: 'split-breakdown',
  name: 'Split Breakdown',
  description: 'The results screen showing each person\'s calculated share',
  route: '/breakdown',
  status: 'active',
  components: ['AppHeader', 'SplitResultCard', 'ShareButton'],
  data_sources: ['SplitResult'],
};

const SHARED_RESULT_PAGE: PageEntry = {
  id: 'shared-result',
  name: 'Shared Result',
  description: 'A read-only snapshot view',
  route: '/result',
  status: 'active',
  components: ['AppHeader', 'SplitResultCard'],
};

const ALL_PAGES: readonly PageEntry[] = [BILL_ENTRY_PAGE, SPLIT_BREAKDOWN_PAGE, SHARED_RESULT_PAGE];

const MODELS: readonly ModelEntry[] = [
  {
    id: 'BillState',
    name: 'BillState',
    fields: [
      { name: 'subtotal', type: 'number' },
      { name: 'tax_amount', type: 'number' },
      { name: 'tip_percent', type: 'number' },
    ],
    db_table: 'bill_states',
  },
  {
    id: 'PersonEntry',
    name: 'PersonEntry',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'sort_order', type: 'number' },
    ],
    db_table: 'person_entries',
  },
  {
    id: 'SplitResult',
    name: 'SplitResult',
    fields: [
      { name: 'person_name', type: 'string' },
      { name: 'amount', type: 'number' },
    ],
    db_table: 'split_results',
  },
];

const ENDPOINTS: readonly EndpointEntry[] = [
  {
    id: 'calculate',
    method: 'POST',
    path: '/api/calculate',
    query_params: [],
    response: { type: 'object', schema_ref: 'SplitResult[]' },
    auth: 'none',
    status: 'active',
  },
  {
    id: 'share',
    method: 'POST',
    path: '/api/share/encode',
    query_params: [],
    response: { type: 'string', schema_ref: 'BillState' },
    auth: 'none',
    status: 'active',
  },
];

// ============================================================================
// resolvePageEntry
// ============================================================================

describe('resolvePageEntry', () => {
  it('resolves by exact ID match', () => {
    const result = resolvePageEntry('bill-entry', ALL_PAGES);
    expect(result).toBe(BILL_ENTRY_PAGE);
  });

  it('resolves by case-insensitive name match', () => {
    const result = resolvePageEntry('Bill Entry', ALL_PAGES);
    expect(result).toBe(BILL_ENTRY_PAGE);
  });

  it('resolves by lowercase name match', () => {
    const result = resolvePageEntry('split breakdown', ALL_PAGES);
    expect(result).toBe(SPLIT_BREAKDOWN_PAGE);
  });

  it('returns undefined for unknown page', () => {
    const result = resolvePageEntry('nonexistent', ALL_PAGES);
    expect(result).toBeUndefined();
  });

  it('prefers ID match over name match', () => {
    // If a page ID happens to match another page's name (unlikely but test the priority)
    const result = resolvePageEntry('bill-entry', ALL_PAGES);
    expect(result?.id).toBe('bill-entry');
  });
});

// ============================================================================
// buildPageContext
// ============================================================================

describe('buildPageContext', () => {
  it('filters models to page data_sources', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);

    expect(ctx.targetPage).toBe(BILL_ENTRY_PAGE);
    expect(ctx.allPages).toBe(ALL_PAGES);
    // BillState and PersonEntry match data_sources
    expect(ctx.models).toHaveLength(2);
    expect(ctx.models?.map(m => m.id)).toEqual(['BillState', 'PersonEntry']);
  });

  it('filters API endpoints by schema_ref overlap with data_sources', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);

    // /api/share/encode has schema_ref 'BillState' which is in data_sources
    expect(ctx.apiEndpoints).toBeDefined();
    expect(ctx.apiEndpoints?.some(e => e.path === '/api/share/encode')).toBe(true);
  });

  it('returns undefined models/endpoints when page has no data_sources', () => {
    const ctx = buildPageContext(SHARED_RESULT_PAGE, ALL_PAGES, MODELS, ENDPOINTS);

    // SHARED_RESULT_PAGE has no data_sources
    expect(ctx.models).toBeUndefined();
    expect(ctx.apiEndpoints).toBeUndefined();
  });

  it('handles missing models and endpoints gracefully', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES);

    expect(ctx.models).toBeUndefined();
    expect(ctx.apiEndpoints).toBeUndefined();
  });
});

// ============================================================================
// formatPageContextPrompt
// ============================================================================

describe('formatPageContextPrompt', () => {
  it('includes target page details', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);
    const prompt = formatPageContextPrompt(ctx);

    expect(prompt).toContain('## Target Page: Bill Entry (/)');
    expect(prompt).toContain('AppHeader');
    expect(prompt).toContain('BillTotalInput');
    expect(prompt).toContain('Data Sources: BillState, PersonEntry');
  });

  it('includes all app screens with navigation context', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);
    const prompt = formatPageContextPrompt(ctx);

    expect(prompt).toContain('## All App Screens');
    expect(prompt).toContain('bill-entry (/)');
    expect(prompt).toContain('split-breakdown (/breakdown)');
    expect(prompt).toContain('shared-result (/result)');
  });

  it('identifies shared components', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);
    const prompt = formatPageContextPrompt(ctx);

    // AppHeader appears on all 3 pages
    expect(prompt).toContain('AppHeader (appears on 3 pages)');
  });

  it('includes filtered data models', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);
    const prompt = formatPageContextPrompt(ctx);

    expect(prompt).toContain('## Data Models');
    expect(prompt).toContain('BillState { subtotal: number, tax_amount: number, tip_percent: number }');
    expect(prompt).toContain('PersonEntry { name: string, sort_order: number }');
  });

  it('includes filtered API endpoints', () => {
    const ctx = buildPageContext(BILL_ENTRY_PAGE, ALL_PAGES, MODELS, ENDPOINTS);
    const prompt = formatPageContextPrompt(ctx);

    expect(prompt).toContain('## API Endpoints');
    expect(prompt).toContain('POST /api/share/encode');
  });

  it('omits models section when no models', () => {
    const ctx: PageContext = {
      targetPage: BILL_ENTRY_PAGE,
      allPages: ALL_PAGES,
    };
    const prompt = formatPageContextPrompt(ctx);

    expect(prompt).not.toContain('## Data Models');
  });
});
