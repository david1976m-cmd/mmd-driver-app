import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
Inter_400Regular,
Inter_500Medium,
Inter_600SemiBold,
Inter_700Bold,
Inter_800ExtraBold,
useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/contexts/auth-context";
import { NotificationPreferencesProvider } from "@/contexts/notifications-context";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
defaultOptions: {
  queries: {
    staleTime: 30_000,
  },
},
});

function RootLayoutNav() {
return (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="+not-found" />
  </Stack>
);
}

export default function RootLayout() {
const [fontsLoaded, fontError] = useFonts({
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
});

useEffect(() => {
  if (fontsLoaded || fontError) {
    SplashScreen.hideAsync();
  }
}, [fontsLoaded, fontError]);

if (!fontsLoaded && !fontError) {
  return null;
}

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NotificationPreferencesProvider>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <StatusBar style="dark" />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </NotificationPreferencesProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}