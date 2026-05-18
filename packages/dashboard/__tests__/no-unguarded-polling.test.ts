/**
 * Static analysis guard: prevents accidental polling additions.
 *
 * Every setInterval in the dashboard must be whitelisted here with a
 * justification. This test catches the exact bug we fixed: someone adds
 * a polling loop that fires every 2-5 seconds, saturating the browser's
 * 6-connection limit and making page switches take 25+ seconds.
 *
 * If this test fails, you either:
 * 1. Added a new setInterval — add it to the whitelist with justification
 * 2. Moved an existing one — update the file path in the whitelist
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const DASHBOARD_SRC = resolve(__dirname, '../src');

/**
 * Whitelisted setInterval usages. Each entry documents WHY the polling
 * is acceptable and WHEN it stops (the guard condition).
 */
const WHITELIST: Array<{ file: string; justification: string }> = [
  {
    file: 'components/design/pipeline-progress.tsx',
    justification: 'Elapsed timer during active pipeline — UI-only, no network call',
  },
  {
    file: 'components/design/design-canvas.tsx',
    justification: 'Renderer health poll — only while renderer is starting, stops when healthy',
  },
  {
    file: 'lib/hooks/use-run-progress.ts',
    justification: 'Pipeline run poll — only while runId is active AND status is running/pending',
  },
  {
    file: 'app/(dashboard)/design/page.tsx',
    justification: 'Pipeline event poll (2s) — guarded by if(!pipelineRunId) return. Safety net poll (5s) — guarded by designStatus===generating AND no pipelineRunId',
  },
  {
    file: 'components/live-monitor/log-console.tsx',
    justification: 'Log console auto-scroll — UI-only, no network call',
  },
  {
    file: 'app/(dashboard)/new/page.tsx',
    justification: 'ThinkingTimeline elapsed timer — 1s interval, UI-only, no network call',
  },
  {
    file: 'components/clarifier/welcome-hero.tsx',
    justification: 'Animated placeholder cycling — 3.5s interval, UI-only, stops when user types',
  },
  {
    file: 'components/clarifier/chat-message.tsx',
    justification: 'ElapsedTimer — 1s interval, UI-only, tracks stage elapsed time with cleanup',
  },
  {
    file: 'components/layout/dashboard-shell.tsx',
    justification: 'Active run + budget poll — 30s interval, lightweight GET, cleanup on unmount',
  },
  {
    file: 'components/pipeline/fun-facts.tsx',
    justification: 'Fun fact rotation — UI-only animation, no network call',
  },
  {
    file: 'components/pipeline/stage-detail-card.tsx',
    justification: 'Stage elapsed timer — 1s interval, UI-only, no network call',
  },
  {
    file: 'components/layout/sidebar-nav.tsx',
    justification: 'Approval badge poll — 30s interval, lightweight GET /api/approvals, cleanup on unmount',
  },
  {
    file: 'lib/hooks/use-event-feed.ts',
    justification: 'Live event feed poll — guarded by isLive flag, polls only while activity sidebar is open',
  },
];

describe('No unguarded polling', () => {
  it('all setInterval usages in dashboard/src are whitelisted', () => {
    // Find all files containing setInterval
    const output = execSync(
      `grep -rn "setInterval" "${DASHBOARD_SRC}" --include="*.ts" --include="*.tsx" || true`,
      { encoding: 'utf-8' },
    );

    const lines = output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      // Exclude this test file and type declarations
      .filter((line) => !line.includes('no-unguarded-polling.test.ts'))
      .filter((line) => !line.includes('ReturnType<typeof setInterval>'))
      .filter((line) => !line.includes('.test.ts'))
      .filter((line) => !line.includes('__tests__'));

    const unwhitelisted: string[] = [];

    for (const line of lines) {
      // Extract relative file path from grep output
      const match = line.match(/^(.+?):\d+:/);
      if (!match) continue;

      const fullPath = match[1];
      const relativePath = fullPath.replace(DASHBOARD_SRC + '/', '');

      const isWhitelisted = WHITELIST.some((w) => relativePath.includes(w.file));
      if (!isWhitelisted) {
        unwhitelisted.push(line);
      }
    }

    if (unwhitelisted.length > 0) {
      const message = [
        'Found unwhitelisted setInterval usage(s) in dashboard source:',
        '',
        ...unwhitelisted.map((l) => `  ${l}`),
        '',
        'Polling loops saturate the browser connection pool (6 connections per origin)',
        'and cause page switches to take 25+ seconds.',
        '',
        'If this polling is intentional:',
        '  1. Ensure it has a guard (e.g., only poll while a pipeline is running)',
        '  2. Add it to the WHITELIST in __tests__/no-unguarded-polling.test.ts',
        '  3. Prefer load-once + refresh button over continuous polling',
      ].join('\n');

      throw new Error(message);
    }
  });
});
