import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { DriverSession } from "@/types/matchmydriver";

const SESSION_KEY = "matchmydriver.driverSession";

export async function saveSession(session: DriverSession): Promise<void> {
  const serializedSession = JSON.stringify(session);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(SESSION_KEY, serializedSession);
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, serializedSession, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function loadSession(): Promise<DriverSession | null> {
  const raw =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(SESSION_KEY)
      : await SecureStore.getItemAsync(SESSION_KEY);
if (!raw) return null;
try {
  return JSON.parse(raw) as DriverSession;
} catch {
  await clearSession();
  return null;
}
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}