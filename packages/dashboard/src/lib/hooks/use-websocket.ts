'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Parsed WebSocket event from the server */
export interface WsEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: number;
}

/** Callback for WebSocket event subscriptions */
export type WsEventCallback = (event: WsEvent) => void;

/** Return type for the useWebSocket hook */
export interface UseWebSocketResult {
  /** Whether the WebSocket is currently connected */
  readonly connected: boolean;
  /** The last event received from the server */
  readonly lastEvent: WsEvent | null;
  /** Subscribe to a specific event type; returns an unsubscribe function */
  subscribe: (eventType: string, callback: WsEventCallback) => () => void;
}

// Canonical default: DEFAULT_SERVICE_URLS.dashboardWs in @agentforge/core
const DEFAULT_WS_URL = 'ws://localhost:3001/ws';
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

/**
 * WebSocket connection hook with auto-reconnect and exponential backoff.
 *
 * Currently returns a mock connected state since there is no server.
 * When a real server is available, set `useMock` to false.
 */
export function useWebSocket(
  url: string = DEFAULT_WS_URL,
  options: { useMock?: boolean } = {},
): UseWebSocketResult {
  const { useMock = true } = options;

  const [connected, setConnected] = useState(useMock);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const subscribersRef = useRef<Map<string, Set<WsEventCallback>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((event: WsEvent) => {
    setLastEvent(event);
    const callbacks = subscribersRef.current.get(event.type);
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
  }, []);

  const connect = useCallback(() => {
    if (useMock) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (messageEvent: MessageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data as string) as WsEvent;
          dispatch(data);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      scheduleReconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, useMock, dispatch]);

  const scheduleReconnect = useCallback(() => {
    if (useMock) return;

    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectAttemptRef.current = attempt + 1;

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [useMock, connect]);

  useEffect(() => {
    if (!useMock) {
      connect();
    }

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, useMock]);

  const subscribe = useCallback(
    (eventType: string, callback: WsEventCallback): (() => void) => {
      if (!subscribersRef.current.has(eventType)) {
        subscribersRef.current.set(eventType, new Set());
      }
      const callbacks = subscribersRef.current.get(eventType)!;
      callbacks.add(callback);

      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          subscribersRef.current.delete(eventType);
        }
      };
    },
    [],
  );

  return { connected, lastEvent, subscribe };
}
