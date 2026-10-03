async function loadChannels() {
  const { data, error } = await db.from("channels").select("id,name,is_private,invite_code,whitelist,banned_users").order("id").limit(100);
  if (error) throw error;
  const username = state.profile.username.toLowerCase();
  state.channels = (data || []).filter(c => {
    const banned = (c.banned_users || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (banned.includes(username)) return false;
    if (!c.is_private) return true;
    const allowed = (c.whitelist || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(username);
  });
  renderChannels();
  if (!state.channel || state.channel.is_dm || !state.channels.some(c => c.id === state.channel.id)) {
    const general = state.channels.find(c => c.name.toLowerCase() === "general") || state.channels[0];
    if (general) await selectChannel(general);
  }
}
function renderChannels() {
  const publicBox = document.getElementById("channelList"), privateBox = document.getElementById("privateChannelList");
  publicBox.innerHTML = ""; privateBox.innerHTML = "";
  state.channels.forEach(c => {
    const unread = state.unread["channel:" + c.id] || 0;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "channel " + (!state.channel?.is_dm && state.channel?.id === c.id ? "active " : "") + (unread ? "has-unread" : "");
    b.innerHTML = `<span>${c.is_private ? "🔒" : "#"} ${escapeHtml(c.name)}</span>`;
    if (unread) b.insertAdjacentHTML("beforeend", `<span class="notification-badge">${unread}</span>`);
    b.onclick = () => selectChannel(c);
    (c.is_private ? privateBox : publicBox).appendChild(b);
  });
}
async function selectChannel(channel) {
  if (!channel) return;
  state.channel = channel;
  // Only mark a channel read when Chat is actually visible. If the browser tab
  // is hidden, keep pings/unreads until the user returns to Chat.
  if (document.visibilityState === "visible" && document.hasFocus()) {
    state.unread["channel:" + channel.id] = 0;
  }
  updateTabTitle(); renderChannels(); renderDMList();
  roomTitle.textContent = (channel.is_private ? "🔒 " : "# ") + channel.name;
  roomSubtitle.textContent = channel.is_private ? "Private channel" : "Text channel";
  messageInput.placeholder = "Message " + (channel.is_private ? "" : "#") + channel.name + "...";
  await loadMessages(); await subscribeToChannel(channel);
}
function dmRoom(username) {
  return "dm:" + [state.profile.username, username].sort((a,b) => a.localeCompare(b, undefined, {sensitivity:"base"})).join(":");
}
async function selectDM(username) {
  const name = username.trim();
  if (!name || name.toLowerCase() === state.profile.username.toLowerCase()) return;
  state.channel = {id:null,name,is_private:true,is_dm:true,dm_username:name};
  if (document.visibilityState === "visible" && document.hasFocus()) {
    state.unread["dm:" + name.toLowerCase()] = 0;
  }
  updateTabTitle(); renderChannels(); renderDMList();
  roomTitle.textContent = "@ " + name; roomSubtitle.textContent = "Direct message"; messageInput.placeholder = "Message @" + name + "...";
  await loadMessages(); await subscribeToChannel(state.channel);
}
async function loadDMThreads() {
  const me = state.profile.username;
  const {data,error} = await db.from("messages").select("sender_username,recipient_username,created_at").eq("is_dm",true).or(`sender_username.eq.${encodeURIComponent(me)},recipient_username.eq.${encodeURIComponent(me)}`).order("created_at",{ascending:false}).limit(200);
  if (error) return;
  const seen = new Set(); state.dmThreads = [];
  for (const m of data || []) {
    const other = m.sender_username === me ? m.recipient_username : m.sender_username;
    if (other && other !== me && !seen.has(other.toLowerCase())) { seen.add(other.toLowerCase()); state.dmThreads.push(other); }
  }
  renderDMList();
}
function renderDMList() {
  const box = document.getElementById("dmList"); if (!box) return;
  box.innerHTML = "";
  if (!state.dmThreads.length) { box.innerHTML = '<div class="small muted dm-empty">No conversations yet.</div>'; return; }
  state.dmThreads.forEach(username => {
    const row = document.createElement("button"); row.type="button";
    row.className = "channel dm-row " + (state.channel?.is_dm && state.channel.dm_username === username ? "active " : "");
    const unread = state.unread["dm:" + username.toLowerCase()] || 0;
    row.innerHTML = `<span>👤 ${escapeHtml(username)}</span>`;
    if (unread) row.insertAdjacentHTML("beforeend", `<span class="notification-badge">${unread}</span>`);
    row.onclick = () => selectDM(username); box.appendChild(row);
  });
}
async function openNewDM() {
  const {data,error} = await db.from("profiles").select("username,username_color,profile_tag,last_seen_at,is_banned").eq("is_banned",false).order("username").limit(200);
  if (error) return toast(error.message,true);
  const box = document.getElementById("dmUserPicker"); box.innerHTML = "";
  (data || []).filter(p => p.username.toLowerCase() !== state.profile.username.toLowerCase()).forEach(p => {
    const row = document.createElement("button"); row.type="button"; row.className="dm-picker-row";
    row.innerHTML = `<span class="status-dot ${isOnlineProfile(p) ? "online" : "offline"}"></span><span class="dm-picker-name" style="color:${safeColor(p.username_color)}">${escapeHtml(p.username)}</span>${p.profile_tag ? `<span class="profile-tag">${escapeHtml(p.profile_tag)}</span>` : ""}<span class="dm-picker-action">Message</span>`;
    row.onclick = async () => { document.getElementById("dmDialog").close(); await selectDM(p.username); };
    box.appendChild(row);
  });
  if (!box.children.length) box.innerHTML='<div class="small muted">No other users.</div>';
  document.getElementById("dmDialog").showModal();
}
function safeColor(c){return /^#[0-9a-fA-F]{6}$/.test(c||"")?c:"#ffffff"}
function isOnlineProfile(p){return p.last_seen_at && (Date.now()-new Date(p.last_seen_at).getTime()<45000)}
async function loadPeople() {
  const {data,error} = await db.from("profiles").select("username,username_color,profile_tag,last_seen_at,is_banned").eq("is_banned",false).order("username").limit(200);
  if (error) { console.error("loadPeople", error); throw error; }
  state.people=data||[]; const box=document.getElementById("userList"); if(!box)return; box.innerHTML="";
  const online=state.people.filter(isOnlineProfile), offline=state.people.filter(p=>!isOnlineProfile(p));
  const renderGroup=(title,people,isOnline)=>{
    if(!people.length)return;
    const h=document.createElement("div"); h.className="people-heading"; h.textContent=`${title} — ${people.length}`; box.appendChild(h);
    people.forEach(p=>{
      const row=document.createElement("div"); row.className="user-row-wrap";
      const info=document.createElement("button"); info.type="button"; info.className="user-row"; info.innerHTML=`<span class="status-dot ${isOnline?"online":"offline"}"></span><span class="user-name" style="color:${isOnline?safeColor(p.username_color):"#747b87"}">${escapeHtml(p.username)}</span>${p.profile_tag?`<span class="profile-tag">${escapeHtml(p.profile_tag)}</span>`:""}`; info.onclick=()=>selectDM(p.username);
      const dm=document.createElement("button"); dm.type="button"; dm.className="dm-action-btn"; dm.title="Send direct message"; dm.textContent="DM"; dm.onclick=()=>selectDM(p.username);
      row.append(info,dm); box.appendChild(row);
    });
  };
  renderGroup("ONLINE",online,true); renderGroup("OFFLINE",offline,false);
}
async function heartbeat(){if(!state.profile?.username)return; await db.from("profiles").update({last_seen_at:new Date().toISOString()}).eq("username",state.profile.username)}
function updateTabTitle(){const total=Object.values(state.unread||{}).reduce((s,n)=>s+(Number(n)||0),0);document.title=total>0?`(${total}) Chat`:"Chat"}
function addUnread(key){state.unread[key]=(state.unread[key]||0)+1;updateTabTitle();renderChannels();renderDMList()}
async function openProfile(){
  if(!state.profile)return;
  const dlg=document.getElementById("profileDialog");
  if(!dlg)return;
  const color=document.getElementById("profileColor");
  const preview=document.getElementById("profileTagPreview");
  if(color) color.value=safeColor(state.profile.username_color);
  if(preview) preview.innerHTML=`<span style="color:${safeColor(state.profile.username_color)}">${escapeHtml(state.profile.username)}</span>${state.profile.profile_tag?` <span class="profile-tag">${escapeHtml(state.profile.profile_tag)}</span>`:""}`;
  dlg.showModal();
}

async function saveProfile(){
  if(!state.profile?.username) throw new Error("You are not signed in.");
  const color=safeColor(document.getElementById("profileColor")?.value);
  const {data,error}=await db.from("profiles").update({username_color:color}).eq("username",state.profile.username).select("username,device_id,username_color,profile_tag,is_banned,ban_reason,last_seen_at").single();
  if(error) throw error;
  state.profile=data;
  document.getElementById("profileDialog")?.close();
  await loadPeople();
  await loadMessages();
  toast("Profile saved.");
}
async function openAdmin(){if(!state.isAdmin)return;const {data:settings,error}=await db.from("server_settings").select("id,admins,maintenance_mode,maintenance_reason,min_required_version,download_url,global_max_accounts_per_device").limit(1).single();if(error)throw error;globalLimit.value=settings.global_max_accounts_per_device;requiredVersion.value=settings.min_required_version||"6";downloadUrl.value=settings.download_url||"";maintenanceMode.checked=!!settings.maintenance_mode;maintenanceReason.value=settings.maintenance_reason||"Down for updates.";await loadDevices();adminDialog.showModal()}
async function loadDevices(){const {data,error}=await db.rpc("admin_list_devices");if(error)throw error;deviceList.innerHTML=(data||[]).map(d=>`<div class="device-row"><div><strong>${escapeHtml(d.device_id)}</strong><div class="small muted">${escapeHtml(d.profile_usernames||"No profiles")} · ${d.account_count} account(s)</div></div><div class="device-actions"><input class="device-limit" data-device="${escapeHtml(d.device_id)}" type="number" min="0" max="100" value="${d.custom_account_limit??""}" placeholder="global"><button type="button" class="secondary device-limit-btn" data-device="${escapeHtml(d.device_id)}">Set</button><button type="button" class="${d.is_banned?"primary":"danger"} device-ban-btn" data-device="${escapeHtml(d.device_id)}">${d.is_banned?"Unban":"Ban"}</button></div></div>`).join("")||'<div class="empty">No devices.</div>';document.querySelectorAll(".device-limit-btn").forEach(btn=>btn.onclick=async()=>{const input=document.querySelector(`.device-limit[data-device="${CSS.escape(btn.dataset.device)}"]`);const value=input.value===""?null:Number(input.value);try{const {error}=await db.rpc("admin_set_device_limit",{p_device_id:btn.dataset.device,p_custom_limit:value});if(error)throw error;toast("Device limit saved.")}catch(e){toast(e.message,true)}});document.querySelectorAll(".device-ban-btn").forEach(btn=>btn.onclick=async()=>{const ban=btn.textContent.trim()!=="Unban";try{const {error}=await db.rpc("admin_set_device_ban",{p_device_id:btn.dataset.device,p_is_banned:ban,p_ban_reason:ban?"Banned by administrator":null});if(error)throw error;await loadDevices();toast(ban?"Device banned.":"Device unbanned.")}catch(e){toast(e.message,true)}})}
async function startApp(){await loadProfile();if(!state.profile){document.getElementById("appView").classList.add("hidden");document.getElementById("authView").classList.remove("hidden");return}if(state.profile.is_banned)throw new Error(state.profile.ban_reason||"Your account is banned.");const {data:admin}=await db.rpc("is_admin");state.isAdmin=!!admin;document.getElementById("authView").classList.add("hidden");document.getElementById("appView").classList.remove("hidden");currentUserLabel.textContent="@"+state.profile.username;adminBtn.classList.toggle("hidden",!state.isAdmin);await heartbeat();await loadChannels();try{await loadDMThreads()}catch(e){console.error(e)}try{await loadPeople()}catch(e){console.error(e)}try{await subscribeBackgroundMessages()}catch(e){console.error(e)}clearInterval(window.__presenceTimer);window.__presenceTimer=setInterval(async()=>{await heartbeat();await loadPeople();await loadDMThreads()},15000);clearInterval(window.__complianceTimer);window.__complianceTimer=setInterval(async()=>{await runServerCompliance()},60000)}
document.addEventListener("DOMContentLoaded",async()=>{setupAuth();installComposer();await loadLoginNews();if(!(await runServerCompliance()))return;logoutBtn.onclick=signOut;refreshBtn.onclick=safeManualRefresh;profileBtn.onclick=openProfile;saveProfileBtn.onclick=async e=>{e.preventDefault();try{await saveProfile()}catch(err){toast(err.message,true)}};adminBtn.onclick=async()=>{try{await openAdmin()}catch(e){toast(e.message,true)}};newDmBtn.onclick=openNewDM;saveClientAccessBtn.onclick=async()=>{try{const version=(requiredVersion.value||"6").trim();const url=(downloadUrl.value||"").trim()||null;const reason=(maintenanceReason.value||"Down for updates.").trim();const {error}=await db.rpc("admin_set_client_access",{p_min_version:version,p_download_url:url,p_maintenance_mode:maintenanceMode.checked,p_maintenance_reason:reason});if(error)throw error;toast("Client access settings saved.")}catch(e){toast(e.message,true)}};closeDmBtn.onclick=()=>document.getElementById("dmDialog").close();closeCommandBtn.onclick=()=>document.getElementById("commandDialog").close();closeAdminBtn.onclick=()=>adminDialog.close();saveGlobalBtn.onclick=async()=>{const value=Number(globalLimit.value);if(!Number.isInteger(value)||value<1||value>100)return toast("Enter a limit from 1 to 100.",true);try{const {error}=await db.rpc("admin_set_global_limit",{p_limit:value});if(error)throw error;toast("Global account limit saved.")}catch(e){toast(e.message,true)}};newsForm.onsubmit=async e=>{e.preventDefault();try{const {error}=await db.rpc("admin_create_news",{p_title:newsTitle.value.trim(),p_summary:newsSummary.value.trim(),p_url:newsUrl.value.trim()||null});if(error)throw error;newsForm.reset();await loadLoginNews();toast("Update posted.")}catch(e){toast(e.message,true)}};/* Deliberately do not restore a previous login on page load. Each page load starts at the login screen. */});
let __lastManualRefresh = 0;
let __refreshBusy = false;
const REFRESH_COOLDOWN_MS = 15000;
