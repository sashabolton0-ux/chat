async function signUp(username, password) {
  const clean = username.trim();

  const { data: existing } = await db.from("profiles")
    .select("username").ilike("username", clean).maybeSingle();
  if (existing) throw new Error("That username is already taken.");

  const { data, error } = await db.rpc("create_profile_legacy", {
    p_username: clean,
    p_password: password ?? "",
    p_device_id: window.deviceId,
    p_client_version: CONFIG.APP_VERSION
  });
  if (error) throw error;

  state.user = { username: clean };
  refreshDbClient();
  return data;
}

async function signIn(username, password) {
  const clean = username.trim();
  const { data, error } = await db.rpc("login_profile", {
    p_username: clean,
    p_password: password ?? "",
    p_client_version: CONFIG.APP_VERSION,
    p_device_id: window.deviceId
  });
  if (error) throw error;
  if (!data) throw new Error("Incorrect username or password.");

  state.user = { username: data.username };
  refreshDbClient();
  return data;
}

async function signOut() {
  if (state.realtime) await db.removeChannel(state.realtime);
  state.user = null;
  state.profile = null;
  location.reload();
}

window.signIn = signIn;
window.signUp = signUp;

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const messageInput = document.getElementById("messageInput");
const messageForm = document.getElementById("messageForm");
const roomTitle = document.getElementById("roomTitle");
const roomSubtitle = document.getElementById("roomSubtitle");
const currentUserLabel = document.getElementById("currentUserLabel");
const adminBtn = document.getElementById("adminBtn");
const adminDialog = document.getElementById("adminDialog");
const deviceList = document.getElementById("deviceList");
const globalLimit = document.getElementById("globalLimit");
const saveGlobalBtn = document.getElementById("saveGlobalBtn");
const newsForm = document.getElementById("newsForm");
const newsTitle = document.getElementById("newsTitle");
const newsSummary = document.getElementById("newsSummary");
const newsUrl = document.getElementById("newsUrl");
const requiredVersion = document.getElementById("requiredVersion");
const downloadUrl = document.getElementById("downloadUrl");
const maintenanceMode = document.getElementById("maintenanceMode");
const maintenanceReason = document.getElementById("maintenanceReason");
const saveClientAccessBtn = document.getElementById("saveClientAccessBtn");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const profileBtn = document.getElementById("profileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const newDmBtn = document.getElementById("newDmBtn");
const closeDmBtn = document.getElementById("closeDmBtn");
const closeCommandBtn = document.getElementById("closeCommandBtn");
const closeAdminBtn = document.getElementById("closeAdminBtn");
function showAuthTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.authTab === tab));
  document.getElementById("loginForm").classList.toggle("hidden", tab !== "login");
  document.getElementById("signupForm").classList.toggle("hidden", tab !== "signup");
}
function showAuthError(message) {
  const box = document.getElementById("authNotice");
  if (!box) return;
  box.textContent = message;
  box.className = "notice error";
}
function setupAuth() {
  document.querySelectorAll("[data-auth-tab]").forEach(b => b.onclick = () => showAuthTab(b.dataset.authTab));
  document.getElementById("loginForm").onsubmit = async e => {
    e.preventDefault();
    try {
      if (!(await runServerCompliance())) return;
      await signIn(loginUsername.value.trim(), loginPassword.value);
      await startApp();
    } catch (err) { showAuthError(err.message); }
  };
  document.getElementById("signupForm").onsubmit = async e => {
    e.preventDefault();
    try {
      if (!(await runServerCompliance())) return;
      await signUp(signupUsername.value.trim(), signupPassword.value);
      await startApp();
    } catch (err) { showAuthError(err.message); }
  };
}
async function loadLoginNews(){
  const box=document.getElementById("loginNews");
  if(!box)return;
  if(!db){box.innerHTML='<div class="small muted">Connect this build to a Supabase project to load updates.</div>';return;}
  box.innerHTML='<div class="small muted">Loading updates...</div>';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const {data,error}=await db.from("news").select("id,title,summary,url,created_at").order("created_at",{ascending:false}).limit(5).abortSignal(controller.signal);
    if(error)throw error;
    box.innerHTML=(data||[]).length?data.map(n=>`<article class="login-news-item"><div class="small muted">${new Date(n.created_at).toLocaleDateString()}</div><strong>${escapeHtml(n.title)}</strong><div class="small">${escapeHtml(n.summary)}</div>${normalizeExternalUrl(n.url)?`<a href="${escapeHtml(normalizeExternalUrl(n.url))}" target="_blank" rel="noopener noreferrer">Read more</a>`:""}</article>`).join(""):'<div class="small muted">No updates right now.</div>';
  }catch(e){box.innerHTML='<div class="small muted">Updates are unavailable right now.</div>'}
  finally{clearTimeout(timer)}
}
