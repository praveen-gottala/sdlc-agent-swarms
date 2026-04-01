import './globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { generateCssVariables } from './generate-css-variables';
import { DesignSpecRenderer } from './DesignSpecRenderer';
import { initIframeBridge, sendLog } from './iframe-bridge';

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let cssVarStyleEl: HTMLStyleElement | null = null;

function injectCssVariables(tokens: any) {
  if (!tokens) return;
  const cssVars = generateCssVariables(tokens);
  if (cssVarStyleEl) {
    cssVarStyleEl.textContent = cssVars;
  } else {
    cssVarStyleEl = document.createElement('style');
    cssVarStyleEl.textContent = cssVars;
    document.head.appendChild(cssVarStyleEl);
  }
}

async function main() {
  const cacheBust = `?t=${Date.now()}`;
  const [tokens, spec, catalog] = await Promise.all([
    fetchJson(`./data/tokens.json${cacheBust}`),
    fetchJson(`./data/spec.json${cacheBust}`),
    fetchJson(`./data/catalog.json${cacheBust}`),
  ]);

  const hasStaticData = tokens && spec && catalog;

  if (hasStaticData) {
    injectCssVariables(tokens);
  }

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  let activeTokens = tokens ?? {};
  let activeCatalog = catalog ?? {};

  if (hasStaticData) {
    root.render(<DesignSpecRenderer spec={spec} tokens={tokens} catalog={catalog} />);
  }

  initIframeBridge({
    onLoadSpec: (specJson: string) => {
      try {
        const parsed = JSON.parse(specJson);

        // The dashboard sends the full payload: { spec, tokens, catalog } or just a spec
        const newSpec = parsed.spec ?? parsed;
        const newTokens = parsed.tokens ?? activeTokens;
        const newCatalog = parsed.catalog ?? activeCatalog;

        activeTokens = newTokens;
        activeCatalog = newCatalog;

        injectCssVariables(newTokens);

        if (!newSpec.nodes || typeof newSpec.nodes !== 'object' || Object.keys(newSpec.nodes).length === 0) {
          sendLog(
            'ERROR',
            'Spec has no nodes — design may have been truncated by LLM token limits',
            'renderer',
          );
          window.parent.postMessage(
            { type: 'render-complete', success: false, nodeCount: 0, source: 'agentforge' },
            '*',
          );
          root.render(<DesignSpecRenderer spec={newSpec} tokens={newTokens} catalog={newCatalog} />);
          return;
        }

        sendLog(
          'INFO',
          `Spec parsed, rendering ${Object.keys(newSpec.nodes).length} top-level nodes`,
          'renderer',
        );
        root.render(<DesignSpecRenderer spec={newSpec} tokens={newTokens} catalog={newCatalog} />);
        requestAnimationFrame(() => {
          const nodeCount = document.querySelectorAll('[data-node]').length;
          sendLog('INFO', `Render complete: ${nodeCount} DOM nodes`, 'renderer');
          window.parent.postMessage(
            { type: 'render-complete', success: true, nodeCount, source: 'agentforge' },
            '*',
          );
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown parse error';
        sendLog('ERROR', `Failed to load spec: ${msg}`, 'renderer');
        window.parent.postMessage(
          { type: 'render-complete', success: false, nodeCount: 0, source: 'agentforge' },
          '*',
        );
      }
    },
  });
}

main().catch(err => console.error('[renderer] Fatal:', err));
