import './globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { generateCssVariables } from './generate-css-variables';
import { DesignSpecRenderer } from './DesignSpecRenderer';
import { PrototypeApp } from './PrototypeApp';
import { initIframeBridge, sendLog } from './iframe-bridge';
import type { DesignSpecV2 } from '@shared/types/design-spec-v2';
import type { SharedChromeSpec } from '@shared/types/shared-chrome';

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
  const [tokens, spec, catalog, manifest, chromeRaw] = await Promise.all([
    fetchJson(`./data/tokens.json${cacheBust}`),
    fetchJson(`./data/spec.json${cacheBust}`),
    fetchJson(`./data/catalog.json${cacheBust}`),
    fetchJson(`./data/prototype.json${cacheBust}`),
    fetchJson(`./data/shared-chrome.json${cacheBust}`),
  ]);

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  const chromeFromFile: SharedChromeSpec | null =
    chromeRaw && typeof chromeRaw === 'object' && chromeRaw !== null && 'nodes' in chromeRaw
      ? (chromeRaw as SharedChromeSpec)
      : null;

  // Prototype mode: multi-screen with navigation
  if (manifest?.screens?.length) {
    if (tokens) injectCssVariables(tokens);
    const specs: Record<string, DesignSpecV2> = {};
    for (const screen of manifest.screens) {
      const screenSpec = await fetchJson(`./${screen.specPath}${cacheBust}`);
      if (screenSpec) specs[screen.screenId] = screenSpec;
    }
    root.render(
      <PrototypeApp
        manifest={manifest}
        specs={specs}
        tokens={tokens ?? {}}
        catalog={catalog ?? {}}
        chromeSpec={chromeFromFile}
      />,
    );
    return;
  }

  // Single-screen mode (existing behavior)
  const hasStaticData = tokens && spec && catalog;

  if (hasStaticData) {
    injectCssVariables(tokens);
  }

  let activeTokens = tokens ?? {};
  let activeCatalog = catalog ?? {};
  let inPrototypeMode = false;

  if (hasStaticData) {
    root.render(<DesignSpecRenderer spec={spec} tokens={tokens} catalog={catalog} />);
  }

  initIframeBridge({
    onLoadPrototype: (payload: string) => {
      try {
        const parsed = JSON.parse(payload);
        const manifest = parsed.manifest;
        const specs = parsed.specs as Record<string, DesignSpecV2>;
        const protoTokens = parsed.tokens ?? activeTokens;
        const protoCatalog = parsed.catalog ?? activeCatalog;
        const chromeOpt = parsed.chromeSpec as SharedChromeSpec | null | undefined;

        activeTokens = protoTokens;
        activeCatalog = protoCatalog;
        injectCssVariables(protoTokens);

        inPrototypeMode = true;
        const chromeStatus = chromeOpt
          ? `regions=${JSON.stringify(Object.keys(chromeOpt.regions ?? {}))}, nodes=${Object.keys(chromeOpt.nodes ?? {}).length}`
          : 'null';
        sendLog('INFO', `Prototype loaded: ${manifest.screens.length} screens, ${manifest.navigation.length} nav bindings, chrome=${chromeStatus}`, 'renderer');
        root.render(
          <PrototypeApp
            manifest={manifest}
            specs={specs}
            tokens={protoTokens}
            catalog={protoCatalog}
            chromeSpec={chromeOpt ?? null}
          />,
        );
        requestAnimationFrame(() => {
          window.parent.postMessage(
            { type: 'render-complete', success: true, nodeCount: manifest.screens.length, source: 'agentforge' },
            '*',
          );
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown parse error';
        sendLog('ERROR', `Failed to load prototype: ${msg}`, 'renderer');
        window.parent.postMessage(
          { type: 'render-complete', success: false, nodeCount: 0, source: 'agentforge' },
          '*',
        );
      }
    },
    onLoadSpec: (specJson: string) => {
      if (inPrototypeMode) {
        sendLog('WARN', 'Ignoring load-spec while in prototype mode', 'renderer');
        return;
      }
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
