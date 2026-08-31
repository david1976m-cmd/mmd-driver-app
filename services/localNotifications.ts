import * as Notifications from "expo-notifications";

import { ANDROID_CHANNEL_ID } from "@/services/notifications";

/**
* Presents a local notification for a newly detected ride assignment.
*
* This runs entirely on-device — no server-side push delivery is required.
* Used for the foreground case: when the app is open and a new ride appears
* during a React Query refetch, the driver gets an immediate in-app alert.
*
* For background delivery (app closed), the backend polling service sends
* Expo Push Notifications via FCM — see `backendNotifications.ts`.
*/
export async function presentNewRideNotification(opts: {
 reference: string;
 pickupAddress: string;
 destinationAddress: string;
}): Promise<void> {
 try {
   await Notifications.scheduleNotificationAsync({
     content: {
       title: "Nieuwe ritopdracht",
       body: `${opts.reference}: ${opts.pickupAddress} \u2192 ${opts.destinationAddress}`,
       data: { reference: opts.reference },
       sound: true,
       vibrate: [0, 180, 120, 180],
       priority: Notifications.AndroidNotificationPriority.MAX,
     },
     trigger: null,
   });
 } catch {
   // Best-effort: if the notification cannot be scheduled (e.g. permissions
   // revoked since last check), fail silently — the in-app list still updates.
 }
}