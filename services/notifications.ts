import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Firebase native module — injected by the google-services.json plugin.
// On Android, this gives access to the raw FCM device token which we send
// directly to the backend for Workload Identity Federation push delivery.
// On iOS / web / emulator this is undefined.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FirebaseMessaging: any = (global as any)?.firebase?.messaging ?? (global as any)?.messaging;

const ANDROID_CHANNEL_RETRY_DELAY_MS = 500;
const ANDROID_CHANNEL_MAX_RETRIES = 3;
export const ANDROID_CHANNEL_ID = "new-rides";

export type NotificationBehavior = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

let currentBehavior: NotificationBehavior = {
  soundEnabled: true,
  vibrationEnabled: true,
};

/**
 * Synchronously registers the notification handler callback.
 *
 * Safe to call at module-load time: it only stores a callback, it does not
 * touch native modules. Native channel creation is deferred until the app is
 * running (see `ensureNotificationChannel` / `getExpoPushToken`).
 */
function registerNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: currentBehavior.soundEnabled,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Creates/updates the Android notification channel matching the current
 * vibration preference. Must be called after the React Native bridge is
 * ready (i.e. from a component effect or an event handler), NOT at
 * module-load time — calling it during bundle evaluation can crash the app
 * on Android with the new architecture enabled.
 *
 * Errors are swallowed: if the channel cannot be created (e.g. the native
 * module is not ready yet), the app keeps running and push registration
 * will continue with the default channel configured by expo-notifications.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  for (let attempt = 1; attempt <= ANDROID_CHANNEL_MAX_RETRIES; attempt++) {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Nieuwe ritopdrachten",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        enableVibrate: true,
        vibrationPattern: currentBehavior.vibrationEnabled ? [0, 180, 120, 180] : undefined,
        lightColor: "#3b82f6",
      });
      return;
    } catch {
      if (attempt === ANDROID_CHANNEL_MAX_RETRIES) return;
      await new Promise((resolve) => setTimeout(resolve, ANDROID_CHANNEL_RETRY_DELAY_MS));
    }
  }
}

/** Updates the native notification presentation layer to match driver preferences. */
export function setNotificationBehavior(behavior: NotificationBehavior): void {
  currentBehavior = { ...behavior };
  registerNotificationHandler();
}

// Only register the handler callback at module load. Native channel creation
// is deferred until the app is running to avoid an Android startup crash.
registerNotificationHandler();

/** Checks whether the user has granted notification permission. */
export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/** Requests notification permission from the user. */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Requests notification permission and returns this installation's Expo push token when available.
 *
 * On Android standalone/release builds the Expo push token depends on FCM. If
 * `google-services.json` is missing or invalid, Firebase throws
 * "Default FirebaseApp is not initialized". We detect that specific error and
 * throw a clear, actionable error so the UI can guide the user to fix their
 * Firebase configuration instead of showing a raw native stack trace.
 */
export async function getExpoPushToken(): Promise<string | undefined> {
  if (Platform.OS === "android") {
    await ensureNotificationChannel();
  }

  if (!Device.isDevice) {
    return undefined;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return undefined;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_PROJECT_ID;
  if (!projectId) {
    return undefined;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("FirebaseApp is not initialized") ||
      message.includes("Default FirebaseApp") ||
      message.includes("fcm-credentials")
    ) {
      throw new Error(
        "FCM niet geconfigureerd. Voeg een geldig google-services.json toe in expo/google-services.json en koppel het in app.json (android.googleServicesFile). Zie https://docs.expo.dev/push-notifications/fcm-credentials/.",
      );
    }
    throw error;
  }
}

/**
 * Retrieves the native FCM device registration token on Android.
 *
 * This token is what the backend uses to send push notifications directly
 * via the FCM HTTP v1 API (Workload Identity Federation), bypassing Expo's
 * push service entirely. This is necessary because Google blocks
 * service-account key creation for new Firebase projects, which Expo needs
 * for its Android push delivery.
 *
 * CRITICAL: Without this token, the backend cannot send push notifications
 * when the app is closed — Expo Push fails with "Unable to retrieve FCM
 * server key" for new Firebase projects. The FCM direct send path (WIF)
 * is the ONLY reliable way to deliver push to a closed app.
 *
 * Firebase initialization is asynchronous and may not be ready immediately
 * after app launch. We retry up to 6 times with increasing delays to give
 * Firebase time to initialize and generate the token.
 *
 * Returns undefined on iOS, web, emulators, or if Firebase Messaging is
 * not available after all retries. The caller should retry later.
 */
const FCM_TOKEN_RETRY_DELAYS_MS = [0, 2000, 4000, 6000, 8000, 10000];

export async function getFcmDeviceToken(): Promise<string | undefined> {
  if (Platform.OS !== "android") return undefined;
  if (!Device.isDevice) return undefined;

  console.log("[Notifications] getFcmDeviceToken() called");

  for (let attempt = 0; attempt < FCM_TOKEN_RETRY_DELAYS_MS.length; attempt++) {
    const delay = FCM_TOKEN_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      console.log(`[Notifications] FCM token retry ${attempt + 1}/${FCM_TOKEN_RETRY_DELAYS_MS.length}, waiting ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Approach 1: If Firebase Messaging native module is available
    if (FirebaseMessaging?.getToken) {
      try {
        const fcmToken = await FirebaseMessaging.getToken();
        console.log(`[Notifications] attempt ${attempt + 1} FirebaseMessaging.getToken result: ${fcmToken ? fcmToken.slice(0, 30) + "..." : "null"}`);
        if (fcmToken) {
          return fcmToken;
        }
      } catch (err) {
        console.warn(`[Notifications] attempt ${attempt + 1} FirebaseMessaging.getToken failed:`, err);
      }
    } else {
      console.log(`[Notifications] attempt ${attempt + 1} FirebaseMessaging native module not available`);
    }

    // Approach 2: expo-notifications device push token (Android FCM)
    // On Android with google-services.json configured, this returns the raw
    // FCM token that Firebase assigned to this device.
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      console.log(`[Notifications] attempt ${attempt + 1} getDevicePushTokenAsync result: type=${deviceToken?.type}, data=${deviceToken?.data ? String(deviceToken.data).slice(0, 40) + "..." : "null"}`);

      // Accept the token regardless of type string — some Expo versions
      // report type as "fcm", others as "android" or "gcm". The important
      // thing is that we got a non-empty data string on Android.
      if (deviceToken?.data && typeof deviceToken.data === "string" && deviceToken.data.length > 10) {
        console.log(`[Notifications] FCM device token accepted (type=${deviceToken.type}, len=${deviceToken.data.length})`);
        return deviceToken.data;
      }
    } catch (err) {
      console.warn(`[Notifications] attempt ${attempt + 1} getDevicePushTokenAsync failed:`, err);
    }
  }

  console.warn(`[Notifications] No FCM device token obtained after ${FCM_TOKEN_RETRY_DELAYS_MS.length} attempts — will fall back to Expo push (which may fail for new Firebase projects)`);
  return undefined;
}
