import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTheme } from "../theme/colors";

const ThemeContext = createContext(null);
const STORAGE_KEY = "deepfake_theme_mode";

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "light" || saved === "dark") setMode(saved);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleTheme = async () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const colors = getTheme(mode);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useAppTheme = () => useContext(ThemeContext);