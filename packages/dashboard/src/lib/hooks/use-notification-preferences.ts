'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'chip-notification-prefs';

export interface NotificationPreferences {
  browserNotifications: boolean;
  soundEnabled: boolean;
}

const DEFAULTS: NotificationPreferences = {
  browserNotifications: true,
  soundEnabled: false,
};

function load(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...(JSON.parse(stored) as Partial<NotificationPreferences>) };
  } catch { /* use defaults */ }
  return DEFAULTS;
}

export function useNotificationPreferences(): {
  prefs: NotificationPreferences;
  update: (patch: Partial<NotificationPreferences>) => void;
} {
  const [prefs, setPrefs] = useState<NotificationPreferences>(load);

  const update = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { prefs, update };
}
