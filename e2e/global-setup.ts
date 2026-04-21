/**
 * Pre-flight: confirm the Next dashboard is running.
 *
 * We only check port 3000 here. The Vite renderer on :4100 is started on
 * demand by the dashboard itself (navigating to `/design` triggers
 * `POST /api/renderer/start`). Tests individually wait for renderer readiness
 * via `waitForRendererReady()` before interacting with the prototype iframe.
 *
 * We deliberately do NOT start Next here — Playwright spawning `next dev`
 * alongside --headed Chromium has caused SIGKILL (exit 137 / OOM) on macOS.
 */

type Status = { ok: true; note: string } | { ok: false; reason: string };

const NEXT_URL = 'http://localhost:3000';

async function ping(url: string, timeoutMs = 2000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    // Accept any non-5xx — Next may redirect (307) on first GET /.
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkWithRetry(
  label: string,
  url: string,
  attempts: number,
  delayMs: number,
): Promise<Status> {
  for (let i = 0; i < attempts; i++) {
    const ok = await ping(url);
    if (ok) {
      return { ok: true, note: `${label} is up at ${url}` };
    }
    if (i < attempts - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return { ok: false, reason: `${label} is NOT responding at ${url}` };
}

export default async function globalSetup(): Promise<void> {
  const next = await checkWithRetry('Next dashboard', NEXT_URL, 3, 500);

  if (next.ok) {
    // eslint-disable-next-line no-console
    console.log(`\n[e2e] ${next.note}`);
    // eslint-disable-next-line no-console
    console.log('[e2e] Vite renderer will be started on demand by the dashboard when /design loads.\n');
    return;
  }

  const hint =
    '\nStart the dashboard in a separate terminal and re-run tests:\n'
    + '    (cd packages/dashboard && npx next dev --port 3000)\n\n'
    + 'The Vite renderer on :4100 is started automatically by the dashboard —\n'
    + 'no need to run it yourself.\n';

  throw new Error(`\n[e2e] Required dev server is not running:\n  ✖ ${next.reason}\n${hint}`);
}
