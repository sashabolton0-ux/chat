async function safeManualRefresh() {
  const now = Date.now();
  if (__refreshBusy) return toast("Refresh is already running.", true);
  if (now - __lastManualRefresh < REFRESH_COOLDOWN_MS) {
    const left = Math.ceil((REFRESH_COOLDOWN_MS - (now - __lastManualRefresh))/1000);
    return toast(`Please wait ${left}s before refreshing again.`, true);
  }
  __lastManualRefresh = now;
  __refreshBusy = true;
  try {
    await Promise.all([loadMessages(), loadPeople(), loadDMThreads()]);
  } catch(e) {
    toast(e.message, true);
  } finally {
    __refreshBusy = false;
  }
}

function commandMessage(text) {
  const parts = text.trim().split(/\s+/);
  return {command:(parts[0]||"").toLowerCase(), username:parts.slice(1).join(" ").trim()};
}

async function showUserPicker(title, subtitle, users, actionLabel, action) {
  const dlg=document.getElementById("commandDialog");
  const box=document.getElementById("commandUserPicker");
  document.getElementById("commandDialogTitle").textContent=title;
  document.getElementById("commandDialogSubtitle").textContent=subtitle||"";
  box.innerHTML="";
  (users||[]).forEach(p=>{
    const row=document.createElement("button");
    row.type="button"; row.className="dm-picker-row";
    row.innerHTML=`<span class="status-dot ${isOnlineProfile(p)?"online":"offline"}"></span><span class="dm-picker-name" style="color:${safeColor(p.username_color)}">${escapeHtml(p.username)}</span>${p.profile_tag?`<span class="profile-tag">${escapeHtml(p.profile_tag)}</span>`:""}<span class="dm-picker-action">${escapeHtml(actionLabel)}</span>`;
    row.onclick=async()=>{try{await action(p);dlg.close()}catch(e){toast(e.message,true)}};
    box.appendChild(row);
  });
  if(!box.children.length) box.innerHTML='<div class="small muted">No users available.</div>';
  dlg.showModal();
}

async function adminUserCommand(command, username) {
  if (!state.isAdmin) throw new Error("Only administrators can use that command.");
  const normalized=String(username||"").trim();
  if (!normalized) {
    const {data,error}=await db.from("profiles").select("username,username_color,profile_tag,last_seen_at,is_banned").order("username").limit(200);
    if(error) throw error;
    const candidates=(data||[]).filter(p=>command==="ban" ? !p.is_banned : p.is_banned);
    return showUserPicker(
      command==="ban" ? "Ban a user" : "Unban a user",
      command==="ban" ? "Choose a user to ban." : "Choose a banned user to restore.",
      candidates, command==="ban" ? "Ban" : "Unban",
      async p=>{
        const {error}=await db.rpc(command==="ban"?"admin_ban_user":"admin_unban_user",{p_username:p.username});
        if(error) throw error;
        toast(command==="ban"?`${p.username} was banned.`:`${p.username} was unbanned.`);
        await loadPeople();
      }
    );
  }
  const fn=command==="ban"?"admin_ban_user":"admin_unban_user";
  const {error}=await db.rpc(fn,{p_username:normalized});
  if(error) throw error;
  toast(command==="ban"?`${normalized} was banned.`:`${normalized} was unbanned.`);
  await loadPeople();
}

async function showInvitePicker() {
  if(!state.channel?.is_private || state.channel?.is_dm) throw new Error("Use /invite inside a private channel.");
  const {data,error}=await db.from("profiles").select("username,username_color,profile_tag,last_seen_at,is_banned").eq("is_banned",false).order("username").limit(200);
  if(error) throw error;
  const whitelist=(state.channel.whitelist||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const candidates=(data||[]).filter(p=>p.username.toLowerCase()!==state.profile.username.toLowerCase()&&!whitelist.includes(p.username.toLowerCase()));
  await showUserPicker("Invite someone",`Invite a user to #${state.channel.name}. They'll receive a DM invitation.`,candidates,"Invite",async p=>{
    const {error}=await db.rpc("send_channel_invite",{p_channel_id:state.channel.id,p_invited_username:p.username});
    if(error) throw error;
    toast(`Invite sent to ${p.username}.`);
  });
}

// Explicit DOM references: do not rely on browser-created globals from element IDs.

/* Read-state handling: being inside a channel is not enough to mark pings read.
   The user must actually have Chat visible and focused. */
function chatIsVisibleAndFocused(){
  return document.visibilityState === "visible" && document.hasFocus();
}

function markActiveRoomRead(){
  if(!chatIsVisibleAndFocused() || !state.channel) return;
  if(state.channel.is_dm){
    const key="dm:"+String(state.channel.dm_username||"").toLowerCase();
    if(state.unread[key]) state.unread[key]=0;
  }else if(state.channel.id!=null){
    const key="channel:"+state.channel.id;
    if(state.unread[key]) state.unread[key]=0;
  }
  updateTabTitle(); renderChannels(); renderDMList();
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible") markActiveRoomRead();
});
window.addEventListener("focus", markActiveRoomRead);

/* Ping notifications */
const notificationBtn = document.getElementById("notificationBtn");

function pingNotificationText(sender, roomName) {
  return `${sender} mentioned you${roomName ? ` in ${roomName}` : ""}`;
}

function showPingNotification({sender, roomName, messageId}) {
  const stack = document.getElementById("notificationStack");
  if (!stack || !sender || sender === state.profile?.username) return;
  if (messageId && window.__shownPingNotifications?.has(messageId)) return;
  window.__shownPingNotifications ||= new Set();
  if (messageId) window.__shownPingNotifications.add(messageId);
  if (window.__shownPingNotifications.size > 200) {
    const first = window.__shownPingNotifications.values().next().value;
    window.__shownPingNotifications.delete(first);
  }

  const item = document.createElement("div");
  item.className = "ping-notification";
  item.innerHTML = `<strong>🔔 ${escapeHtml(sender)} pinged you</strong><div class="small">${escapeHtml(roomName || "Chat")}</div>`;
  item.onclick = () => item.remove();
  stack.appendChild(item);
  setTimeout(() => item.remove(), 6000);

  // Browser notifications are only requested after the user explicitly clicks
  // the bell, so opening Chat never causes a permission prompt by itself.
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("Chat ping", {body: pingNotificationText(sender, roomName), tag: messageId ? `ping-${messageId}` : undefined}); } catch (_) {}
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) return toast("Browser notifications are not supported here.", true);
  if (Notification.permission === "granted") return toast("Notifications are already enabled.");
  if (Notification.permission === "denied") return toast("Notifications are blocked by your browser.", true);
  try {
    const permission = await Notification.requestPermission();
    toast(permission === "granted" ? "Notifications enabled." : "Notifications were not enabled.", permission !== "granted");
  } catch (e) { toast(e.message, true); }
}

if (notificationBtn) notificationBtn.onclick = enableNotifications;
