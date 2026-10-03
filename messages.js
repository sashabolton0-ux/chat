function renderMarkup(text,currentUsername){let s=escapeHtml(text);s=s.replace(/`([^`\n]+)`/g,"<code>$1</code>");s=s.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>");s=s.replace(/__([^_\n]+)__/g,"<u>$1</u>");s=s.replace(/~~([^~\n]+)~~/g,"<s>$1</s>");s=s.replace(/\*([^*\n]+)\*/g,"<em>$1</em>");s=s.replace(/^&gt;\s?(.*)$/gm,"<blockquote>$1</blockquote>");s=s.replace(/(^|[\s>])(@[A-Za-z0-9_]+)/g,(m,pre,mention)=>`${pre}<span class="${currentUsername&&mention.slice(1).toLowerCase()===currentUsername.toLowerCase()?"ping-mention ping-me":"ping-mention"}">${mention}</span>`);s=s.replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');return s.replace(/\n/g,"<br>")}
async function loadMessages(){if(!state.channel)return;const room=state.channel.is_dm?dmRoom(state.channel.dm_username):"channel:"+state.channel.id;const {data,error}=await db.from("messages").select("id,sender_username,message_text,created_at,recipient_username,is_dm,channel_id,room_id").eq("room_id",room).order("created_at",{ascending:true}).limit(100);if(error)throw error;state.messages=data||[];renderMessages()}
async function sendMessage(text){if(!state.profile||state.profile.is_banned)throw new Error("Your account is unavailable.");if(!state.channel)return;const isDM=!!state.channel.is_dm;const room=isDM?dmRoom(state.channel.dm_username):"channel:"+state.channel.id;const {error}=await db.from("messages").insert({sender_username:state.profile.username,recipient_username:isDM?state.channel.dm_username:null,channel_id:isDM?null:state.channel.id,message_text:text,is_dm:isDM,room_id:room});if(error)throw error}
async function renderMessages(){const box=document.getElementById("messages");if(!state.messages.length){box.innerHTML='<div class="empty">No messages yet. Start the conversation.</div>';return}const names=[...new Set(state.messages.map(m=>m.sender_username))];const {data:profiles}=await db.from("profiles").select("username,username_color,profile_tag").in("username",names);const map=Object.fromEntries((profiles||[]).map(p=>[p.username,p]));let previousSender=null,previousTime=0;box.innerHTML=state.messages.map(m=>{const p=map[m.sender_username]||{};const color=safeColor(p.username_color);const tag=p.profile_tag?`<span class="profile-tag">${escapeHtml(p.profile_tag)}</span>`:"";const time=new Date(m.created_at);const continued=previousSender===m.sender_username&&(time.getTime()-previousTime)<600000;const pingMe=new RegExp("@"+String(state.profile.username).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(m.message_text);const invite=m.message_text.match(/invite\/([A-Za-z0-9_-]+)/);previousSender=m.sender_username;previousTime=time.getTime();let content;if(invite){const pos=m.message_text.indexOf(invite[0]);content=`${renderMarkup(m.message_text.slice(0,pos),state.profile.username)}<button type="button" class="invite-button" data-invite="${escapeHtml(invite[1])}">Join channel</button>${renderMarkup(m.message_text.slice(pos+invite[0].length),state.profile.username)}`}else content=renderMarkup(m.message_text,state.profile.username);return `<article class="message ${continued?"message-continued":""} ${pingMe?"mention-highlight":""}">${continued?"":`<div class="message-meta"><span class="message-username" style="color:${color}">${escapeHtml(m.sender_username)}</span>${tag}<time>${time.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div>`}<div class="message-content">${content}</div></article>`}).join("");box.querySelectorAll("[data-invite]").forEach(btn=>btn.onclick=()=>acceptInvite(btn.dataset.invite));box.scrollTop=box.scrollHeight}
async function acceptInvite(code){
  try{
    const {data,error}=await db.rpc("accept_channel_invite",{p_invite_code:code});
    if(error)throw error;
    await loadChannels();
    const fresh=state.channels.find(c=>c.id===data);
    if(fresh) await selectChannel(fresh);
    toast("Joined #"+((fresh&&fresh.name)||"channel"));
  }catch(e){toast(e.message||String(e),true)}
}
function installComposer(){messageForm.onsubmit=async e=>{e.preventDefault();const raw=messageInput.value;const text=raw.trim();if(!text)return;const parts=text.split(/\s+/);const cmd=(parts[0]||"").toLowerCase();const arg=parts.slice(1).join(" ").trim();try{if(cmd==="/ban"||cmd==="/unban"){if(!state.isAdmin)throw new Error("Only administrators can use that command.");messageInput.value="";await adminUserCommand(cmd.slice(1),arg);messageInput.focus();return}if(cmd==="/invite"){messageInput.value="";await showInvitePicker();messageInput.focus();return}await sendMessage(raw.trimEnd());messageInput.value="";messageInput.focus()}catch(err){toast(err?.message||String(err),true)}};messageInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();messageForm.requestSubmit()}})}

async function subscribeToChannel(channel){
  if(state.realtime)await db.removeChannel(state.realtime);
  const room=channel.is_dm?dmRoom(channel.dm_username):"channel:"+channel.id;
  state.realtime=db.channel("chat:"+room).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"room_id=eq."+room},async payload=>{
    if(state.messages.some(m=>m.id===payload.new.id))return;
    const mine=payload.new.sender_username===state.profile.username;
    const active=state.channel?.is_dm?dmRoom(state.channel.dm_username)===room:"channel:"+state.channel.id===room;
    state.messages.push(payload.new);
    if(state.messages.length>100)state.messages=state.messages.slice(-100);
    if(!mine){
      const visibleFocused = document.visibilityState === "visible" && document.hasFocus();
      if(payload.new.is_dm){
        const dmActive = active && visibleFocused;
        if(!dmActive) addUnread("dm:"+String(payload.new.sender_username).toLowerCase());
      }else{
        const ping=new RegExp("@"+String(state.profile.username).replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")+"\\b","i").test(payload.new.message_text||"");
        if(ping){
          // A ping is read only when the user is actually looking at Chat.
          // Being switched to the channel while the browser tab is hidden does not count.
          if(!(active && visibleFocused)) addUnread("channel:"+payload.new.channel_id);
          const c=state.channels.find(x=>x.id===payload.new.channel_id);
          if(document.visibilityState !== "visible") showPingNotification({sender:payload.new.sender_username,roomName:c?"# "+c.name:"Channel",messageId:payload.new.id});
          else if(!active) showPingNotification({sender:payload.new.sender_username,roomName:c?"# "+c.name:"Channel",messageId:payload.new.id});
        }
      }
    }
    if(payload.new.is_dm&&payload.new.sender_username!==state.profile.username&&!state.dmThreads.some(x=>x.toLowerCase()===String(payload.new.sender_username).toLowerCase())){
      state.dmThreads.unshift(payload.new.sender_username);renderDMList();
    }
    await renderMessages();
  }).subscribe();
}

async function subscribeBackgroundMessages(){
  if(state.backgroundRealtime)await db.removeChannel(state.backgroundRealtime);
  state.backgroundRealtime=db.channel("chat-background").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{
    if(payload.new.sender_username===state.profile.username)return;
    const activeRoom=state.channel?.is_dm?dmRoom(state.channel.dm_username):(state.channel?"channel:"+state.channel.id:"");
    if(payload.new.room_id===activeRoom)return;
    if(payload.new.is_dm&&(payload.new.recipient_username||"").toLowerCase()===state.profile.username.toLowerCase()){
      addUnread("dm:"+String(payload.new.sender_username).toLowerCase());
    }else if(!payload.new.is_dm){
      const ping=new RegExp("@"+String(state.profile.username).replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")+"\\b","i").test(payload.new.message_text||"");
      if(ping){
        addUnread("channel:"+payload.new.channel_id);
        const c=state.channels.find(x=>x.id===payload.new.channel_id);
        showPingNotification({sender:payload.new.sender_username,roomName:c?"# "+c.name:"Channel",messageId:payload.new.id});
      }
    }
  }).subscribe();
}
