import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { ensureNotificationChannel, setNotificationBehavior } from "@/services/notifications";

const STORAGE_KEY = "@matchmydriver:notificationPreferences";

export type NotificationPreferences = {
pushEnabled: boolean;
soundEnabled: boolean;
vibrationEnabled: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
pushEnabled: true,
soundEnabled: true,
vibrationEnabled: true,
};

type NotificationPreferencesState = NotificationPreferences & {
isLoading: boolean;
setPushEnabled: (enabled: boolean) => Promise<void>;
setSoundEnabled: (enabled: boolean) => Promise<void>;
setVibrationEnabled: (enabled: boolean) => Promise<void>;
};

export const [NotificationPreferencesProvider, useNotificationPreferences] =
createContextHook<NotificationPreferencesState>(() => {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPreferences(): Promise<void> {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
          if (isMounted) {
            setPreferences({
              pushEnabled: parsed.pushEnabled ?? DEFAULT_PREFERENCES.pushEnabled,
              soundEnabled: parsed.soundEnabled ?? DEFAULT_PREFERENCES.soundEnabled,
              vibrationEnabled: parsed.vibrationEnabled ?? DEFAULT_PREFERENCES.vibrationEnabled,
            });
          }
        }
      } catch {
        // Corrupt or missing preference payload — fall back to defaults.
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: NotificationPreferences): Promise<void> => {
    setPreferences(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persisting settings is best-effort; in-memory state still applies.
    }
  }, []);

  const setPushEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      await persist({ ...preferences, pushEnabled: enabled });
    },
    [preferences, persist],
  );

  const setSoundEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      await persist({ ...preferences, soundEnabled: enabled });
    },
    [preferences, persist],
  );

  const setVibrationEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      await persist({ ...preferences, vibrationEnabled: enabled });
    },
    [preferences, persist],
  );

  useEffect(() => {
    if (isLoading) return;
    setNotificationBehavior({
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
    });
    ensureNotificationChannel().catch(() => undefined);
  }, [preferences.soundEnabled, preferences.vibrationEnabled, isLoading]);

  return {
    ...preferences,
    isLoading,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  };
});