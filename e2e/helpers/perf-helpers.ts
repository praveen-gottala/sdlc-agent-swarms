/**
 * Timing utilities for E2E integration tests.
 *
 * Provides wall-clock measurement and a summary report printer.
 * No hard budget assertions — timings are recorded and printed
 * so baselines can be established before setting thresholds.
 */

export interface TimingEntry {
  label: string;
  durationMs: number;
  notes?: string;
}

/**
 * Measure the wall-clock duration of an async operation.
 * Returns the operation result and elapsed milliseconds.
 */
export async function measureMs<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const t0 = performance.now();
  const result = await fn();
  const durationMs = performance.now() - t0;
  return { result, durationMs };
}

/**
 * Collects named timing entries and prints a formatted summary table.
 * Usage: create in beforeAll, record entries during tests, print in afterAll.
 */
export class TimingReport {
  private readonly title: string;
  private readonly entries: TimingEntry[] = [];

  constructor(title: string) {
    this.title = title;
  }

  /** Record a timing entry. */
  record(label: string, durationMs: number, notes?: string): void {
    this.entries.push({ label, durationMs, notes });
  }

  /** Print the summary table to console. */
  print(): void {
    if (this.entries.length === 0) return;

    const sep = '='.repeat(72);
    const lines: string[] = [
      '',
      sep,
      `  ${this.title}`,
      sep,
    ];

    // Calculate column widths
    const rows = this.entries.map((e) => [
      e.label,
      (e.durationMs / 1000).toFixed(1),
      e.notes ?? '',
    ]);

    const headers = ['Stage', 'Time (s)', 'Notes'];
    const allRows = [headers, headers.map((h) => '─'.repeat(h.length)), ...rows];
    const colWidths = headers.map((_, ci) =>
      Math.max(...allRows.map((row) => row[ci].length)),
    );

    for (const row of allRows) {
      lines.push('  ' + row.map((cell, ci) => cell.padEnd(colWidths[ci])).join('  '));
    }

    const totalMs = this.entries.reduce((sum, e) => sum + e.durationMs, 0);
    lines.push('  ' + '─'.repeat(colWidths.reduce((a, b) => a + b + 2, 0)));
    lines.push(`  Total: ${(totalMs / 1000).toFixed(1)}s`);
    lines.push(sep);
    lines.push('');

    console.log(lines.join('\n'));
  }
}
