// Handles postMessage communication with the dashboard parent.
// Sends: ready, node-clicked, node-hovered, render-complete
// Receives: enable-tagging, disable-tagging, highlight-node, clear-highlights, load-spec

/** Send a log message to the dashboard parent via postMessage. */
export function sendLog(level: string, message: string, logSource: 'bridge' | 'renderer' = 'bridge') {
  window.parent.postMessage(
    { type: 'log', level, message, source: 'agentforge', logSource },
    '*',
  );
}

export function initIframeBridge(options?: { onLoadSpec?: (specJson: string) => void }) {
  let taggingEnabled = false;
  let styleEl: HTMLStyleElement | null = null;

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
    }
  });

  // Attach delegated listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('mousemove', handleMouseMove);
}
