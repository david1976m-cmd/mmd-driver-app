import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MatchMyDriverApi, setUnauthorizedHandler } from "@/api/matchmydriver";
import { clearSession, loadSession, saveSession } from "@/services/tokenStore";
import type { DriverSession } from "@/types/matchmydriver";

type AuthState = {
session: DriverSession | null;
isLoadingSession: boolean;
loginError: string | null;
login: (email: string, password: string) => Promise<void>;
logout: () => Promise<void>;
clearLoginError: () => void;
};

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
const [session, setSession] = useState<DriverSession | null>(null);
const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
const [loginError, setLoginError] = useState<string | null>(null);

useEffect(() => {
  let isMounted = true;

  async function restoreSession(): Promise<void> {
    try {
      const storedSession = await loadSession();
      if (storedSession && isMounted) {
        setSession(storedSession);
      }
    } catch {
      await clearSession();
    } finally {
      if (isMounted) {
        setIsLoadingSession(false);
      }
    }
  }

  restoreSession();

  return () => {
    isMounted = false;
  };
}, []);

// Any 401 from the API layer clears the stored session so the driver is
// sent back to the login screen instead of making further failing requests.
useEffect(() => {
  setUnauthorizedHandler(() => {
    clearSession().catch(() => undefined);
    setSession(null);
  });
  return () => setUnauthorizedHandler(null);
}, []);

const login = useCallback(async (email: string, password: string): Promise<void> => {
  console.log(`[MMD-AUTH] login() called — email: "${email}", trimmed: "${email.trim()}"`);
  setLoginError(null);
  try {
    console.log(`[MMD-AUTH] Calling MatchMyDriverApi.login(...)`);
    const nextSession = await MatchMyDriverApi.login(email.trim(), password);
    console.log(`[MMD-AUTH] ✓ Login API call succeeded — driver: ${nextSession.driver.name}`);
    console.log(`[MMD-AUTH] Saving session to secure store...`);
    await saveSession(nextSession);
    console.log(`[MMD-AUTH] ✓ Session saved, setting state...`);
    setSession(nextSession);
    console.log(`[MMD-AUTH] ✓ Login complete`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inloggen is mislukt.";
    console.error(`[MMD-AUTH] ✖ Login failed: ${message}`);
    console.error(`[MMD-AUTH]   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    if (error instanceof Error && error.stack) {
      console.error(`[MMD-AUTH]   Stack:`, error.stack);
    }
    setLoginError(message);
    throw error;
  }
}, []);

const logout = useCallback(async (): Promise<void> => {
  await clearSession();
  setSession(null);
}, []);

const clearLoginError = useCallback((): void => {
  setLoginError(null);
}, []);

return useMemo(
  () => ({ session, isLoadingSession, loginError, login, logout, clearLoginError }),
  [session, isLoadingSession, loginError, login, logout, clearLoginError],
);
});