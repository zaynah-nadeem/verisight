import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";
import { clearScansOnServer, deleteScanOnServer, fetchScans } from "../services/api";

// Guests: history lives on the phone only.
const GUEST_KEY = "deepfake_scan_history";
// Signed-in users: history lives on the server. The phone only remembers
//  - where it saved the original file of each scan (so thumbnails show), and
//  - a copy of the last list, so the screen isn't empty when offline.
const uriKey = (userId) => `deepfake_scan_uris_${userId}`;
const cacheKey = (userId) => `deepfake_scan_cache_${userId}`;

const HistoryContext = createContext(null);

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// Turns a scan from the server into the shape the screens already use
function fromServer(item, uris) {
  return {
    id: item.id,
    fileName: item.file_name || "Untitled",
    uri: uris[item.id] || "",
    fileType: item.file_type,
    result: item.result,
    createdAt: item.created_at,
  };
}

export function HistoryProvider({ children }) {
  const { user, ready } = useAuth();
  const userId = user?.id || null;

  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const urisRef = useRef({});

  const load = useCallback(async () => {
    setError(null);

    // ----- guest: local only -----
    if (!userId) {
      setScans(await readJson(GUEST_KEY, []));
      return;
    }

    // ----- signed in: server is the source of truth -----
    setLoading(true);
    urisRef.current = await readJson(uriKey(userId), {});
    // show the saved copy right away, then update it from the server
    const cached = await readJson(cacheKey(userId), null);
    if (cached) setScans(cached.map((s) => ({ ...s, uri: urisRef.current[s.id] || s.uri || "" })));
    else setScans([]);

    try {
      const items = await fetchScans(200, 0);
      const list = items.map((item) => fromServer(item, urisRef.current));
      setScans(list);
      writeJson(cacheKey(userId), list);
    } catch (e) {
      setError(e); // keep showing the saved copy
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // load again whenever the signed-in user changes (sign in, sign out, switch account)
  useEffect(() => {
    if (!ready) return;
    setScans([]);
    load();
  }, [ready, load]);

  const addScan = (file, result) => {
    const uri = file?.uri || "";
    const fileName = file?.fileName || uri.split("/").pop() || "Untitled";
    const createdAt = new Date().toISOString();

    // signed in and saved by the server
    if (userId && result?.scan_id) {
      const record = {
        id: result.scan_id,
        fileName,
        uri,
        fileType: result.file_type,
        result,
        createdAt,
      };
      urisRef.current = { ...urisRef.current, [record.id]: uri };
      writeJson(uriKey(userId), urisRef.current);
      setScans((prev) => {
        const next = [record, ...prev.filter((s) => s.id !== record.id)];
        writeJson(cacheKey(userId), next);
        return next;
      });
      return record;
    }

    // guest: keep it on the phone only
    const record = {
      id: String(Date.now()),
      fileName,
      uri,
      fileType: result.file_type,
      result,
      createdAt,
    };
    setScans((prev) => {
      const next = [record, ...prev];
      writeJson(GUEST_KEY, next);
      return next;
    });
    return record;
  };

  // removes one scan (from the server too, when signed in)
  const deleteScan = async (id) => {
    if (userId) {
      await deleteScanOnServer(id); // if this fails, the error goes back to the screen
      const { [id]: _gone, ...rest } = urisRef.current;
      urisRef.current = rest;
      writeJson(uriKey(userId), rest);
      setScans((prev) => {
        const next = prev.filter((s) => s.id !== id);
        writeJson(cacheKey(userId), next);
        return next;
      });
      return;
    }
    setScans((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeJson(GUEST_KEY, next);
      return next;
    });
  };

  const clearHistory = async () => {
    if (userId) {
      try {
        await clearScansOnServer();
      } catch (e) {
        setError(e);
        return; // don't pretend it worked
      }
      urisRef.current = {};
      writeJson(uriKey(userId), {});
      writeJson(cacheKey(userId), []);
      setScans([]);
      return;
    }
    writeJson(GUEST_KEY, []);
    setScans([]);
  };

  return (
    <HistoryContext.Provider value={{ scans, addScan, deleteScan, clearHistory, refresh: load, loading, error }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  return useContext(HistoryContext);
}