/*
 * Google Drive sync for VKP's CC Tracker.
 *
 * Data lives in a single JSON file inside the user's hidden Drive "appDataFolder"
 * (scope drive.appdata): the app can only see its own file, nothing else in Drive.
 * localStorage stays the source of truth while offline; every sync is pull → merge → push.
 */
(function () {
  "use strict";

  const CLIENT_ID = ((window.CC_CONFIG || {}).googleClientId || "").trim();
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const FILE_NAME = "vkp-cc-tracker.json";
  const TOKEN_KEY = "vkp-cc-tracker:gdrive-token";
  const LINKED_KEY = "vkp-cc-tracker:gdrive-linked";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const GIS_SRC = "https://accounts.google.com/gsi/client";

  let hooks = null;
  let tokenClient = null;
  let token = null;
  let fileId = null;
  let running = null;
  let rerun = false;
  let timer = null;

  function available() {
    return !!CLIENT_ID && (location.protocol === "https:" || location.protocol === "http:");
  }

  function status(state, detail) {
    if (hooks) hooks.onStatus(state, detail);
  }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  /* ---------- Token handling ---------- */

  function loadToken() {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
      if (t && typeof t.value === "string" && t.expiresAt > Date.now() + 60000) return t;
    } catch {
      /* ignore */
    }
    return null;
  }

  function tokenValid() {
    if (token && token.expiresAt > Date.now() + 30000) return true;
    token = null;
    return false;
  }

  function isLinked() {
    return localStorage.getItem(LINKED_KEY) === "1";
  }

  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load Google sign-in"));
      document.head.appendChild(s);
    });
  }

  function initClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (!resp || resp.error || !resp.access_token) {
          status(isLinked() ? "expired" : "disconnected");
          return;
        }
        token = { value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        localStorage.setItem(LINKED_KEY, "1");
        syncNow();
      },
      error_callback: () => status(isLinked() ? "expired" : "disconnected"),
    });
  }

  /* ---------- Drive REST ---------- */

  class AuthError extends Error {}

  async function drive(url, opts) {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts && opts.headers), Authorization: "Bearer " + token.value },
    });
    if (res.status === 401 || res.status === 403) {
      token = null;
      localStorage.removeItem(TOKEN_KEY);
      throw new AuthError("Drive authorisation expired");
    }
    if (!res.ok) throw new Error("Drive request failed: " + res.status);
    return res;
  }

  async function findFile() {
    const q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    const res = await drive(API + "/files?spaces=appDataFolder&pageSize=1&fields=files(id)&q=" + q);
    const data = await res.json();
    return data.files && data.files[0] ? data.files[0].id : null;
  }

  async function readRemote() {
    if (!fileId) fileId = await findFile();
    if (!fileId) return null;
    const res = await drive(API + "/files/" + fileId + "?alt=media");
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  async function writeRemote(data) {
    if (!fileId) {
      const res = await drive(API + "/files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" }),
      });
      fileId = (await res.json()).id;
    }
    await drive(UPLOAD + "/files/" + fileId + "?uploadType=media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /* ---------- Sync ---------- */

  async function runSync() {
    status("syncing");
    try {
      const remote = await readRemote();
      const local = hooks.getState();
      const merged = hooks.merge(local, remote && typeof remote === "object" ? remote : { months: {} });
      if (stable(merged) !== stable(local)) hooks.setState(merged);
      if (!remote || stable(merged) !== stable(remote)) await writeRemote(merged);
      status("synced", new Date());
    } catch (err) {
      if (err instanceof AuthError) status("expired");
      else status(navigator.onLine === false ? "offline" : "error");
    }
  }

  async function syncNow() {
    if (!available() || !tokenValid()) {
      if (available() && isLinked()) status("expired");
      return;
    }
    if (running) {
      rerun = true;
      return running;
    }
    running = runSync();
    await running;
    running = null;
    if (rerun) {
      rerun = false;
      return syncNow();
    }
  }

  /* ---------- Public API ---------- */

  function connect() {
    if (!tokenClient) return;
    // Must run synchronously inside the click handler so the Google popup isn't blocked.
    tokenClient.requestAccessToken({ prompt: isLinked() ? "" : "consent" });
  }

  function disconnect() {
    const t = token && token.value;
    token = null;
    fileId = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LINKED_KEY);
    if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {});
    status("disconnected");
  }

  function schedule() {
    if (!available() || !tokenValid()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 800);
  }

  async function init(h) {
    hooks = h;
    if (!available()) {
      status("off");
      return;
    }
    token = loadToken();
    status(token ? "syncing" : isLinked() ? "expired" : "disconnected");
    try {
      await loadGis();
      initClient();
    } catch {
      status("offline");
      return;
    }
    if (token) syncNow();
    else status(isLinked() ? "expired" : "disconnected");

    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncNow();
    });
  }

  window.DriveSync = { init, connect, disconnect, syncNow, schedule };
})();
