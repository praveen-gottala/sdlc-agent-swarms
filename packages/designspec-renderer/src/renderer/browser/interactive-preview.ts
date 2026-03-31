/**
 * @module @agentforge/designspec-renderer/renderer/browser/interactive-preview
 *
 * Opens a persistent browser preview where the user can click on elements
 * and tag them with feedback. The preview overlay is injected at serve-time
 * (not compiled into the Vite build) so screenshot mode is unaffected.
 *
 * Supports two modes:
 * - One-shot: `runInteractivePreview()` — opens, collects tags, closes
 * - Session: `openInteractivePreview()` — returns a session with
 *   waitForFeedback/refresh/close for continuous correction loops
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { ensureBrowserAppBuilt } from './build.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';

/** User feedback tag for a specific design element. */
export interface UserFeedbackTag {
  nodeId: string;
  feedback: string;
}

/** Result of the interactive preview session. */
export interface InteractivePreviewResult {
  tags: readonly UserFeedbackTag[];
  /** true if user clicked "Approve & Close" with no tags (legacy: "Looks Good"). */
  skipped: boolean;
  /** true if user clicked "Approve & Close". */
  approved: boolean;
}

/** Session-based interactive preview for continuous feedback loops. */
export interface InteractivePreviewSession {
  /** Block until user clicks "Submit Feedback" or "Approve & Close". */
  waitForFeedback(): Promise<InteractivePreviewResult>;
  /** Push updated spec/score/round to the preview (triggers client reload). */
  refresh(spec: DesignSpecV2, score: number, round: number): Promise<void>;
  /** Close the server and clean up temp files. */
  close(): Promise<void>;
  /** The port the preview server is listening on. */
  readonly port: number;
}

/** Options for the interactive preview. */
export interface InteractivePreviewOptions {
  port?: number;
  openBrowser?: boolean;
}

// ─── Server State ────────────────────────────────────────────

interface PreviewServerState {
  tags: UserFeedbackTag[];
  currentRound: number;
  currentScore: number;
  refreshReady: boolean;
  processing: boolean;
  /** Callback invoked server-side when a tag is received. */
  onTag?: (tag: UserFeedbackTag) => void;
}

// ─── Session-based API ──────────────────────────────────────

/**
 * Open an interactive preview session.
 * The preview stays alive for multiple feedback/correction rounds.
 */
export async function openInteractivePreview(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: InteractivePreviewOptions,
): Promise<InteractivePreviewSession> {
  const distDir = await ensureBrowserAppBuilt();
  const tempDir = path.join(tmpdir(), `designspec-interactive-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  cpSync(distDir, tempDir, { recursive: true });

  const dataDir = path.join(tempDir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, 'spec.json'), JSON.stringify(spec));
  writeFileSync(path.join(dataDir, 'tokens.json'), JSON.stringify(tokens));
  writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog));

  // Inject overlay script
  const indexPath = path.join(tempDir, 'index.html');
  let indexHtml = readFileSync(indexPath, 'utf-8');
  indexHtml = indexHtml.replace(
    '</body>',
    `<script>${PREVIEW_OVERLAY_JS}</script>\n</body>`,
  );
  writeFileSync(indexPath, indexHtml);

  const state: PreviewServerState = {
    tags: [],
    currentRound: 1,
    currentScore: 0,
    refreshReady: false,
    processing: false,
  };

  const { server, port: actualPort } = await startSessionServer(tempDir, dataDir, state);

  // Open browser
  if (options?.openBrowser !== false) {
    try {
      const { exec } = await import('child_process');
      const url = `http://localhost:${actualPort}/index.html`;
      const cmd = process.platform === 'darwin' ? `open "${url}"`
        : process.platform === 'win32' ? `start "${url}"`
        : `xdg-open "${url}"`;
      exec(cmd);
    } catch {
      // Silently fail if can't open browser
    }
  }

  return {
    port: actualPort,

    waitForFeedback(): Promise<InteractivePreviewResult> {
      state.processing = false;
      return new Promise((resolve) => {
        const onSubmit = () => {
          server.removeListener('preview-approve', onApprove);
          const submittedTags = [...state.tags];
          state.tags.length = 0;
          resolve({ tags: submittedTags, skipped: false, approved: false });
        };
        const onApprove = () => {
          server.removeListener('preview-submit', onSubmit);
          const submittedTags = [...state.tags];
          state.tags.length = 0;
          resolve({ tags: submittedTags, skipped: submittedTags.length === 0, approved: true });
        };
        server.once('preview-submit', onSubmit);
        server.once('preview-approve', onApprove);
      });
    },

    async refresh(newSpec: DesignSpecV2, score: number, round: number): Promise<void> {
      state.processing = true;
      state.currentScore = score;
      state.currentRound = round;
      // Write updated spec for the client to reload
      writeFileSync(path.join(dataDir, 'spec.json'), JSON.stringify(newSpec));
      state.processing = false;
      state.refreshReady = true;
    },

    async close(): Promise<void> {
      server.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

// ─── One-shot API (backward compatible) ─────────────────────

/**
 * Open an interactive preview in the user's browser.
 * The user can click on elements to tag them with feedback.
 * Returns when the user clicks "Submit Feedback" or "Approve & Close".
 *
 * This is a convenience wrapper around openInteractivePreview().
 */
export async function runInteractivePreview(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: InteractivePreviewOptions,
): Promise<InteractivePreviewResult> {
  const session = await openInteractivePreview(spec, tokens, catalog, options);

  // eslint-disable-next-line no-console
  console.log(`\n  Interactive preview: http://localhost:${session.port}/index.html`);
  // eslint-disable-next-line no-console
  console.log('  Click elements to add feedback. Press "Approve & Close" when finished.\n');

  const result = await session.waitForFeedback();
  await session.close();
  return result;
}

// ─── Session Server ─────────────────────────────────────────

function startSessionServer(
  rootDir: string,
  dataDir: string,
  state: PreviewServerState,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      // ── POST /api/feedback ── accumulate tags
      if (req.method === 'POST' && req.url === '/api/feedback') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { nodeId, feedback } = JSON.parse(body);
            if (nodeId && feedback) {
              const tag: UserFeedbackTag = { nodeId, feedback };
              state.tags.push(tag);
              if (state.onTag) state.onTag(tag);
            }
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ ok: true, tagCount: state.tags.length }));
          } catch {
            res.writeHead(400, corsHeaders);
            res.end('Bad request');
          }
        });
        return;
      }

      // ── POST /api/submit ── return current tags, keep server alive
      if (req.method === 'POST' && req.url === '/api/submit') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ ok: true, tagCount: state.tags.length }));
        state.processing = true;
        server.emit('preview-submit');
        return;
      }

      // ── POST /api/approve ── signal final completion
      if (req.method === 'POST' && req.url === '/api/approve') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ ok: true }));
        server.emit('preview-approve');
        return;
      }

      // ── POST /api/done ── legacy endpoint (maps to approve)
      if (req.method === 'POST' && req.url === '/api/done') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          let skipped = false;
          try {
            const parsed = JSON.parse(body);
            skipped = parsed.skipped === true;
          } catch {
            // ignore
          }
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ ok: true }));
          if (skipped) {
            server.emit('preview-approve');
          } else {
            server.emit('preview-submit');
          }
        });
        return;
      }

      // ── GET /api/status ── pipeline state for client polling
      if (req.method === 'GET' && (req.url === '/api/status' || req.url?.startsWith('/api/status?'))) {
        const wasReady = state.refreshReady;
        // One-shot: reset after serving true so the client gets it exactly once
        if (wasReady) state.refreshReady = false;
        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({
          round: state.currentRound,
          score: state.currentScore,
          refreshReady: wasReady,
          processing: state.processing,
        }));
        return;
      }

      // ── Static file serving ──
      // Strip query string (cache-busting params like ?t=...) before resolving file path
      const urlPath = (req.url ?? '/').split('?')[0];
      const filePath = path.join(rootDir, urlPath === '/' ? '/index.html' : urlPath);

      if (!existsSync(filePath)) {
        res.writeHead(404, corsHeaders);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] ?? 'application/octet-stream';
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType, ...corsHeaders });
      res.end(content);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, port });
    });

    server.on('error', reject);
  });
}

// ─── Overlay Script ─────────────────────────────────────────

const PREVIEW_OVERLAY_JS = `
(function() {
  // Styles
  const style = document.createElement('style');
  style.textContent = \`
    [data-node]:hover {
      outline: 2px solid #3b82f6 !important;
      cursor: pointer !important;
    }
    #af-tooltip {
      position: fixed;
      background: #1e293b;
      color: #f1f5f9;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
      pointer-events: none;
      z-index: 99999;
      display: none;
      max-width: 300px;
    }
    #af-toolbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1e293b;
      color: #f1f5f9;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 99998;
      font-family: system-ui, sans-serif;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
    }
    #af-toolbar button {
      padding: 8px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: opacity 0.15s;
    }
    #af-toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #af-toolbar .af-submit {
      background: #3b82f6;
      color: white;
    }
    #af-toolbar .af-approve {
      background: #22c55e;
      color: white;
    }
    #af-toolbar-info {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 14px;
    }
    #af-toolbar-info .af-round {
      font-weight: 600;
    }
    #af-toolbar-info .af-score {
      color: #94a3b8;
    }
    #af-toolbar-info .af-tags {
      color: #94a3b8;
    }
    #af-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    #af-modal {
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 360px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    #af-modal h3 {
      margin: 0 0 12px;
      color: #1e293b;
    }
    #af-modal textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
      resize: vertical;
      box-sizing: border-box;
    }
    #af-modal .af-modal-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      justify-content: flex-end;
    }
    #af-modal button {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 13px;
    }
    #af-loading-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.85);
      z-index: 100001;
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
    }
    #af-loading-overlay .af-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.2);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: af-spin 0.8s linear infinite;
    }
    #af-loading-overlay .af-loading-text {
      color: #f1f5f9;
      font-family: system-ui, sans-serif;
      font-size: 16px;
      font-weight: 500;
    }
    @keyframes af-spin {
      to { transform: rotate(360deg); }
    }
  \`;
  document.head.appendChild(style);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'af-tooltip';
  document.body.appendChild(tooltip);

  // Loading overlay
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'af-loading-overlay';
  loadingOverlay.innerHTML = '<div class="af-spinner"></div><div class="af-loading-text">Applying corrections...</div>';
  document.body.appendChild(loadingOverlay);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.id = 'af-toolbar';

  const toolbarInfo = document.createElement('div');
  toolbarInfo.id = 'af-toolbar-info';

  const roundLabel = document.createElement('span');
  roundLabel.className = 'af-round';
  roundLabel.textContent = 'Round 1';

  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'af-score';
  scoreLabel.textContent = 'Score: --/100';

  const tagCountLabel = document.createElement('span');
  tagCountLabel.className = 'af-tags';
  tagCountLabel.textContent = '0 tags';

  toolbarInfo.appendChild(roundLabel);
  toolbarInfo.appendChild(scoreLabel);
  toolbarInfo.appendChild(tagCountLabel);

  const btnGroup = document.createElement('div');
  btnGroup.style.display = 'flex';
  btnGroup.style.gap = '8px';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'af-submit';
  submitBtn.textContent = 'Submit Feedback';
  submitBtn.disabled = true;

  const approveBtn = document.createElement('button');
  approveBtn.className = 'af-approve';
  approveBtn.textContent = 'Approve & Close';

  btnGroup.appendChild(submitBtn);
  btnGroup.appendChild(approveBtn);
  toolbar.appendChild(toolbarInfo);
  toolbar.appendChild(btnGroup);
  document.body.appendChild(toolbar);

  // Modal
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'af-modal-overlay';
  const modal = document.createElement('div');
  modal.id = 'af-modal';
  modal.innerHTML = '<h3 id="af-modal-title">Feedback</h3><textarea id="af-feedback-input" placeholder="Describe what\\'s wrong..."></textarea><div class="af-modal-actions"><button id="af-cancel-btn" style="background:#e2e8f0;color:#475569">Cancel</button><button id="af-tag-btn" style="background:#3b82f6;color:white">Tag</button></div>';
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  let count = 0;
  let currentNodeId = null;

  function updateSubmitState() {
    submitBtn.disabled = count === 0;
  }

  // On load, fetch status to get round/score (handles post-reload state)
  fetch('/api/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.round) roundLabel.textContent = 'Round ' + data.round;
      if (typeof data.score === 'number' && data.score > 0) {
        scoreLabel.textContent = 'Score: ' + data.score + '/100';
      }
    })
    .catch(function() {});

  // Hover tooltip
  document.addEventListener('mousemove', function(e) {
    const el = e.target.closest('[data-node]');
    if (el) {
      const nodeId = el.dataset.node;
      const catalog = el.dataset.catalog || '';
      const rect = el.getBoundingClientRect();
      tooltip.textContent = nodeId + (catalog ? ' (' + catalog + ')' : '') + ' \\u2014 ' + Math.round(rect.width) + '\\u00d7' + Math.round(rect.height);
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 30) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });

  // Click -> open feedback modal
  document.addEventListener('click', function(e) {
    const el = e.target.closest('[data-node]');
    if (!el) return;
    if (e.target.closest('#af-toolbar') || e.target.closest('#af-modal-overlay') || e.target.closest('#af-loading-overlay')) return;
    e.preventDefault();
    e.stopPropagation();
    currentNodeId = el.dataset.node;
    const catalog = el.dataset.catalog || '';
    document.getElementById('af-modal-title').textContent = 'Feedback: ' + currentNodeId + (catalog ? ' (' + catalog + ')' : '');
    document.getElementById('af-feedback-input').value = '';
    modalOverlay.style.display = 'flex';
    document.getElementById('af-feedback-input').focus();
  }, true);

  // Tag button (inside modal — submits a single tag)
  document.getElementById('af-tag-btn').addEventListener('click', function() {
    const feedback = document.getElementById('af-feedback-input').value.trim();
    if (feedback && currentNodeId) {
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: currentNodeId, feedback: feedback })
      });
      count++;
      tagCountLabel.textContent = count + ' tag' + (count === 1 ? '' : 's');
      updateSubmitState();
    }
    modalOverlay.style.display = 'none';
    currentNodeId = null;
  });

  document.getElementById('af-cancel-btn').addEventListener('click', function() {
    modalOverlay.style.display = 'none';
    currentNodeId = null;
  });

  // Submit Feedback button — sends tags to pipeline, waits for correction
  submitBtn.addEventListener('click', function() {
    if (count === 0) return;
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function() {
      waitForRefresh();
    });
  });

  // Approve & Close button — signals pipeline to finish
  approveBtn.addEventListener('click', function() {
    fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    // Show a closing message
    loadingOverlay.querySelector('.af-loading-text').textContent = 'Closing preview...';
    loadingOverlay.style.display = 'flex';
  });

  function waitForRefresh() {
    loadingOverlay.querySelector('.af-loading-text').textContent = 'Applying corrections...';
    loadingOverlay.style.display = 'flex';
    function poll() {
      fetch('/api/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.refreshReady) {
            window.location.reload();
          } else {
            setTimeout(poll, 500);
          }
        })
        .catch(function() {
          setTimeout(poll, 500);
        });
    }
    poll();
  }
})();
`;
