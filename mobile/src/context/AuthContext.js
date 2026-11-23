import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setSession } from "../services/session";
import {
  apiChangePassword,
  apiDeleteAccount,
  apiMe,
  apiSignIn,
  apiSignUp,
  apiUpdateName,
} from "../services/api";

const TOKEN_KEY = "deepfake_token";
const USER_KEY = "deepfake_user";
const DEVICE_KEY = "deepfake_device_id";

const AuthContext = createContext(null);

// Secure storage can fail on odd devices; the app must keep working without it.
async function secureGet(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return null;
  }
}
async function secureSet(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {}
}
async function secureDelete(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {}
}

function newDeviceId() {
  const part = () => Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `dev-${part()}${part()}${part()}`; // letters, digits and dashes only, 8-64 long
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // On app start: find this phone's id, and restore a saved login if there is one
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let deviceId = await secureGet(DEVICE_KEY);
      if (!deviceId) {
        deviceId = newDeviceId();
        await secureSet(DEVICE_KEY, deviceId);
      }
      const token = await secureGet(TOKEN_KEY);
      setSession({ deviceId, token });

      let restored = null;
      if (token) {
        try {
          restored = await apiMe();
          await secureSet(USER_KEY, JSON.stringify(restored));
        } catch (e) {
          if (e.kind === "auth") {
            // the saved login has expired or is no longer valid
            await secureDelete(TOKEN_KEY);
            await secureDelete(USER_KEY);
            setSession({ token: null });
          } else {
            // server unreachable right now: trust the saved copy of the user
            const cached = await secureGet(USER_KEY);
            try {
              restored = cached ? JSON.parse(cached) : null;
            } catch (err) {
              restored = null;
            }
          }
        }
      }
      if (!cancelled) {
        setUser(restored);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishLogin = useCallback(async (response) => {
    await secureSet(TOKEN_KEY, response.access_token);
    await secureSet(USER_KEY, JSON.stringify(response.user));
    setSession({ token: response.access_token });
    setUser(response.user);
    return response.user;
  }, []);

  const signIn = useCallback(async ({ email, password }) => finishLogin(await apiSignIn({ email, password })), [finishLogin]);

  const signUp = useCallback(
    async ({ name, email, password }) => finishLogin(await apiSignUp({ name, email, password })),
    [finishLogin]
  );

  const signOut = useCallback(async () => {
    await secureDelete(TOKEN_KEY);
    await secureDelete(USER_KEY);
    setSession({ token: null });
    setUser(null);
  }, []);

  // Deletes the account on the server, then clears everything this phone kept for it.
  // Throws (and changes nothing) if the server refuses, e.g. a wrong password.
  const deleteAccount = useCallback(
    async (password) => {
      const id = user?.id;
      await apiDeleteAccount(password);
      if (id) {
        // the history screen's saved copies for this user (keys match HistoryContext)
        await AsyncStorage.multiRemove([`deepfake_scan_uris_${id}`, `deepfake_scan_cache_${id}`]).catch(() => {});
      }
      await signOut();
    },
    [user, signOut]
  );

    // Changes the display name and keeps the saved copy of the user up to date
  const updateName = useCallback(async (name) => {
    const updated = await apiUpdateName(name);
    await secureSet(USER_KEY, JSON.stringify(updated));
    setUser(updated);
    return updated;
  }, []);

  // Throws (and changes nothing) if the server refuses, e.g. a wrong current password
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await apiChangePassword({ currentPassword, newPassword });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, ready, signIn, signUp, signOut, deleteAccount, updateName, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}