import './globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { generateCssVariables } from './generate-css-variables';
import { DesignSpecRenderer } from './DesignSpecRenderer';
import { initIframeBridge, sendLog } from './iframe-bridge';

async function main() {
  // Cache-bust spec.json to ensure fresh data after correction pipeline refreshes
  const cacheBust = `?t=${Date.now()}`;
  const [tokens, spec, catalog] = await Promise.all([
    fetch(`./data/tokens.json${cacheBust}`).then(r => r.json()),
    fetch(`./data/spec.json${cacheBust}`).then(r => r.json()),
    fetch(`./data/catalog.json${cacheBust}`).then(r => r.json()),
  ]);

  // Inject CSS vars BEFORE React renders
  const cssVars = generateCssVariables(tokens);
  const style = document.createElement('style');
  style.textContent = cssVars;
  document.head.appendChild(style);

  // Render React — dataset.ready is set inside DesignSpecRenderer via useEffect
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<DesignSpecRenderer spec={spec} tokens={tokens} catalog={catalog} />);

  initIframeBridge({
    onLoadSpec: (specJson: string) => {
      try {
        const newSpec = JSON.parse(specJson);

        if (!newSpec.nodes || typeof newSpec.nodes !== 'object' || Object.keys(newSpec.nodes).length === 0) {
          sendLog('ERROR', 'Spec has no nodes — design may have been truncated by LLM token limits');
          window.parent.postMessage(
            { type: 'render-complete', success: false, nodeCount: 0, source: 'agentforge' },
            '*',
          );
          root.render(<DesignSpecRenderer spec={newSpec} tokens={tokens} catalog={catalog} />);
          return;
        }

        sendLog('INFO', `Spec parsed, rendering ${Object.keys(newSpec.nodes).length} top-level nodes`);
        root.render(<DesignSpecRenderer spec={newSpec} tokens={tokens} catalog={catalog} />);
        requestAnimationFrame(() => {
          const nodeCount = document.querySelectorAll('[data-node]').length;
          sendLog('INFO', `Render complete: ${nodeCount} DOM nodes`);
          window.parent.postMessage(
            { type: 'render-complete', success: true, nodeCount, source: 'agentforge' },
            '*',
          );
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown parse error';
        sendLog('ERROR', `Failed to load spec: ${msg}`);
        window.parent.postMessage(
          { type: 'render-complete', success: false, nodeCount: 0, source: 'agentforge' },
          '*',
        );
      }
    },
  });
}

main();
