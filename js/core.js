
window.CONFIG = {
  SUPABASE_URL: "https://chggbyitontubbujqcik.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZ2dieWl0b250dWJidWpxY2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNTA1NzEsImV4cCI6MjEwNjYyNjU3MX0.Nuc_1kLV5XgNy7Fvar5YejriexPCgeCflJluZ3eyuv8",
  APP_VERSION: "6.1"
};
// Client version: 6 — keep this equal to server_settings.min_required_version.

const CONFIG = window.CONFIG;
let db = null;
let clientBlocked = false;

function makeDbClient() {
  const username = sessionStorage.getItem("chat_username") || "";
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) return null;
  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    global: { headers: username ? { "x-chat-username": username } : {} }
  });
}

function clearAuthCard() {
  const card = document.getElementById("authCard");
  if (!card) return;
  card.innerHTML = "";
  card.classList.add("auth-blank");
}

function restoreAuthCard() {
  location.reload();
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch (_) {
    return "";
  }
}

function showLockout(title, message, downloadUrl = "") {
  clientBlocked = true;
  // Keep the left auth card itself empty so there is no login/create-account UI.
  clearAuthCard();
  const actions = document.getElementById("authGateActions");
  if (actions) {
    actions.classList.remove("hidden");
    actions.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "notice error";
    heading.style.marginBottom = "10px";
    heading.innerHTML = `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(message)}`;
    actions.appendChild(heading);
    const safeUrl = normalizeExternalUrl(downloadUrl);
    if (safeUrl) {
      const a = document.createElement("a");
      a.className = "auth-gate-link";
      a.href = safeUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Download New Version";
      actions.appendChild(a);
    }
  }
  document.getElementById("authView")?.classList.remove("hidden");
  document.getElementById("appView")?.classList.add("hidden");
  document.getElementById("deviceBlockedView")?.classList.add("hidden");
}

async function runServerCompliance() {
  if (!db) return true;
  try {
    const { data: settings, error } = await db.from("server_settings")
      .select("maintenance_mode,maintenance_reason,min_required_version,download_url")
      .order("id").limit(1).single();

    if (error) {
      showLockout("Chat setup is unavailable", "The server settings could not be verified.");
      return false;
    }

    if (settings?.maintenance_mode) {
      showLockout("Chat is temporarily unavailable, but maybe make sure you are on the right one, your version number is: 6.1", settings.maintenance_reason || "Down for updates, no need to download the new version, because you are on the right one.", settings.download_url || "");
      return false;
    }

    if (settings?.min_required_version && String(settings.min_required_version) !== String(CONFIG.APP_VERSION)) {
      showLockout("This version is out of date", "Please use the current version of Chat.", settings.download_url || "");
      return false;
    }

    if (await checkDeviceAccess()) {
      showDeviceBlocked();
      return false;
    }

    clientBlocked = false;
    return true;
  } catch (e) {
    console.error("Compliance check failed", e);
    showLockout("Chat setup is unavailable", "The server could not verify this client.");
    return false;
  }
}

db = makeDbClient();
window.db = db;

function refreshDbClient() {
  db = makeDbClient();
  window.db = db;
  return db;
}

window.state = {
  user: null, profile: null, channel: null, realtime: null,
  channels: [], messages: [], isAdmin: false,
  dmThreads: [], unread: {}, people: []
};

window.deviceId = (() => {
  const key = "chat_app_device_id_v6";
  let id = localStorage.getItem(key);
  if (!id || !id.startsWith("dev_")) {
    const raw = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
      .replace(/[^a-zA-Z0-9]/g, "");
    id = "dev_" + raw.slice(0, 20);
    localStorage.setItem(key, id);
  }
  return id;
})();

function toast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast show " + (isError ? "error" : "");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.className = "toast", 3500);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}


async function checkDeviceAccess() {
  if (!db) return false;
  const { data, error } = await db.rpc("check_device_status", { p_device_id: window.deviceId });
  if (error) throw error;
  return data === true || data?.is_banned === true;
}

function showDeviceBlocked() {
  document.getElementById("authView")?.classList.add("hidden");
  document.getElementById("appView")?.classList.add("hidden");
  document.getElementById("deviceBlockedView")?.classList.remove("hidden");
}

async function loadProfile() {
  const username = state.user?.username;
  if (!username) { state.profile = null; return null; }

  const { data, error } = await db.from("profiles")
    .select("username,device_id,username_color,profile_tag,is_banned,ban_reason,last_seen_at")
    .eq("username", username).single();

  if (error || !data) {
    state.user = null; state.profile = null;
    return null;
  }

  state.user = { username: data.username };
  state.profile = data;
  return data;
}
