'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Inline protocol types (no cross-package runtime dep) ───────────────────
// These mirror @agentforge/designspec-renderer iframe-protocol.ts exactly.

type ParentMessage =
  | { type: 'load-spec'; specJson: string; source: 'agentforge' }
  | { type: 'load-prototype'; payload: string; source: 'agentforge' }
  | { type: 'update-node-style'; nodeId: string; styles: Record<string, string>; source: 'agentforge' }
  | { type: 'enable-tagging'; source: 'agentforge' }
  | { type: 'disable-tagging'; source: 'agentforge' }
  | { type: 'highlight-node'; nodeId: string; source: 'agentforge' }
  | { type: 'clear-highlights'; source: 'agentforge' };

type ChildMessage =
  | {
      type: 'render-complete';
      success: boolean;
      nodeCount: number;
      source: 'agentforge';
    }
  | {
      type: 'node-hovered';
      nodeId: string | null;
      rect: { x: number; y: number; width: number; height: number } | null;
      catalogType: string | null;
      source: 'agentforge';
    }
  | {
      type: 'node-clicked';
      nodeId: string;
      catalogType: string | null;
      computedStyles: Record<string, string>;
      source: 'agentforge';
    }
  | { type: 'ready'; source: 'agentforge' }
  | {
      type: 'log';
      level: string;
      message: string;
      source: 'agentforge';
      logSource?: 'bridge' | 'renderer';
    };

// ─── Callback types for child-to-parent events ─────────────────────────────

export type NodeHoveredCallback = (
  nodeId: string | null,
  rect: { x: number; y: number; width: number; height: number } | null,
  catalogType: string | null,
) => void;

export type NodeClickedCallback = (
  nodeId: string,
  catalogType: string | null,
  computedStyles: Record<string, string>,
) => void;

export type RenderCompleteCallback = (
  success: boolean,
  nodeCount: number,
) => void;

// ─── Hook return type ───────────────────────────────────────────────────────

export interface UseRendererBridgeResult {
  /** Whether the iframe renderer has sent the 'ready' message */
  readonly isReady: boolean;
  /** Send a design spec JSON to the renderer for display */
  loadSpec: (specJson: string) => void;
  /** Send a prototype manifest + specs to the renderer for multi-screen mode */
  loadPrototype: (payload: string) => void;
  /** Enable interactive tagging mode in the renderer */
  enableTagging: () => void;
  /** Disable interactive tagging mode in the renderer */
  disableTagging: () => void;
  /** Highlight a specific node by ID in the renderer */
  highlightNode: (nodeId: string) => void;
  /** Clear all highlights in the renderer */
  clearHighlights: () => void;
  /** Update a single node's inline styles for live preview */
  updateNodeStyle: (nodeId: string, styles: Record<string, string>) => void;
  /** Register a callback for node hover events */
  onNodeHovered: (callback: NodeHoveredCallback | null) => void;
  /** Register a callback for node click events */
  onNodeClicked: (callback: NodeClickedCallback | null) => void;
  /** Register a callback for render-complete events */
  onRenderComplete: (callback: RenderCompleteCallback | null) => void;
}

// ─── Hook implementation ────────────────────────────────────────────────────

/**
 * Manages postMessage communication between the dashboard and an iframe
 * containing the browser renderer.
 *
 * Messages are filtered by `source === 'agentforge'` to ignore unrelated
 * postMessage traffic.
 */
export type OnLogCallback = (level: string, message: string, logSource?: 'bridge' | 'renderer') => void;

export interface UseRendererBridgeOptions {
  onLog?: OnLogCallback;
}

export function useRendererBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  options?: UseRendererBridgeOptions,
): UseRendererBridgeResult {
  const [isReady, setIsReady] = useState(false);
  const onLogRef = useRef<OnLogCallback | undefined>(options?.onLog);
  onLogRef.current = options?.onLog;

  // Callback refs — avoids re-registering the message listener on every change
  const onNodeHoveredRef = useRef<NodeHoveredCallback | null>(null);
  const onNodeClickedRef = useRef<NodeClickedCallback | null>(null);
  const onRenderCompleteRef = useRef<RenderCompleteCallback | null>(null);

  // ── Send a message to the iframe ──────────────────────────────────────────

  const postToIframe = useCallback(
    (message: ParentMessage) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(message, '*');
    },
    [iframeRef],
  );

  // ── Parent-to-child commands ──────────────────────────────────────────────

  const loadSpec = useCallback(
    (specJson: string) => {
      postToIframe({ type: 'load-spec', specJson, source: 'agentforge' });
    },
    [postToIframe],
  );

  const loadPrototype = useCallback(
    (payload: string) => {
      postToIframe({ type: 'load-prototype', payload, source: 'agentforge' });
    },
    [postToIframe],
  );

  const enableTagging = useCallback(() => {
    postToIframe({ type: 'enable-tagging', source: 'agentforge' });
  }, [postToIframe]);

  const disableTagging = useCallback(() => {
    postToIframe({ type: 'disable-tagging', source: 'agentforge' });
  }, [postToIframe]);

  const highlightNode = useCallback(
    (nodeId: string) => {
      postToIframe({ type: 'highlight-node', nodeId, source: 'agentforge' });
    },
    [postToIframe],
  );

  const clearHighlights = useCallback(() => {
    postToIframe({ type: 'clear-highlights', source: 'agentforge' });
  }, [postToIframe]);

  const updateNodeStyle = useCallback(
    (nodeId: string, styles: Record<string, string>) => {
      postToIframe({ type: 'update-node-style', nodeId, styles, source: 'agentforge' });
    },
    [postToIframe],
  );

  // ── Callback ref setters ──────────────────────────────────────────────────

  const onNodeHovered = useCallback((cb: NodeHoveredCallback | null) => {
    onNodeHoveredRef.current = cb;
  }, []);

  const onNodeClicked = useCallback((cb: NodeClickedCallback | null) => {
    onNodeClickedRef.current = cb;
  }, []);

  const onRenderComplete = useCallback((cb: RenderCompleteCallback | null) => {
    onRenderCompleteRef.current = cb;
  }, []);

  // ── Listen for child-to-parent messages ───────────────────────────────────

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const data = event.data as Record<string, unknown> | null;
      if (!data || data['source'] !== 'agentforge') return;

      const msg = data as unknown as ChildMessage;

      switch (msg.type) {
        case 'ready':
          setIsReady(true);
          onLogRef.current?.('INFO', 'Renderer iframe ready', 'bridge');
          break;

        case 'render-complete':
          onLogRef.current?.(
            msg.success ? 'INFO' : 'ERROR',
            `Render complete: success=${msg.success}, nodeCount=${msg.nodeCount}`,
            'bridge',
          );
          onRenderCompleteRef.current?.(msg.success, msg.nodeCount);
          break;

        case 'node-hovered':
          onNodeHoveredRef.current?.(msg.nodeId, msg.rect, msg.catalogType);
          break;

        case 'node-clicked':
          onNodeClickedRef.current?.(
            msg.nodeId,
            msg.catalogType,
            msg.computedStyles,
          );
          break;

        case 'log':
          onLogRef.current?.(msg.level, msg.message, msg.logSource ?? 'bridge');
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return {
    isReady,
    loadSpec,
    loadPrototype,
    enableTagging,
    disableTagging,
    highlightNode,
    clearHighlights,
    updateNodeStyle,
    onNodeHovered,
    onNodeClicked,
    onRenderComplete,
  };
}
