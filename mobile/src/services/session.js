// Holds the current login token and this phone's device id, so api.js can read them
// without being a React component. AuthContext keeps it up to date.
let session = { token: null, deviceId: null };

export function setSession(next) {
  session = { ...session, ...next };
}

export function getSession() {
  return session;
}