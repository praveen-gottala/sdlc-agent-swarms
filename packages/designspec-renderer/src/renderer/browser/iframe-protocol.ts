/**
 * Iframe communication protocol for the dashboard <-> browser renderer bridge.
 *
 * All messages include `source: 'agentforge'` so that listeners can
 * safely filter out unrelated postMessage traffic.
 */

// ─── Messages sent FROM the dashboard (parent) TO the renderer (iframe) ─────

export type ParentMessage =
  | { type: 'load-spec'; specJson: string; source: 'agentforge' }
  | { type: 'update-node-style'; nodeId: string; styles: Record<string, string>; source: 'agentforge' }
  | { type: 'enable-tagging'; source: 'agentforge' }
  | { type: 'disable-tagging'; source: 'agentforge' }
  | { type: 'highlight-node'; nodeId: string; source: 'agentforge' }
  | { type: 'clear-highlights'; source: 'agentforge' };

// ─── Messages sent FROM the renderer (iframe) TO the dashboard (parent) ─────

export type ChildMessage =
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
  | { type: 'log'; level: string; message: string; source: 'agentforge' };
