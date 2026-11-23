import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";
import { getSession } from "../services/session";

// A report is first saved on the phone, then sent to the server.
// If the server can't be reached, it stays on the phone and is sent with the next report.
const KEY = "verisight_wrong_reports";
const TIMEOUT_MS = 15000;

async function readList() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function writeList(list) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch (e) {
    // the phone copy is only a backup
  }
}

async function sendToServer(item) {
  const { token, deviceId } = getSession();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceId) headers["X-Device-Id"] = deviceId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scan_id: item.scanId,
        file_type: item.fileType === "video" ? "video" : "image",
        file_name: item.fileName,
        app_verdict: item.appSaid,
        confidence_low: item.appConfidenceLow,
        confidence_high: item.appConfidenceHigh,
        actually_is: item.actuallyIs,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// actuallyIs: "real" or "ai_generated" (what the person says the file really is)
// Returns true when the server got it, false when it is only saved on the phone.
export async function saveWrongReport({ result, file, actuallyIs }) {
  const item = {
    scanId: result?.scan_id || null,
    fileName: file?.fileName || (file?.uri ? file.uri.split("/").pop() : "Untitled"),
    fileType: result?.file_type || "image",
    appSaid: result?.verdict?.verdict || null,
    appConfidenceLow: result?.verdict?.confidence_low ?? null,
    appConfidenceHigh: result?.verdict?.confidence_high ?? null,
    actuallyIs,
    reportedAt: new Date().toISOString(),
    sent: false,
  };

  const list = await readList();
  list.unshift(item);
  await writeList(list); // saved on the phone first, so nothing is lost

  item.sent = await sendToServer(item);

  // also try to send a few older reports that never reached the server
  const waiting = list.filter((r) => !r.sent && r !== item).slice(0, 5);
  for (const old of waiting) {
    old.sent = await sendToServer(old);
  }

  await writeList(list);
  return item.sent;
}