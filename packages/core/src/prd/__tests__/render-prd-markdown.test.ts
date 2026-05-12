import { renderPrdToMarkdown } from '../render-prd-markdown.js';
import type { PRD } from '../../types/cross-boundary-artifacts.js';

const fullPrd: PRD = {
  id: 'prd-001',
  title: 'CashPulse',
  description: 'A personal finance tracker for daily expenses and budgeting.',
  version: '1.0.0',
  status: 'approved',
  screens: [
    { id: 's1', name: 'Dashboard', description: 'Overview of spending', screenType: 'page' },
    { id: 's2', name: 'Add Expense', description: 'Form to add a new expense', screenType: 'drawer' },
    { id: 's3', name: 'Settings', description: 'User preferences' },
  ],
  dataEntities: [
    {
      id: 'e1',
      name: 'Expense',
      fields: [
        { name: 'amount', type: 'number', required: true },
        { name: 'category', type: 'string', required: true },
        { name: 'date', type: 'Date', required: false },
        { name: 'notes', type: 'string' },
      ],
      relationships: ['Category', 'User'],
    },
    {
      id: 'e2',
      name: 'Category',
      fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'icon', type: 'string' },
      ],
    },
  ],
  personas: [
    {
      id: 'p1',
      name: 'Alex',
      role: 'Budget-conscious professional',
      goals: ['Track daily spending', 'Stay within monthly budget'],
    },
  ],
  features: [
    { id: 'f1', name: 'Expense Entry', description: 'Add expenses with amount, category, and notes', priority: 'must-have' },
    { id: 'f2', name: 'Budget Alerts', description: 'Notify when spending exceeds 80% of budget', priority: 'should-have' },
    { id: 'f3', name: 'Export Data', description: 'Export expenses to CSV' },
  ],
  nfrs: [
    { id: 'n1', category: 'Performance', description: 'Page load under 2s', target: '<2s p95' },
    { id: 'n2', category: 'Accessibility', description: 'WCAG 2.1 AA compliance' },
  ],
  successMetrics: [
    { id: 'm1', name: 'Daily Active Users', description: 'Users who log at least one expense', target: '500 DAU', measurement: 'Analytics' },
  ],
  outOfScope: [
    'Multi-currency support',
    'Investment tracking',
  ],
};

describe('renderPrdToMarkdown', () => {
  it('renders all sections in ADR-053 order for a fully populated PRD', () => {
    const md = renderPrdToMarkdown(fullPrd);

    const sectionOrder = [
      '# CashPulse',
      '## Screens',
      '## Data Entities',
      '## Personas',
      '## Features',
      '## Non-Functional Requirements',
      '## Success Metrics',
      '## Out of Scope',
    ];

    let lastIndex = -1;
    for (const heading of sectionOrder) {
      const idx = md.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('is deterministic — two calls with the same input produce identical output', () => {
    const a = renderPrdToMarkdown(fullPrd);
    const b = renderPrdToMarkdown(fullPrd);
    expect(a).toBe(b);
  });

  it('omits Personas section when personas array is empty', () => {
    const prd: PRD = { ...fullPrd, personas: [] };
    const md = renderPrdToMarkdown(prd);
    expect(md).not.toContain('## Personas');
  });

  it('omits Non-Functional Requirements section when nfrs array is empty', () => {
    const prd: PRD = { ...fullPrd, nfrs: [] };
    const md = renderPrdToMarkdown(prd);
    expect(md).not.toContain('## Non-Functional Requirements');
  });

  it('omits Success Metrics section when successMetrics array is empty', () => {
    const prd: PRD = { ...fullPrd, successMetrics: [] };
    const md = renderPrdToMarkdown(prd);
    expect(md).not.toContain('## Success Metrics');
  });

  it('omits Out of Scope section when outOfScope array is empty', () => {
    const prd: PRD = { ...fullPrd, outOfScope: [] };
    const md = renderPrdToMarkdown(prd);
    expect(md).not.toContain('## Out of Scope');
  });

  it('marks required fields with _(required)_ and omits marker on non-required fields', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toContain('`amount`: number _(required)_');
    expect(md).toContain('`category`: string _(required)_');
    expect(md).not.toMatch(/`notes`.*_\(required\)_/);
    expect(md).not.toMatch(/`date`.*_\(required\)_/);
  });

  it('renders screen types in parentheses when present', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toContain('**Dashboard** (page):');
    expect(md).toContain('**Add Expense** (drawer):');
    expect(md).not.toMatch(/\*\*Settings\*\* \(/);
  });

  it('renders entity relationships when present', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toContain('Relationships: Category, User');
  });

  it('renders feature priorities in brackets when present', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toContain('_[must-have]_');
    expect(md).toContain('_[should-have]_');
    expect(md).not.toMatch(/Export Data.*\[/);
  });

  it('renders NFR targets when present', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toContain('**Performance**: Page load under 2s — target: <2s p95');
    expect(md).not.toMatch(/Accessibility.*target:/);
  });

  it('ends with a single trailing newline', () => {
    const md = renderPrdToMarkdown(fullPrd);
    expect(md).toMatch(/[^\n]\n$/);
  });

  it('always includes Screens, Data Entities, and Features sections even with minimal data', () => {
    const minimal: PRD = {
      id: 'min',
      title: 'Minimal',
      description: 'A minimal PRD.',
      version: '0.1',
      status: 'draft',
      screens: [{ id: 's1', name: 'Home', description: 'Main page' }],
      dataEntities: [{ id: 'e1', name: 'Item', fields: [{ name: 'id', type: 'string' }] }],
      personas: [],
      features: [{ id: 'f1', name: 'List Items', description: 'Show items' }],
      nfrs: [],
      successMetrics: [],
      outOfScope: [],
    };
    const md = renderPrdToMarkdown(minimal);
    expect(md).toContain('## Screens');
    expect(md).toContain('## Data Entities');
    expect(md).toContain('## Features');
    expect(md).not.toContain('## Personas');
    expect(md).not.toContain('## Non-Functional Requirements');
    expect(md).not.toContain('## Success Metrics');
    expect(md).not.toContain('## Out of Scope');
  });
});
