import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "deepfake_settings";
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [state, setState] = useState({ videoQuality: "quick", guestScansUsed: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState((s) => ({ ...s, ...JSON.parse(raw) }));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state, loaded]);

  const setVideoQuality = (quality) => setState((s) => ({ ...s, videoQuality: quality }));
  const incrementGuestScans = () =>
    setState((s) => ({ ...s, guestScansUsed: s.guestScansUsed + 1 }));
  // the server keeps the real count, so the app copies it from there
  const setGuestScansUsed = (n) => setState((s) => ({ ...s, guestScansUsed: Math.max(0, Number(n) || 0) }));

  return (
    <SettingsContext.Provider
      value={{
        videoQuality: state.videoQuality,
        guestScansUsed: state.guestScansUsed,
        setVideoQuality,
        incrementGuestScans,
        setGuestScansUsed,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}