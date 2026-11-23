import { API_BASE_URL } from "../config";
import { getSession } from "./session";

// How long the app waits for a scan. The detector runs on the laptop's CPU, where one image
// can take about a minute and a video a few minutes, so these are generous.
const TIMEOUT_MS = { image: 180000, video: 900000, json: 15000 };

// kind: "network" | "timeout" | "server" | "auth" | "guest_limit"
export class ScanError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}
export const ApiError = ScanError;

function authHeaders() {
  const { token, deviceId } = getSession();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

// Turns the server's error body into a readable message and a kind
function errorFrom(status, body) {
  let detail = "";
  if (body && typeof body.detail === "string") {
    detail = body.detail;
  } else if (body && Array.isArray(body.detail) && body.detail[0]?.msg) {
    // validation errors, e.g. "Value error, Enter a valid email address"
    detail = String(body.detail[0].msg).replace(/^Value error,\s*/i, "");
    if (body.detail[0]?.loc?.includes("password") && /at least/i.test(detail)) {
      detail = "Password must be at least 8 characters.";
    }
  }
  if (status === 403 && detail === "guest_limit_reached") {
    return new ScanError("guest_limit", "You've used your free scans.");
  }
  if (status === 401 && !/wrong email or password/i.test(detail)) {
    return new ScanError("auth", detail || "Please sign in again.");
  }
  const err = new ScanError("server", detail || `Server returned error ${status}.`);
  err.status = status;
  return err;
}

async function request(path, { method = "GET", body, timeoutMs = TIMEOUT_MS.json } = {}) {
  const headers = { ...authHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ScanError("timeout", "The server took too long to answer.");
    throw new ScanError("network", "Can't reach the server.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) throw errorFrom(res.status, data);
  return data;
}

// ---------- accounts ----------

export const apiSignUp = ({ name, email, password }) =>
  request("/auth/signup", { method: "POST", body: { name, email, password } });

export const apiSignIn = ({ email, password }) =>
  request("/auth/login", { method: "POST", body: { email, password } });

export const apiMe = () => request("/auth/me");

// Forgot password: the server e-mails a 6-digit code, then the code + a new password changes it
export const apiForgotPassword = (email) =>
  request("/auth/forgot-password", { method: "POST", body: { email } });

export const apiResetPassword = ({ email, code, newPassword }) =>
  request("/auth/reset-password", { method: "POST", body: { email, code, new_password: newPassword } });

// Profile (signed-in users)
export const apiUpdateName = (name) => request("/auth/me", { method: "PATCH", body: { name } });

export const apiChangePassword = ({ currentPassword, newPassword }) =>
  request("/auth/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });

// Permanently deletes the signed-in account and all its saved scans (password confirms it)
export const apiDeleteAccount = (password) =>
  request("/auth/delete-account", { method: "POST", body: { password } });

// ---------- saved scans (signed-in users) ----------

export const fetchScans = (limit = 50, offset = 0) => request(`/scans?limit=${limit}&offset=${offset}`);
export const deleteScanOnServer = (id) => request(`/scans/${id}`, { method: "DELETE" });
export const clearScansOnServer = () => request("/scans", { method: "DELETE" });
export const scanFileUrl = (id) => `${API_BASE_URL}/scans/${id}/file`;

// ---------- guests ----------

export const fetchGuestUsage = () => request("/guest/usage");

// ---------- scanning (from a link) ----------

// The server downloads the picture from the link and scans it.
// A problem with the link itself (not a picture, a private address, too big...) comes back as
// kind "link", so the app can show the message next to the link box.
export async function scanUrl(url) {
  try {
    return await request("/detect/url", { method: "POST", body: { url }, timeoutMs: TIMEOUT_MS.image });
  } catch (e) {
    if (e instanceof ScanError && e.kind === "server" && e.status === 422) {
      throw new ScanError("link", e.message);
    }
    throw e;
  }
}

// ---------- scanning (file upload) ----------

export function scanFile(file) {
  return new Promise((resolve, reject) => {
    const isVideo = file.type === "video";
    const endpoint = isVideo ? "/detect/video" : "/detect/image";
    const name =
      file.fileName || file.uri.split("/").pop() || (isVideo ? "upload.mp4" : "upload.jpg");
    const mime = file.mimeType || (isVideo ? "video/mp4" : "image/jpeg");

    const form = new FormData();
    form.append("file", { uri: file.uri, name, type: mime });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${endpoint}`);
    xhr.timeout = isVideo ? TIMEOUT_MS.video : TIMEOUT_MS.image;

    const headers = authHeaders();
    Object.keys(headers).forEach((k) => xhr.setRequestHeader(k, headers[k]));

    const startedAt = Date.now();
    const secs = () => ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`file size: ${file.fileSize ? (file.fileSize / 1e6).toFixed(1) + " MB" : "unknown"}`);
    xhr.upload.onloadend = () => console.log(`upload finished after ${secs()}s`);

    xhr.onload = () => {
      console.log(`reply received after ${secs()}s`);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new ScanError("server", "The server sent a reply the app couldn't read."));
        }
        return;
      }
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch (e) {}
      reject(errorFrom(xhr.status, body));
    };

    xhr.onerror = () => {
      console.log("scanFile network error");
      reject(new ScanError("network", "Can't reach the server."));
    };

    xhr.ontimeout = () => {
      reject(new ScanError("timeout", "The check took too long."));
    };

    xhr.send(form);
  });
}