import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { Platform } from "react-native";

import { useNotificationPreferences } from "@/contexts/notifications-context";
import {
  getBackendNotificationStatus,
  registerAllDriverAliases,
  registerForBackendNotifications,
  sendBackendTestNotification,
  setBackendForeground,
  unregisterFromBackendNotifications,
  updateFcmToken,
} from "@/services/backendNotifications";
import {
  checkNotificationPermission,
  getExpoPushToken,
  getFcmDeviceToken,
  requestNotificationPermission,
} from "@/services/notifications";
import { clearLastPushToken, getLastPushToken, saveLastPushToken } from "@/services/pushTokenStore";
import type { DriverSession } from "@/types/matchmydriver";

export type PushRegistrationState = "idle" | "registered" | "unavailable" | "failed" | "disabled" | "denied";

export type PushRegistrationResult = {
  state: PushRegistrationState;
  errorDetail: string | null;
  retry: () => void;
};

const PUSH_REGISTRATION_START_DELAY_MS = 1500;
const FOREGROUND_REGISTRATION_DELAY_MS = 2000;
const APP_STATE_REPORT_DEBOUNCE_MS = 500;
const REGISTRATION_RETRY_INTERVAL_MS = 60_000;
const FCM_TOKEN_BACKGROUND_RETRY_INTERVAL_MS = 30_000;
const FCM_TOKEN_BACKGROUND_MAX_ATTEMPTS = 20;

/**
 * Registers or unregisters this device for new-ride notifications based on the
 * driver's notification preferences and the OS permission state.
 *
 * Two layers work together:
 * 1. **Expo push token** — registered with the MatchMyDriver server (legacy).
 * 2. **Backend polling service** — a Cloudflare Durable Object polls the MMD
 *    API every 30 seconds and sends Expo Push Notifications when new rides
 *    appear. This is the reliable mechanism for background delivery on Android,
 *    because it runs server-side and is not affected by Doze mode or app
 *    termination.
 *
 * The registration is deferred slightly after the session becomes available to
 * give the React Native bridge and the notification native module time to
 * initialize, which prevents crashes on Android with the new architecture.
 *
 * If the backend registration fails (network error, server down), a retry timer
 * fires every 60 seconds until it succeeds — this is critical because without
 * the backend registration the poller never starts and the driver misses every
 * ride while the app is closed.
 */
export function usePushRegistration(session: DriverSession | null): PushRegistrationResult {
  const { pushEnabled, isLoading: isLoadingPreferences } = useNotificationPreferences();
  const [state, setState] = useState<PushRegistrationState>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function updateRegistration(): Promise<void> {
      if (!session) {
        if (isMounted) setState("idle");
        return;
      }

      if (isLoadingPreferences) {
        return;
      }

      if (!pushEnabled) {
        try {
          const lastToken = await getLastPushToken();
          if (lastToken) {
            await unregisterFromBackendNotifications(session.driver.id, session.driver.driverNumber);
            await clearLastPushToken();
          }
        } catch {
          // Unregister is best-effort; the token remains stored for a retry.
        }
        if (isMounted) {
          setState("disabled");
          setErrorDetail(null);
        }
        return;
      }

      // Expo's web preview cannot create a native Expo/FCM push token. The
      // preference toggle remains useful for the real mobile build, but the
      // status should not incorrectly imply that the browser denied access.
      if (Platform.OS === "web") {
        if (isMounted) {
          setState("unavailable");
          setErrorDetail("Pushmeldingen werken alleen in de mobiele app op een fysiek apparaat.");
        }
        return;
      }

      try {
        const hasPermission = await checkNotificationPermission();
        if (!hasPermission) {
          const granted = await requestNotificationPermission();
          if (!granted) {
            if (isMounted) {
              setState("denied");
              setErrorDetail("Meldingen zijn niet toegestaan op dit apparaat.");
            }
            return;
          }
        }

        let pushToken: string | undefined;
        try {
          pushToken = await getExpoPushToken();
        } catch (tokenError) {
          const tokenMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
          console.error("[PushRegistration] getExpoPushToken failed:", tokenMessage);
          if (tokenMessage.includes("FCM niet geconfigureerd") || tokenMessage.includes("FirebaseApp")) {
            if (isMounted) {
              setState("failed");
              setErrorDetail(
                "FCM niet geconfigureerd. Zorg dat expo/google-services.json een geldig Firebase-bestand bevat en app.json android.googleServicesFile correct verwijst. Druk op 'Opnieuw proberen' na vervangen van het bestand en een nieuwe build.",
              );
            }
            scheduleRetry();
            return;
          }
          if (isMounted) {
            setState("failed");
            setErrorDetail(`Push-token kon niet worden opgehaald: ${tokenMessage}`);
          }
          scheduleRetry();
          return;
        }

        if (!pushToken) {
          console.warn("[PushRegistration] no push token available — Device.isDevice? Check emulator");
          if (isMounted) {
            setState("unavailable");
            setErrorDetail("Geen push-token beschikbaar. Dit kan voorkomen op emulators of als het project geen push-rechten heeft.");
          }
          return;
        }

        console.log("[PushRegistration] ✓ token obtained", pushToken.slice(0, 30) + "...");
        console.log("[PushRegistration] driver.id:", session.driver.id, "driverNumber:", session.driver.driverNumber);

        // Fetch the native FCM device token for direct FCM delivery (WIF).
        // This bypasses Expo's push service, which requires a service-account
        // key that Google blocks for new Firebase projects.
        let fcmDeviceToken: string | undefined;
        try {
          fcmDeviceToken = await getFcmDeviceToken();
          if (fcmDeviceToken) {
            console.log("[PushRegistration] ✓ FCM device token obtained", fcmDeviceToken.slice(0, 20) + "...");
          } else {
            console.log("[PushRegistration] no FCM device token — will use Expo push fallback");
          }
        } catch (fcmErr) {
          console.warn("[PushRegistration] FCM device token fetch failed (non-fatal):", fcmErr);
        }

        const lastToken = await getLastPushToken();
        if (pushToken !== lastToken) {
          console.log("[PushRegistration] token changed (new vs last), registering fresh");
          // Register with the backend polling service under ALL driver ID aliases.
          // We do NOT register the push token with the MMD server anymore —
          // MMD would send its own duplicate push notification. The backend
          // FCM direct send (WIF) is the sole notification channel now.
          const { primary, aliases } = await registerAllDriverAliases(
            session.driver.id,
            session.driver.driverNumber,
            session.token,
            pushToken,
            fcmDeviceToken,
          );
          console.log("[PushRegistration] backend register — primary:", JSON.stringify(primary), "aliases:", JSON.stringify(aliases));
          if (!primary.ok) {
            console.warn("[PushRegistration] ✗ backend registration failed, will retry:", primary.error);
            if (isMounted) {
              setState("failed");
              setErrorDetail(`Backend: ${primary.error ?? "onbekende fout"}`);
            }
            scheduleRetry();
            return;
          }
          await saveLastPushToken(pushToken);
        } else {
          console.log("[PushRegistration] token unchanged, re-registering to arm poller");
          // Token unchanged — ensure the backend poller is still armed under all aliases.
          const { primary, aliases } = await registerAllDriverAliases(
            session.driver.id,
            session.driver.driverNumber,
            session.token,
            pushToken,
            fcmDeviceToken,
          );
          console.log("[PushRegistration] backend re-register — primary:", JSON.stringify(primary), "aliases:", JSON.stringify(aliases));
          if (!primary.ok) {
            console.warn("[PushRegistration] ✗ backend re-registration failed, will retry:", primary.error);
            if (isMounted) {
              setState("failed");
              setErrorDetail(`Backend: ${primary.error ?? "onbekende fout"}`);
            }
            scheduleRetry();
            return;
          }
        }

        // Check the backend status — but DON'T fail if polling is false yet.
        // The backend starts polling immediately on register, but the immediate
        // poll may set is_polling=0 if MMD returns 401 (server-side token check).
        // The registration itself (ok:true) is the source of truth — the poller
        // will keep retrying even if the first poll fails.
        const status = await getBackendNotificationStatus(session.driver.id);
        console.log("[PushRegistration] backend status:", JSON.stringify(status));

        if (status.registered) {
          // Registration succeeded — consider it a success even if the first
          // poll hasn't completed yet (polling flag may lag by a few seconds).
          if (isMounted) {
            setState("registered");
            setErrorDetail(null);
          }
          if (!status.polling) {
            console.warn("[PushRegistration] ⚠ registered but polling=false — backend may have hit 401 on initial poll. Will re-register to re-arm.");
            // Re-register once to re-arm the alarm — the 401 may have been transient.
            const { primary } = await registerAllDriverAliases(
              session.driver.id,
              session.driver.driverNumber,
              session.token,
              pushToken,
              fcmDeviceToken,
            );
            console.log("[PushRegistration] re-arm attempt result:", JSON.stringify(primary));
          }
        } else {
          console.warn("[PushRegistration] ✗ not registered, retrying");
          const { primary } = await registerAllDriverAliases(
            session.driver.id,
            session.driver.driverNumber,
            session.token,
            pushToken,
            fcmDeviceToken,
          );
          if (primary.ok && isMounted) {
            setState("registered");
            setErrorDetail(null);
          } else if (isMounted) {
            setState("failed");
            setErrorDetail(`Backend niet actief: ${primary.error ?? "onbekende fout"}`);
            scheduleRetry();
          }
        }
      } catch (error) {
        console.error("[PushRegistration] registration failed:", error);
        if (isMounted) {
          setState("failed");
          setErrorDetail(error instanceof Error ? error.message : "Onbekende fout");
        }
        scheduleRetry();
      }
    }

    function scheduleRetry(): void {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (isMounted && session && pushEnabled) {
          console.log("[PushRegistration] retrying backend registration...");
          updateRegistration();
        }
      }, REGISTRATION_RETRY_INTERVAL_MS);
    }

    // Wait a moment before touching native notification modules so the bridge
    // is fully ready. Also bail out if the app went to the background already.
    const timer = setTimeout(() => {
      if (AppState.currentState === "background") return;
      updateRegistration();
    }, PUSH_REGISTRATION_START_DELAY_MS);

    // Re-register when the app comes back to the foreground — this covers the
    // case where the backend poller was lost after a long idle period.
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      setTimeout(() => {
        if (isMounted) updateRegistration();
      }, FOREGROUND_REGISTRATION_DELAY_MS);
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      subscription.remove();
    };
  }, [session, pushEnabled, isLoadingPreferences, retryTrigger]);

  // --- Background FCM token retry ---
  // After registration succeeds, the FCM device token may still be missing
  // because Firebase hadn't finished initializing when we first tried. Without
  // it, the backend falls back to Expo Push, which fails for new Firebase
  // projects ("Unable to retrieve FCM server key"). This effect keeps retrying
  // until the FCM token is obtained and sent to the backend via the
  // /notifications/update-fcm-token endpoint. Once the token is stored, the
  // backend uses FCM direct send (WIF), which works even when the app is
  // fully closed.
  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    async function tryGetAndSendFcmToken(): Promise<void> {
      if (!session || !pushEnabled) return;
      if (state !== "registered") return;

      attempt++;
      console.log(`[PushRegistration] FCM background retry attempt ${attempt}/${FCM_TOKEN_BACKGROUND_MAX_ATTEMPTS}`);

      let fcmDeviceToken: string | undefined;
      try {
        fcmDeviceToken = await getFcmDeviceToken();
      } catch (err) {
        console.warn(`[PushRegistration] FCM background retry ${attempt} failed:`, err);
      }

      if (!fcmDeviceToken) {
        if (attempt < FCM_TOKEN_BACKGROUND_MAX_ATTEMPTS) {
          retryTimer = setTimeout(() => {
            if (isMounted) tryGetAndSendFcmToken();
          }, FCM_TOKEN_BACKGROUND_RETRY_INTERVAL_MS);
        } else {
          console.warn(`[PushRegistration] FCM background retries exhausted after ${attempt} attempts — push will use Expo fallback (may fail for closed app)`);
        }
        return;
      }

      console.log(`[PushRegistration] ✓ FCM token obtained on attempt ${attempt}, sending to backend`);

      // Send the FCM token to the backend for the primary driver ID and all aliases
      const updates: Promise<unknown>[] = [
        updateFcmToken(session.driver.id, fcmDeviceToken),
      ];
      if (session.driver.driverNumber && session.driver.driverNumber !== session.driver.id) {
        updates.push(updateFcmToken(session.driver.driverNumber, fcmDeviceToken));
      }
      try {
        const results = await Promise.all(updates);
        console.log(`[PushRegistration] ✓ FCM token updated on backend:`, JSON.stringify(results));
      } catch (err) {
        console.warn("[PushRegistration] FCM token update failed (non-fatal, will retry):", err);
        if (attempt < FCM_TOKEN_BACKGROUND_MAX_ATTEMPTS) {
          retryTimer = setTimeout(() => {
            if (isMounted) tryGetAndSendFcmToken();
          }, FCM_TOKEN_BACKGROUND_RETRY_INTERVAL_MS);
        }
      }
    }

    // Start retrying only after registration is successful
    if (state === "registered" && session && pushEnabled) {
      const timer = setTimeout(() => {
        if (isMounted) tryGetAndSendFcmToken();
      }, 3000);
      return () => {
        isMounted = false;
        clearTimeout(timer);
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [state, session, pushEnabled]);

  // --- Report foreground/background state to the backend ---
  // When the app moves to the background the backend slows down polling from
  // 30s to 120s to reduce load on the MMD API. Webhooks remain instant. The
  // call is best-effort: a failure only affects polling cadence, not push
  // delivery.
  useEffect(() => {
    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSentState: boolean | null = null;

    async function reportForeground(foreground: boolean): Promise<void> {
      if (!isMounted || !session) return;
      if (foreground === lastSentState) return;
      try {
        const result = await setBackendForeground(session.driver.id, foreground);
        if (result.ok) {
          lastSentState = foreground;
        }
      } catch (err) {
        console.warn("[PushRegistration] setForeground failed:", err);
      }
    }

    function onAppStateChange(nextAppState: string): void {
      const foreground = nextAppState === "active";
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isMounted) reportForeground(foreground);
      }, APP_STATE_REPORT_DEBOUNCE_MS);
    }

    // Report initial state immediately if the app is already running.
    onAppStateChange(AppState.currentState);

    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      subscription.remove();
    };
  }, [session]);

  const retry = useCallback((): void => {
    setRetryTrigger((n) => n + 1);
  }, []);

  return { state, errorDetail, retry };
}

/**
 * Sends a test push notification through the backend poller. Useful for
 * verifying that the device token, notification channel, and backend are all
 * wired correctly without waiting for a real ride to appear.
 */
export async function sendTestPushNotification(
  session: DriverSession | null,
): Promise<{ ok: boolean; message: string }> {
  if (!session) {
    return { ok: false, message: "Geen actieve chauffeurssessie." };
  }

  try {
    const pushToken = await getExpoPushToken();
    const result = await sendBackendTestNotification(session.driver.id, pushToken ?? undefined);
    console.log("[PushRegistration] test push result:", result);
    if (!result.ok) {
      return { ok: false, message: result.error ?? "Backend kon de testmelding niet versturen." };
    }
    if (result.sent === false) {
      // The backend accepted the request but Expo rejected the push delivery.
      // Surface the underlying Expo/FCM error so the user knows what to fix.
      const expoError = result.error ?? "Expo kon de melding niet versturen.";
      return {
        ok: false,
        message: `Melding niet verstuurd: ${expoError}`,
      };
    }
    return { ok: true, message: "Testmelding verstuurd." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { ok: false, message };
  }
}
