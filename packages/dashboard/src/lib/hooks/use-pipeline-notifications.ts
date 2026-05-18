'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { RunProgressState } from './use-run-progress';
import { useNotificationPreferences } from './use-notification-preferences';

function showBrowserNotification(title: string, body: string, enabled: boolean): void {
  if (!enabled) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/chip-icon.png' });
  }
}

function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function usePipelineNotifications(
  runId: string | null,
  progress: RunProgressState,
): { unreadCount: number; clearUnread: () => void } {
  const lastStage = useRef<string | null>(null);
  const lastStatus = useRef<string | null>(null);
  const hasRequestedPermission = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { prefs } = useNotificationPreferences();

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    if (!runId || !progress.status) return;

    if (!hasRequestedPermission.current && progress.status === 'running') {
      requestNotificationPermission();
      hasRequestedPermission.current = true;
    }

    if (progress.stage && progress.stage !== lastStage.current && progress.status === 'running') {
      if (lastStage.current !== null) {
        notifications.show({
          title: `${capitalize(progress.stage)} stage started`,
          message: progress.stageDescription ?? `Processing ${progress.stage}...`,
          color: 'blue',
          autoClose: 4000,
        });
        setUnreadCount((c) => c + 1);
      }
      lastStage.current = progress.stage;
    }

    if (progress.status !== lastStatus.current) {
      if (progress.status === 'complete') {
        const costStr = progress.cost
          ? ` — $${progress.cost.totalCostUsd.toFixed(3)}`
          : '';
        notifications.show({
          title: 'Pipeline complete',
          message: `All stages finished successfully${costStr}`,
          color: 'green',
          autoClose: 8000,
        });
        showBrowserNotification('CHIP — Pipeline complete', `All stages finished successfully${costStr}`, prefs.browserNotifications);
        setUnreadCount((c) => c + 1);
      } else if (progress.status === 'failed') {
        notifications.show({
          title: 'Pipeline failed',
          message: progress.error ?? 'An error occurred during execution',
          color: 'red',
          autoClose: 10000,
        });
        showBrowserNotification('CHIP — Pipeline failed', progress.error ?? 'An error occurred during execution', prefs.browserNotifications);
        setUnreadCount((c) => c + 1);
      }
      lastStatus.current = progress.status;
    }
  }, [runId, progress.status, progress.stage, progress.stageDescription, progress.cost, progress.error, prefs.browserNotifications]);

  return { unreadCount, clearUnread };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
