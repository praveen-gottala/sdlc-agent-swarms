// Handles postMessage communication with the dashboard parent.
// Sends: ready, node-clicked, node-hovered, render-complete, dom-extracted
// Receives: enable-tagging, disable-tagging, highlight-node, clear-highlights, load-spec, extract-dom
import { extractDOMFromDocument } from '../../dom-extraction-shared.js';

/** Send a log message to the dashboard parent via postMessage. */
export function sendLog(level: string, message: string, logSource: 'bridge' | 'renderer' = 'bridge') {
  window.parent.postMessage(
    { type: 'log', level, message, source: 'agentforge', logSource },
    '*',
  );
}

export function initIframeBridge(options?: {
  onLoadSpec?: (specJson: string) => void;
  onLoadPrototype?: (payload: string) => void;
}) {
  let taggingEnabled = false;
  let styleEl: HTMLStyleElement | null = null;
  let deltaStyleEl: HTMLStyleElement | null = null;

  // Notify parent we're ready
  window.parent.postMessage({ type: 'ready', source: 'agentforge' }, '*');
  sendLog('INFO', 'Renderer iframe bridge initialized');

  // Click handler (delegated)
  function handleClick(e: MouseEvent) {
    if (!taggingEnabled) return;
    const el = (e.target as HTMLElement).closest('[data-node]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const nodeId = el.dataset.node!;
    const catalogType = el.dataset.catalog ?? null;
    const cs = getComputedStyle(el);
    const computedStyles: Record<string, string> = {
      width: cs.width,
      height: cs.height,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      display: cs.display,
      flexDirection: cs.flexDirection,
      gap: cs.gap,
      padding: cs.padding,
      borderRadius: cs.borderRadius,
    };
    window.parent.postMessage(
      { type: 'node-clicked', nodeId, catalogType, computedStyles, source: 'agentforge' },
      '*',
    );
  }

  // Hover handler (delegated)
  function handleMouseMove(e: MouseEvent) {
    if (!taggingEnabled) return;
    const el = (e.target as HTMLElement).closest('[data-node]') as HTMLElement | null;
    if (!el) {
      window.parent.postMessage(
        { type: 'node-hovered', nodeId: null, rect: null, catalogType: null, source: 'agentforge' },
        '*',
      );
      return;
    }
    const rect = el.getBoundingClientRect();
    window.parent.postMessage(
      {
        type: 'node-hovered',
        nodeId: el.dataset.node!,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        catalogType: el.dataset.catalog ?? null,
        source: 'agentforge',
      },
      '*',
    );
  }

  // Inject/remove tagging hover styles
  function setTaggingStyles(enabled: boolean) {
    if (enabled && !styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = `[data-node]:hover { outline: 2px solid #3b82f6 !important; cursor: pointer !important; }`;
      document.head.appendChild(styleEl);
    } else if (!enabled && styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }

  // Listen for parent messages
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== 'agentforge') return;
    switch (data.type) {
      case 'enable-tagging':
        taggingEnabled = true;
        setTaggingStyles(true);
        break;
      case 'disable-tagging':
        taggingEnabled = false;
        setTaggingStyles(false);
        break;
      case 'highlight-node': {
        document.querySelectorAll('[data-node]').forEach((el) =>
          (el as HTMLElement).style.removeProperty('outline'),
        );
        const target = document.querySelector(`[data-node="${data.nodeId}"]`) as HTMLElement | null;
        if (target) target.style.outline = '2px solid #3b82f6';
        break;
      }
      case 'clear-highlights':
        document.querySelectorAll('[data-node]').forEach((el) =>
          (el as HTMLElement).style.removeProperty('outline'),
        );
        break;
      case 'update-node-style': {
        const styled = document.querySelector(`[data-node="${data.nodeId}"]`) as HTMLElement | null;
        if (styled) {
          for (const [prop, value] of Object.entries(data.styles as Record<string, string>)) {
            (styled.style as any)[prop] = value;
          }
        }
        break;
      }
      case 'load-spec':
        sendLog('INFO', 'load-spec received from parent');
        options?.onLoadSpec?.(data.specJson);
        break;
      case 'load-prototype':
        sendLog('INFO', 'load-prototype received from parent');
        options?.onLoadPrototype?.(data.payload);
        break;
      case 'extract-dom': {
        sendLog('INFO', 'extract-dom: extracting layout data from all [data-node] elements');
        const domData = extractDOMFromDocument();
        window.parent.postMessage(
          { type: 'dom-extracted', data: domData, source: 'agentforge' },
          '*',
        );
        sendLog('INFO', `extract-dom: extracted ${Object.keys(domData.nodes).length} nodes`);
        break;
      }
      case 'apply-delta-highlights': {
        sendLog('INFO', `apply-delta-highlights: ${data.nodes.length} nodes`);
        // Inject highlight CSS
        if (!deltaStyleEl) {
          deltaStyleEl = document.createElement('style');
          document.head.appendChild(deltaStyleEl);
        }
        deltaStyleEl.textContent = data.css;

        // Apply classes and badges to each classified node
        for (const { nodeId, op, description } of data.nodes) {
          const el = document.querySelector(`[data-node="${nodeId}"]`) as HTMLElement | null;
          if (!el) continue;

          el.style.position = 'relative';
          el.classList.add('r10-highlight', `r10-${op}`);
          el.dataset.deltaOp = op;

          // Create badge
          const badge = document.createElement('span');
          badge.className = `r10-badge r10-badge-${op}`;
          const prefix = op === 'added' ? '+' : op === 'modified' ? '~' : op === 'removed' ? '−' : '↕';
          badge.textContent = `${prefix} ${op.charAt(0).toUpperCase() + op.slice(1)}`;

          // Create approve/reject controls
          const controls = document.createElement('span');
          controls.className = 'r10-region-controls';
          controls.style.cssText = 'position:absolute;top:-10px;right:100px;display:flex;gap:2px;z-index:2;';

          const approveBtn = document.createElement('button');
          approveBtn.className = 'r10-approve-btn';
          approveBtn.textContent = '✓';
          approveBtn.title = `Approve: ${description}`;
          approveBtn.style.cssText = 'width:20px;height:20px;border-radius:10px;border:1px solid #639922;background:#C0DD97;color:#173404;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;';
          approveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.parent.postMessage({ type: 'delta-region-action', nodeId, action: 'approve', source: 'agentforge' }, '*');
          });

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'r10-reject-btn';
          rejectBtn.textContent = '✕';
          rejectBtn.title = `Reject: ${description}`;
          rejectBtn.style.cssText = 'width:20px;height:20px;border-radius:10px;border:1px solid #E24B4A;background:#F7C1C1;color:#501313;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;';
          rejectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.parent.postMessage({ type: 'delta-region-action', nodeId, action: 'reject', source: 'agentforge' }, '*');
          });

          controls.appendChild(approveBtn);
          controls.appendChild(rejectBtn);

          el.insertBefore(badge, el.firstChild);
          el.insertBefore(controls, el.firstChild);
        }
        break;
      }
      case 'clear-delta-highlights': {
        sendLog('INFO', 'clear-delta-highlights');
        if (deltaStyleEl) {
          deltaStyleEl.remove();
          deltaStyleEl = null;
        }
        document.querySelectorAll('.r10-highlight').forEach((el) => {
          el.classList.remove('r10-highlight', 'r10-added', 'r10-modified', 'r10-removed', 'r10-reordered');
          delete (el as HTMLElement).dataset.deltaOp;
        });
        document.querySelectorAll('.r10-badge, .r10-region-controls').forEach((el) => el.remove());
        break;
      }
    }
  });

  // Attach delegated listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('mousemove', handleMouseMove);
}
