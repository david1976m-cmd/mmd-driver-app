import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_PUSH_TOKEN_KEY = "@matchmydriver:lastPushToken";

export async function saveLastPushToken(token: string): Promise<void> {
await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
}

export async function getLastPushToken(): Promise<string | null> {
return await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
}

export async function clearLastPushToken(): Promise<void> {
await AsyncStorage.removeItem(LAST_PUSH_TOKEN_KEY);
}