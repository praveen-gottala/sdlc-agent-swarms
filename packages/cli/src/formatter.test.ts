import { formatTaskRow, formatTaskTable } from './formatter.js';
import type { TaskEntry } from './types.js';

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_001',
  title: 'Generate RevenueChart',
  phase: 'code_generation',
  agent: 'frontend_coder',
  status: 'in_progress',
  depends_on: [],
  spec_ref: 'comp_revenue_chart',
  branch: 'agentforge/task-001-revenue-chart',
  pr_number: null,
  cost_usd: 0.42,
  tokens_used: 18400,
  attempts: 1,
  max_attempts: 3,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

describe('formatTaskRow', () => {
  it('formats an in-progress task with cost', () => {
    const row = formatTaskRow(makeTask());
    expect(row).toContain('task_001');
    expect(row).toContain('in_progress');
    expect(row).toContain('$0.42');
    expect(row).toContain('Generate RevenueChart');
  });

  it('shows dash for zero cost', () => {
    const row = formatTaskRow(makeTask({ cost_usd: 0 }));
    expect(row).toContain('-');
  });

  it('includes status icon for completed tasks', () => {
    const row = formatTaskRow(makeTask({ status: 'completed' }));
    expect(row).toContain('✔');
  });

  it('includes status icon for failed tasks', () => {
    const row = formatTaskRow(makeTask({ status: 'failed' }));
    expect(row).toContain('✗');
  });
});

describe('formatTaskTable', () => {
  it('includes header with phase name', () => {
    const table = formatTaskTable([makeTask()], 'code_generation');
    expect(table).toContain('Phase: code_generation');
  });

  it('shows summary counts', () => {
    const tasks = [
      makeTask({ id: 'task_001', status: 'completed', cost_usd: 0.42 }),
      makeTask({ id: 'task_002', status: 'in_progress', cost_usd: 0.30 }),
      makeTask({ id: 'task_003', status: 'pending', cost_usd: 0 }),
    ];
    const table = formatTaskTable(tasks);

    expect(table).toContain('1/3 completed');
    expect(table).toContain('1 in progress');
    expect(table).toContain('$0.72');
  });

  it('includes column headers', () => {
    const table = formatTaskTable([makeTask()]);
    expect(table).toContain('ID');
    expect(table).toContain('STATUS');
    expect(table).toContain('COST');
    expect(table).toContain('TITLE');
  });

  it('renders all tasks', () => {
    const tasks = [
      makeTask({ id: 'task_001' }),
      makeTask({ id: 'task_002', title: 'Generate ActivityFeed' }),
    ];
    const table = formatTaskTable(tasks);

    expect(table).toContain('task_001');
    expect(table).toContain('task_002');
    expect(table).toContain('Generate ActivityFeed');
  });
});
