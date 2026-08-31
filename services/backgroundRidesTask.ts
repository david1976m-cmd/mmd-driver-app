import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { MatchMyDriverApi } from "@/api/matchmydriver";
import { presentNewRideNotification } from "@/services/localNotifications";
import { loadSession } from "@/services/tokenStore";
import { ensureNotificationChannel } from "@/services/notifications";
import type { RideAssignment } from "@/types/matchmydriver";

const BACKGROUND_RIDES_TASK = "matchmydriver-background-rides-check";
const PREFERENCES_KEY = "@matchmydriver:notificationPreferences";

/** Storage key shared with the foreground UI to avoid duplicate notifications. */
export const KNOWN_RIDE_IDS_KEY = "@matchmydriver:backgroundKnownRideIds";

type StoredPreferences = {
 pushEnabled?: boolean;
 soundEnabled?: boolean;
 vibrationEnabled?: boolean;
};

/**
* Background task that polls MatchMyDriver for new open rides and raises a
* local notification when a ride appears that was not seen before.
*
* This task runs independently of the foreground UI, so drivers receive alerts
* even when the app is closed (subject to Android battery/Doze policy).
*/
TaskManager.defineTask(BACKGROUND_RIDES_TASK, async () => {
 try {
   const session = await loadSession();
   if (!session) {
     return BackgroundFetch.BackgroundFetchResult.NoData;
   }

   const rawPreferences = await AsyncStorage.getItem(PREFERENCES_KEY);
   const preferences: StoredPreferences = rawPreferences ? (JSON.parse(rawPreferences) as StoredPreferences) : {};
   if (preferences.pushEnabled === false) {
     return BackgroundFetch.BackgroundFetchResult.NoData;
   }

   await ensureNotificationChannel();

   const rides = await MatchMyDriverApi.getOpenRides(session.token);
   const currentIds = rides.map((r: RideAssignment) => r.id);

   const rawKnownIds = await AsyncStorage.getItem(KNOWN_RIDE_IDS_KEY);
   const knownIds: string[] = rawKnownIds ? (JSON.parse(rawKnownIds) as string[]) : [];

   const newRides = rides.filter((r: RideAssignment) => !knownIds.includes(r.id));

   if (newRides.length > 0) {
     for (const ride of newRides) {
       await presentNewRideNotification({
         reference: ride.reference,
         pickupAddress: ride.pickupAddress,
         destinationAddress: ride.destinationAddress,
       });
     }
   }

   await AsyncStorage.setItem(KNOWN_RIDE_IDS_KEY, JSON.stringify(currentIds));

   return newRides.length > 0
     ? BackgroundFetch.BackgroundFetchResult.NewData
     : BackgroundFetch.BackgroundFetchResult.NoData;
 } catch (error) {
   // Best-effort: don't crash the headless task. Android will retry later.
   return BackgroundFetch.BackgroundFetchResult.Failed;
 }
});

/** Registers the background rides check if it is not already registered. */
export async function registerBackgroundRidesTask(): Promise<void> {
 const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_RIDES_TASK);
 if (isRegistered) return;

 await BackgroundFetch.registerTaskAsync(BACKGROUND_RIDES_TASK, {
   minimumInterval: 15 * 60, // 15 minutes (in seconds)
   stopOnTerminate: false, // Android: keep checking after the user swipes the app away
   startOnBoot: true, // Android: restart after device reboot
 });
}

/** Unregisters the background rides check. */
export async function unregisterBackgroundRidesTask(): Promise<void> {
 const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_RIDES_TASK);
 if (!isRegistered) return;

 await BackgroundFetch.unregisterTaskAsync(BACKGROUND_RIDES_TASK);
}

/** Checks whether the background rides task is currently registered. */
export async function isBackgroundRidesTaskRegistered(): Promise<boolean> {
 return TaskManager.isTaskRegisteredAsync(BACKGROUND_RIDES_TASK);
}