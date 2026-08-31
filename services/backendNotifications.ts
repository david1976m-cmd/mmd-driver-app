/**
 * Backend polling service URL.
 *
 * The notification poller is an existing MatchMyDriver service. Keep its
 * address configurable so preview and production builds can use the correct
 * environment without embedding credentials in the app.
 */
const BACKEND_URL =
  process.env.EXPO_PUBLIC_NOTIFICATIONS_BACKEND_URL ??
  process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ??
  "https://matchmydriver-driver-app-clone-backend.rork.app";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Log the resolved backend URL once at module load so we can verify it in logs.
console.log(`[BackendNotifications] BACKEND_URL resolved to: ${BACKEND_URL}`);

type BackendResult = {
  ok?: boolean;
  error?: string;
  polling?: boolean;
  registered?: boolean;
  sent?: boolean;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper around fetch that retries on network errors. The backend is the
 * critical link for background push — a transient network failure should not
 * silently swallow the registration, because without it the poller never starts
 * and the driver misses every ride while the app is closed.
 */
async function fetchWithRetry(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<BackendResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const fullUrl = `${BACKEND_URL}${path}`;
    try {
      console.log(`[BackendNotifications] ${method} ${fullUrl} (attempt ${attempt}/${MAX_RETRIES})`);
      if (body) {
        const safeBody = { ...body } as Record<string, unknown>;
        if (safeBody.pushToken) safeBody.pushToken = String(safeBody.pushToken).slice(0, 30) + "...";
        if (safeBody.sessionToken) safeBody.sessionToken = "***";
        console.log(`[BackendNotifications]   body:`, JSON.stringify(safeBody));
      }

      const response = await fetch(fullUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      console.log(`[BackendNotifications]   response status: ${response.status} ${response.statusText}`);

      const text = await response.text();
      console.log(`[BackendNotifications]   response body (${text.length} chars): ${text.substring(0, 300)}`);

      let data: BackendResult = {};
      try {
        data = JSON.parse(text) as BackendResult;
      } catch {
        // Non-JSON response — fall back to status-based result.
      }

      if (!response.ok) {
        lastError = data.error ?? `HTTP ${response.status}`;
        if (attempt < MAX_RETRIES) {
          console.warn(
            `[BackendNotifications] ✗ ${method} ${path} failed (${lastError}), retry ${attempt}/${MAX_RETRIES}`,
          );
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        console.error(`[BackendNotifications] ✗ ${method} ${path} all retries exhausted: ${lastError}`);
        return { ok: false, error: lastError };
      }

      console.log(`[BackendNotifications] ✓ ${method} ${path} success:`, JSON.stringify(data).substring(0, 200));
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Netwerkfout";
      console.error(`[BackendNotifications] ✗ ${method} ${path} network error (attempt ${attempt}): ${lastError}`);
      if (error instanceof Error && error.stack) {
        console.error(`[BackendNotifications]   stack:`, error.stack.substring(0, 500));
      }
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  console.error(`[BackendNotifications] ✗ ${method} ${path} all ${MAX_RETRIES} attempts failed: ${lastError}`);
  return { ok: false, error: lastError ?? "Onbekende fout" };
}

/**
 * Registers this driver with the backend polling service.
 *
 * The backend creates a Durable Object that polls the MatchMyDriver API every
 * 30 seconds and sends Expo Push Notifications when new rides appear — even
 * when the app is fully closed. This is the reliable mechanism for background
 * push delivery on Android (unlike expo-background-fetch, which is killed by
 * Doze mode).
 *
 * Idempotent: re-registering updates the stored tokens and re-arms the alarm.
 */
export async function registerForBackendNotifications(
  driverId: string,
  sessionToken: string,
  pushToken: string,
  fcmDeviceToken?: string,
  polling = true,
  primaryDriverId?: string,
): Promise<BackendResult> {
  return fetchWithRetry("/notifications/register", "POST", {
    driverId,
    sessionToken,
    pushToken,
    fcmDeviceToken,
    polling,
    primaryDriverId,
  });
}

/**
 * Registers this driver under ALL known ID aliases so that whichever ID
 * MatchMyDriver uses in its webhook call, the backend Durable Object for that
 * ID will have the push token and can send the notification.
 *
 * Aliases registered:
 *   - driver.id (primary, used for polling)
 *   - driver.driverNumber (e.g. "MMD-000005", what MMD might send in webhooks)
 *
 * The primary ID gets the full polling registration; aliases get a lightweight
 * registration with just the push token so the webhook can deliver pushes.
 */
export async function registerAllDriverAliases(
  driverId: string,
  driverNumber: string | undefined,
  sessionToken: string,
  pushToken: string,
  fcmDeviceToken?: string,
): Promise<{ primary: BackendResult; aliases: BackendResult[] }> {
  // Register the primary ID with polling enabled — this is the only DO
  // that polls the MMD API and sends push notifications for new rides.
  const primary = await registerForBackendNotifications(driverId, sessionToken, pushToken, fcmDeviceToken, true);

  // Register under driver_number alias WITHOUT polling. The alias only
  // stores the push token so that if MMD sends a webhook keyed by
  // driver_number, the DO can forward the ride to the primary DO which
  // handles dedup and pushes. This prevents duplicate pushes.
  const aliases: BackendResult[] = [];
  if (driverNumber && driverNumber !== driverId) {
    console.log(`[BackendNotifications] registering alias driverNumber=${driverNumber} (no polling, primary=${driverId})`);
    const aliasResult = await registerForBackendNotifications(driverNumber, sessionToken, pushToken, fcmDeviceToken, false, driverId);
    aliases.push(aliasResult);
  }

  return { primary, aliases };
}

/**
 * Unregisters this driver from the backend polling service.
 *
 * Stops the alarm and clears the stored registration. Also unregisters any
 * aliases (driver_number) so they don't linger with stale push tokens.
 * Best-effort: errors are swallowed because the backend also self-cleans when
 * the MMD session expires.
 */
export async function unregisterFromBackendNotifications(
  driverId: string,
  driverNumber?: string,
): Promise<BackendResult> {
  const primary = await fetchWithRetry("/notifications/unregister", "POST", { driverId });
  if (driverNumber && driverNumber !== driverId) {
    await fetchWithRetry("/notifications/unregister", "POST", { driverId: driverNumber });
  }
  return primary;
}

/**
 * Returns the backend polling status for this driver.
 */
export async function getBackendNotificationStatus(
  driverId: string,
): Promise<BackendResult> {
  return fetchWithRetry(
    `/notifications/status?driverId=${encodeURIComponent(driverId)}`,
    "GET",
  );
}

/**
 * Updates the FCM device token for an existing registration without
 * restarting the poller. Called by the app when Firebase finishes
 * initialization and the FCM token becomes available — potentially
 * long after the initial registration where fcmDeviceToken was undefined.
 *
 * This is critical: without an FCM token, the backend falls back to Expo
 * Push, which fails for new Firebase projects ("Unable to retrieve FCM
 * server key"). With the FCM token, the backend uses FCM direct send (WIF),
 * which works even when the app is fully closed.
 */
export async function updateFcmToken(
  driverId: string,
  fcmDeviceToken: string,
): Promise<BackendResult> {
  return fetchWithRetry("/notifications/update-fcm-token", "POST", {
    driverId,
    fcmDeviceToken,
  });
}

/**
 * Asks the backend to send a test push notification immediately.
 */
export async function sendBackendTestNotification(
  driverId: string,
  pushToken?: string,
): Promise<BackendResult> {
  return fetchWithRetry("/notifications/test", "POST", {
    driverId,
    pushToken,
  });
}

/**
 * Informs the backend whether the app is currently in the foreground.
 *
 * When the app is in the background the backend slows down polling from 30s to
 * 120s to reduce load on the MMD API. Webhook delivery remains instant. This
 * call is best-effort and is not retried aggressively because it only affects
 * polling cadence, not push delivery.
 */
export async function setBackendForeground(
  driverId: string,
  foreground: boolean,
): Promise<BackendResult> {
  return fetchWithRetry("/notifications/set-foreground", "POST", {
    driverId,
    foreground,
  });
}
