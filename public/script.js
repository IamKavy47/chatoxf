// script.js — merged, cleaned, and fully animated
// Dependencies required on page:
// - gsap + CSSRulePlugin
// - convex (Convex client library loaded globally as `convex`)

// ============================================
// ============ CONFIG / STATE ================
// ============================================
const CONVEX_URL = "https://doting-pony-792.convex.cloud";
const client = new convex.ConvexClient(CONVEX_URL);

// App state
let currentUser = null;
let activeOtherId = null;
let chatSubStop = null;
let listSubStop = null;
const profileCache = {};

// Pending registration for OTP flow
let pendingRegistration = null;

// OTP timer state
let otpTime = 30;
let otpInterval = null;

// Profile modal state
let profileIsOwner = false;

// PFP upload state
let pfpFile = null;
let pfpZoom = 1;

// Last search result
let lastSearch = null;

// Helper
function q(id) { return document.getElementById(id); }

// Safe query helper
function $(sel) { return document.querySelectorAll(sel); }

// ============================================
// ========== IMAGE COMPRESSION ===============
// ============================================
async function compressImage(file, maxWidth=420, quality=0.72){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w; 
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const mime = file.type || "image/jpeg";
        const data = canvas.toDataURL(mime, quality);
        resolve(data);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// ========== PROFILE HELPERS =================
// ============================================
async function getProfile(userId){
  if(!userId) return null;
  if(profileCache[userId]) return profileCache[userId];
  const p = await client.query("users:getUserById",{id:userId});
  if(p && p.profilePic){
    try { p.avatarUrl = await client.mutation("storage:getPFPUrl", {storageId:p.profilePic}); }
    catch {}
  }
  profileCache[userId] = p;
  return p;
}

async function setMyProfileUI(){
  if(!currentUser) return;
  if(q("meName")) q("meName").innerText = currentUser.name || "";
  if(q("meUser")) q("meUser").innerText = "@"+(currentUser.username || "");
  if(currentUser.profilePic){
    try {
      const url = await client.mutation("storage:getPFPUrl",{storageId:currentUser.profilePic});
      if(q("meAvatarImg")) { q("meAvatarImg").src = url; q("meAvatarImg").style.display = "block"; }
    } catch {}
  } else if(q("meAvatarImg")) q("meAvatarImg").style.display = "none";
}

// ============================================
// ========== OTP REGISTRATION FLOW ===========
// ============================================
async function onRegister(){
  const name = q("regName")?.value.trim();
  const username = q("regUser")?.value.trim();
  const email = q("regEmail")?.value.trim();
  const password = q("regPass")?.value;

  if(!name || !username || !email || !password)
    return alert("Please fill all fields");

  try {
    // 1️⃣ request OTP from Convex
    let rawOtp = await client.mutation("otp:requestOtp", {
      email,
      purpose: "register"
    });

    // 2️⃣ fix OTP format (Convex may return object, number, or undefined)
    let otp = (typeof rawOtp === "object" && rawOtp?.otp)
      ? String(rawOtp.otp)
      : String(rawOtp || "");

    console.log("Sending OTP:", otp); // debug log

    // 3️⃣ send OTP email
    try {
      const res = await fetch("https://chatmail-tan.vercel.app/api/send-otp", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp })
      });

      const j = await res.json().catch(()=>null);
      if(!j || !j.ok) console.warn("OTP mailer reported failure:", j);

    } catch (e) {
      console.warn("Failed to call OTP mailer:", e);
    }

    // 4️⃣ hold data locally until OTP success
    pendingRegistration = { name, username, email, password };

    // 5️⃣ open OTP modal
    openOtpModal(email);

  } catch(err){
    alert(err.message || "Failed to send OTP");
  }
}


function openOtpModal(email){
  if(!q("otpModalOverlay")) return;
  q("otpModalOverlay").style.display = "flex";
  if(q("otpEmailDisplay")) q("otpEmailDisplay").innerText = email || "";

  document.querySelectorAll(".otp-input").forEach(i=>i.value="");
  const otpInputs = document.querySelectorAll(".otp-input");
  if(otpInputs && otpInputs.length) otpInputs[0].focus();
  startOtpTimer();

  // entrance animation for otp inputs
  if(window.gsap) {
    gsap.from('.otp-input', {
      duration: 0.4,
      opacity: 0,
      y: 10,
      stagger: 0.08,
      ease: 'back.out'
    });
  }
}

function closeOtpModal(){
  if(!q("otpModalOverlay")) return;
  q("otpModalOverlay").style.display = "none";
  if (otpInterval) {
    clearInterval(otpInterval);
    otpInterval = null;
  }
}

function startOtpTimer(){
  if (otpInterval) {
    clearInterval(otpInterval);
    otpInterval = null;
  }

  otpTime = 30;
  if(q("otpResendBtn")) q("otpResendBtn").disabled = true;

  otpInterval = setInterval(()=>{
    otpTime--;
    if(q("otpTimer")) q("otpTimer").innerText = `Resend in ${otpTime}s`;

    if(otpTime <= 0){
      clearInterval(otpInterval);
      otpInterval = null;
      if(q("otpTimer")) q("otpTimer").innerText = "";
      if(q("otpResendBtn")) q("otpResendBtn").disabled = false;
    }
  },1000);
}

async function verifyOtp(){
  if(!pendingRegistration || !pendingRegistration.email) {
    return alert("No pending registration — please request OTP first");
  }

  const boxes = [...document.querySelectorAll(".otp-input")];
  const otp = boxes.map(b => b.value.trim()).join("");

  if(otp.length !== 6){
    // visual shake if gsap available
    if(window.gsap) {
      gsap.to('.otp-input', {
        duration: 0.4,
        x: 0,
        ease: 'back.inOut',
        onStart: () => {
          gsap.to('.otp-input', { x: -8, duration: 0.1 });
        }
      });
    }
    return alert("Enter full 6-digit OTP");
  }

  try {
    const ok = await client.query("otp:verifyOtp", {
      email: pendingRegistration.email,
      otp,
      purpose: "register"
    });

    if(!ok){
      if(window.gsap) {
        gsap.to('.otp-input', { duration: 0.4, x: 0, ease: 'back.inOut', onStart: () => gsap.to('.otp-input', { x: -8, duration: 0.1 }) });
      }
      return alert("Invalid or expired OTP");
    }

    // OTP SUCCESS → Create user
    const created = await client.mutation("users:register",{
      name: pendingRegistration.name,
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      password: pendingRegistration.password
    });

    currentUser = created;
    pendingRegistration = null;
    closeOtpModal();
    openPfpModal();

  } catch(e){
    alert(e.message || "Verification failed");
  }
}

// resend OTP handler
if (q("otpResendBtn")) {
  q("otpResendBtn").onclick = async () => {
    if (!pendingRegistration) return;

    try {
      // 1️⃣ Get OTP from Convex
      let rawOtp = await client.mutation("otp:requestOtp", {
        email: pendingRegistration.email,
        purpose: "register"
      });

      // 2️⃣ Convert OTP into a guaranteed string
      let otp = (typeof rawOtp === "object" && rawOtp?.otp)
        ? String(rawOtp.otp)
        : String(rawOtp || "");

      console.log("Resending OTP:", otp); // debug

      // 3️⃣ Send OTP email
      try {
        const res = await fetch("https://chatmail-tan.vercel.app/api/send-otp", {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: pendingRegistration.email, otp })
        });

        const j = await res.json().catch(() => null);
        if (!j || !j.ok)
          console.warn("OTP mailer reported failure on resend:", j);

      } catch (e) {
        console.warn("Failed to call OTP mailer on resend:", e);
      }

      // 4️⃣ Restart countdown
      startOtpTimer();

    } catch (e) {
      alert(e.message || "Failed to resend OTP");
    }
  };
}


// Setup OTP input behaviors (focus next, backspace, paste)
function wireOtpInputs() {
  const otpInputs = document.querySelectorAll('.otp-input');
  if(!otpInputs || otpInputs.length===0) return;
  otpInputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      if (!/^\d*$/.test(value)) {
        e.target.value = '';
        return;
      }
      if (value.length === 1 && idx < otpInputs.length - 1) {
        if(window.gsap) gsap.to(otpInputs[idx + 1], { duration: 0.2, scale: 1.1, ease: 'back.out' });
        otpInputs[idx + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        otpInputs[idx - 1].focus();
        otpInputs[idx - 1].value = '';
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text');
      const digits = pastedData.replace(/\D/g, '').split('');

      digits.forEach((digit, i) => {
        if (idx + i < otpInputs.length) {
          otpInputs[idx + i].value = digit;
          if(window.gsap) gsap.to(otpInputs[idx + i], { duration: 0.2, scale: 1.05, ease: 'back.out' }); // paste animation
        }
      });

      const lastIdx = Math.min(idx + digits.length, otpInputs.length - 1);
      otpInputs[lastIdx].focus();
    });
  });
}

// call wiring after DOM elements present
document.addEventListener('DOMContentLoaded', wireOtpInputs);

// ============================================
// ========== AUTH / LOGIN / LOGOUT ===========
// ============================================
async function onLogin(){
  const username = q("loginUser")?.value.trim();
  const pass = q("loginPass")?.value;
  if(!username || !pass) return alert("Provide credentials");

  try{
    const u = await client.mutation("users:login",{username,password:pass});
    currentUser = await client.query("users:getUserById",{id:u._id});
    afterLogin();
  }catch(e){
    alert(e.message || "Login failed");
  }
}

function afterLogin(){
  showScreen("screen-list");
  setMyProfileUI();
  startChatListSubscription();
}

function logout(){
  currentUser = null;
  activeOtherId = null;
  if(chatSubStop) chatSubStop();
  if(listSubStop) listSubStop();
  if(q("threadList")) q("threadList").innerHTML = "";
  if(q("messages")) q("messages").innerHTML = "";
  showRegister();
}

// ============================================
// ========== NAVIGATION & UI HELPERS =========
// ============================================
function showScreen(screenId) {
  ["screen-register","screen-login","screen-list"].forEach(s=>{
    const el = q(s); if(!el) return;
    el.classList.remove("active");
    el.style.display = "none";
  });
  const tgt = q(screenId);
  if(tgt) {
    tgt.style.display = "block";
    tgt.classList.add("active");
  }
  // hide chat panel if no user or no active chat
  if(q("chatPanel") && (!currentUser || !activeOtherId)) q("chatPanel").classList.remove("open");
}
function showRegister() { showScreen("screen-register"); }
function showLogin() { showScreen("screen-login"); }
function showChatList() { showScreen("screen-list"); if(window.gsap) gsap.from('.thread', { duration: 0.4, opacity: 0, x: -20, stagger: 0.05, ease: 'power2.out' }); }

function showChatPanelUI(){
  const chatPanel = q("chatPanel");
  if(!chatPanel) return;
  chatPanel.classList.add("open");
  // focus messages container if available
  if(q("messages")) q("messages").focus();
}

function closeChat(){
  const chatPanel = q("chatPanel");
  if(!chatPanel) return;
  // smooth close animation
  if(window.gsap) {
    gsap.to(chatPanel, { duration: 0.3, x: '100%', opacity: 0, ease: 'power2.in', onComplete: ()=> chatPanel.classList.remove('open') });
  } else {
    chatPanel.classList.remove('open');
  }
  // Stop chat subscription
  if(chatSubStop) {
    try { chatSubStop(); } catch {}
    chatSubStop = null;
  }
  activeOtherId = null;
}

// ============================================
// ========== SEARCH & START CHAT =============
// ============================================
async function onSearch(){
  if(!currentUser) return alert("Login first");
  const username = q("searchInput")?.value.trim();
  if(!username) return;

  try{
    const u = await client.query("users:searchUser",{username});
    if(!u) return alert("User not found");

    lastSearch = u;
    if(q("searchResult")) q("searchResult").style.display = "block";
    if(q("srName")) q("srName").innerText = u.name;
    if(q("srUser")) q("srUser").innerText = "@"+u.username;

    if(u.profilePic){
      try{
        const url = await client.mutation("storage:getPFPUrl",{storageId:u.profilePic});
        if(q("srAvatarImg")) { q("srAvatarImg").src = url; q("srAvatarImg").style.display = "block"; }
      }catch{}
    } else if(q("srAvatarImg")) q("srAvatarImg").style.display = "none";

  }catch(e){
    alert(e.message || "Search failed");
  }
}

async function startChatWithSearch(){
  if(!lastSearch) return;
  await openChat(lastSearch._id);
  if(q("searchResult")) q("searchResult").style.display = "none";
  if(q("searchInput")) q("searchInput").value = "";
}

// ============================================
// ========== CHAT LIST SUBSCRIPTION ==========
// ============================================
function startChatListSubscription(){
  if(!currentUser || !currentUser._id) return;
  if(listSubStop) {
    try { listSubStop(); } catch {}
    listSubStop = null;
  }

  listSubStop = client.onUpdate("chatList:getChatList",{userId:currentUser._id}, async (threads)=>{
    const container = q("threadList");
    if(!container) return;
    container.innerHTML = "";

    if(!threads || threads.length===0){
      container.innerHTML = "<div style='color:rgba(241,245,249,0.6)'>No chats yet</div>";
      return;
    }

    for(const t of threads){
      const other = await getProfile(t.otherUserId);

      const row = document.createElement("div");
      row.className = "thread";
      row.onclick = ()=>openChat(t.otherUserId,t.threadId);

      const left = document.createElement("div");
      left.className = "left";

      const avatar = document.createElement("div");
      avatar.className = "avatar-sm";
      if(other && other.avatarUrl){
        const img = document.createElement("img");
        img.src = other.avatarUrl;
        avatar.appendChild(img);
      } else {
        avatar.innerText = other ? other.name[0].toUpperCase() : "?";
      }

      left.appendChild(avatar);

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("div");
      name.className = "name";
      name.innerText = other ? other.name : "Unknown";

      const last = document.createElement("div");
      last.className = "last";
      last.innerText = t.lastMsg || "";

      meta.appendChild(name);
      meta.appendChild(last);

      const right = document.createElement("div");
      if(t.unread){
        const b = document.createElement("div");
        b.className = "badge";
        b.innerText = t.unread;
        right.appendChild(b);
      }

      row.appendChild(left);
      row.appendChild(meta);
      row.appendChild(right);

      container.appendChild(row);
    }
  });
}

// ============================================
// ========== OPEN CHAT & MESSAGES ============
// ============================================
async function openChat(otherUserId){
  if(!currentUser) return alert("Login first");
  if(!otherUserId) return;

  activeOtherId = otherUserId;

  const other = await getProfile(otherUserId);

  if(q("chatName")) q("chatName").innerText = other?.name || "Unknown";
  if(q("chatUser")) q("chatUser").innerText = "@"+(other?.username || "");

  if(other?.avatarUrl){
    if(q("chatAvatarImg")) { q("chatAvatarImg").src = other.avatarUrl; q("chatAvatarImg").style.display = "block"; }
  } else if(q("chatAvatarImg")) q("chatAvatarImg").style.display="none";

  try{
    await client.mutation("privateChat:markThreadRead",{userId:currentUser._id, otherId:otherUserId});
  }catch{}

  showChatPanelUI();

  // animate chat panel open
  const chatPanel = q("chatPanel");
  if(chatPanel && window.gsap) {
    gsap.fromTo(chatPanel, { x: '8%', opacity: 0 }, { duration: 0.35, x: 0, opacity: 1, ease: 'power2.out' });
    chatPanel.classList.add('open');
  } else if(chatPanel) {
    chatPanel.classList.add('open');
  }

  // stop old subscription if any
  if(chatSubStop) {
    try { chatSubStop(); } catch {}
    chatSubStop = null;
  }

  chatSubStop = client.onUpdate(
    "privateChat:getPrivateMessages",
    {senderId:currentUser._id, receiverId:otherUserId},
    (msgs)=>{
      const box = q("messages");
      if(!box) return;
      box.innerHTML = "";
      msgs.forEach(m=>{
        const b = document.createElement("div");
        b.className = "bubble " + (m.senderId===currentUser._id ? "me" : "");
        b.innerText = m.body;

        const time = document.createElement("div");
        time.className = "meta";
        try {
          time.innerText = new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } catch { time.innerText = ""; }
        b.appendChild(time);

        box.appendChild(b);

        // animate each bubble
        if(window.gsap) {
          gsap.from(b, { duration: 0.28, y: 10, opacity: 0, ease: 'back.out' });
        }
      });
      box.scrollTop = box.scrollHeight;
    }
  );
}

// ============================================
// ========== SEND MESSAGE ====================
// ============================================
async function onSend(){
  const txt = q("msgInput")?.value.trim();
  if(!txt || !activeOtherId) return;

  try {
    await client.mutation("privateChat:sendPrivateMessage",{
      senderId:currentUser._id,
      receiverId:activeOtherId,
      body:txt
    });
    if(q("msgInput")) q("msgInput").value = "";

    // small send animation on button
    const sendBtn = document.querySelector('.send-btn');
    if(sendBtn && window.gsap) {
      gsap.to(sendBtn, { duration: 0.12, scale: 0.92 });
      gsap.to(sendBtn, { duration: 0.35, scale: 1, ease: 'elastic.out(1.5, 0.5)', delay: 0.12 });
    }
  } catch(e){
    console.warn("Send message failed:", e);
  }
}

// support Enter to send
document.addEventListener('keydown', (e) => {
  // if focus on msgInput and Enter pressed (no shift)
  if(e.key === 'Enter' && !e.shiftKey && document.activeElement === q("msgInput")) {
    e.preventDefault();
    onSend();
  }
});

// ============================================
// ========== PROFILE EDIT / PFP =============
// ============================================
async function openMyProfile(){
  if(!currentUser) return;
  profileIsOwner = true;
  await fillProfileModal(currentUser, true);
  if(q("profileModalOverlay")) { q("profileModalOverlay").style.display = "flex"; q("profileModalOverlay").setAttribute("aria-hidden","false"); }
}

async function openOtherProfile(userId){
  const u = await client.query("users:getPublicProfile", { userId });
  if(!u) return alert("User not found");
  profileIsOwner = (currentUser && currentUser._id === userId);
  await fillProfileModal(u, profileIsOwner);
  if(q("profileModalOverlay")) { q("profileModalOverlay").style.display = "flex"; q("profileModalOverlay").setAttribute("aria-hidden","false"); }
}

function closeProfileModal(){
  if(q("profileModalOverlay")) { q("profileModalOverlay").style.display = "none"; q("profileModalOverlay").setAttribute("aria-hidden","true"); }
}

async function fillProfileModal(userObj, editable){
  if(q("profileNameDisplay")) q("profileNameDisplay").innerText = userObj.name || "";
  if(q("profileUsernameDisplay")) q("profileUsernameDisplay").innerText = "@"+(userObj.username || "");
  if(userObj.profilePic){
    try{
      const url = await client.mutation("storage:getPFPUrl", { storageId: userObj.profilePic });
      if(q("profileAvatarImg")) { q("profileAvatarImg").src = url; q("profileAvatarImg").style.display = "block"; }
    }catch(e){
      if(q("profileAvatarImg")) q("profileAvatarImg").style.display = "none";
    }
  } else if(q("profileAvatarImg")) q("profileAvatarImg").style.display = "none";

  if(editable){
    if(q("profileEditArea")) q("profileEditArea").style.display = "block";
    if(q("profileReadOnlyAbout")) q("profileReadOnlyAbout").style.display = "none";
    if(q("editName")) q("editName").value = userObj.name || "";
    if(q("editUsername")) q("editUsername").value = userObj.username || "";
    if(q("editAbout")) q("editAbout").value = userObj.about || "";

    if(q("editUsername")) {
      q("editUsername").oninput = async ()=>{
        const val = q("editUsername").value.trim();
        if(!val) { if(q("usernameStatus")) q("usernameStatus").innerText = ""; return; }
        try{
          const available = await client.query("users:checkUsername", { username: val });
          if(available || val === (currentUser && currentUser.username)){
            if(q("usernameStatus")) { q("usernameStatus").innerText = "Available ✔"; q("usernameStatus").className = "status-available"; }
          } else {
            if(q("usernameStatus")) { q("usernameStatus").innerText = "Unavailable ✖"; q("usernameStatus").className = "status-unavailable"; }
          }
        }catch(e){
          if(q("usernameStatus")) q("usernameStatus").innerText = "";
        }
      };
    }

    if(q("editPfpFile")) {
      q("editPfpFile").onchange = (ev)=>{
        const f = ev.target.files && ev.target.files[0];
        if(!f) return;
        const r = new FileReader();
        r.onload = ()=>{
          if(q("profileAvatarImg")) { q("profileAvatarImg").src = r.result; q("profileAvatarImg").style.display = "block"; }
        };
        r.readAsDataURL(f);
      };
    }
  } else {
    if(q("profileEditArea")) q("profileEditArea").style.display = "none";
    if(q("profileReadOnlyAbout")) { q("profileReadOnlyAbout").style.display = "block"; q("profileReadOnlyAbout").innerText = userObj.about || ""; }
  }
}

async function saveProfile(){
  if(!currentUser) return;
  const name = q("editName")?.value.trim();
  const username = q("editUsername")?.value.trim();
  const about = q("editAbout")?.value;

  try{
    const available = await client.query("users:isUsernameAvailable", { username });
    if(!available && username !== currentUser.username){
      alert("Username is taken");
      return;
    }
  }catch(e){}

  try{
    await client.mutation("users:updateProfile", {
      userId: currentUser._id,
      name,
      username,
      about
    });

    const pf = q("editPfpFile")?.files && q("editPfpFile").files[0];
    if (pf) {
      const dataUrl = await compressImage(pf, 800, 0.8);
      const binary = atob(dataUrl.split(",")[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: pf.type || "image/jpeg" });

      const uploadUrl = await client.mutation("storage:getUploadUrl");

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      const { storageId } = await result.json();

      if(!currentUser || !currentUser._id) throw new Error("No currentUser set – cannot save PFP");

      await client.mutation("storage:savePFP", {
        userId: currentUser._id,
        storageId,
      });
    }

    currentUser = await client.query("users:getUserById", { id: currentUser._id });
    setMyProfileUI();
    closeProfileModal();
  }catch(err){
    alert(err.message || String(err));
  }
}

async function onRemovePfp(){
  if(!currentUser) return;
  if(!confirm("Remove profile picture?")) return;
  try{
    await client.mutation("users:removePFP", { userId: currentUser._id });
    currentUser = await client.query("users:getUserById", { id: currentUser._id });
    setMyProfileUI();
    if(q("profileAvatarImg")) q("profileAvatarImg").style.display = "none";
  }catch(e){
    alert("Failed to remove");
  }
}

// PFP modal helpers
function openPfpModal(){
  if(q("pfpModalOverlay")) q("pfpModalOverlay").style.display="flex";
  if(q("pfpPreviewImg")) q("pfpPreviewImg").style.display="none";
  if(q("pfpFile")) q("pfpFile").value="";
  if(q("pfpZoom")) q("pfpZoom").value=1;
  pfpFile=null;
  pfpZoom=1;
}

function skipPfp(){
  if(q("pfpModalOverlay")) q("pfpModalOverlay").style.display="none";
  (async()=>{
    currentUser = await client.query("users:getUserById",{id:currentUser._id});
    afterLogin();
  })();
}

if(q("pfpFile")) q("pfpFile").addEventListener("change",e=>{
  const file = e.target.files[0];
  if(!file) return;
  pfpFile = file;
  const r = new FileReader();
  r.onload = ()=>{
    if(q("pfpPreviewImg")) { q("pfpPreviewImg").style.display="block"; q("pfpPreviewImg").src = r.result; }
  };
  r.readAsDataURL(file);
});

if(q("pfpZoom")) q("pfpZoom").oninput = e=>{
  pfpZoom = parseFloat(e.target.value);
  if(q("pfpPreviewImg")) q("pfpPreviewImg").style.transform = `scale(${pfpZoom})`;
};

async function savePfp(){
  if(!pfpFile) return skipPfp();

  try{
    const dataUrl = await compressImage(pfpFile,800,0.8);
    const binary = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);

    const blob = new Blob([bytes],{type:pfpFile.type || "image/jpeg"});
    const uploadUrl = await client.mutation("storage:getUploadUrl");

    const res = await fetch(uploadUrl,{
      method:"POST", headers:{"Content-Type":blob.type}, body:blob
    });
    const {storageId} = await res.json();

    if(!currentUser || !currentUser._id) {
      throw new Error("No currentUser set – cannot save PFP");
    }

    await client.mutation("storage:savePFP",{userId:currentUser._id, storageId});
    currentUser = await client.query("users:getUserById",{id:currentUser._id});
    setMyProfileUI();

    if(q("pfpModalOverlay")) q("pfpModalOverlay").style.display="none";
    afterLogin();

  }catch(e){
    alert("Failed to upload picture: " + (e.message || e));
  }
}

// ============================================
// ========== FRONTEND ANIMATIONS =============
// ============================================

// Initialize GSAP plugin if present
if(window.gsap && window.CSSRulePlugin) {
  try { gsap.registerPlugin(CSSRulePlugin); } catch(e){}
}

window.addEventListener('load', () => {
  if(window.gsap) {
    gsap.timeline()
      .from('.brand', { duration: 0.6, opacity: 0, y: -20, ease: 'back.out' }, 0)
      .from('.screen.active .field', { duration: 0.5, opacity: 0, y: 10, stagger: 0.08 }, 0.2);
  }
});

// Button ripple + micro interactions
if($('.btn').length) {
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      if(window.gsap) gsap.to(this, { duration: 0.18, scale: 1.03, ease: 'power2.out' });
    });

    btn.addEventListener('mouseleave', function() {
      if(window.gsap) gsap.to(this, { duration: 0.18, scale: 1, ease: 'power2.out' });
    });

    btn.addEventListener('click', function(e) {
      if(window.gsap) {
        gsap.to(this, { duration: 0.09, scale: 0.95, ease: 'power2.out' });
        gsap.to(this, { duration: 0.32, scale: 1, ease: 'elastic.out(1.5, 0.5)', delay: 0.09 });
      }
    });
  });
}

// Thread hover
if($('.thread').length) {
  document.querySelectorAll('.thread').forEach(thread => {
    thread.addEventListener('mouseenter', function() {
      if(window.gsap) gsap.to(this, { duration: 0.22, x: 6, ease: 'power2.out' });
    });
    thread.addEventListener('mouseleave', function() {
      if(window.gsap) gsap.to(this, { duration: 0.22, x: 0, ease: 'power2.out' });
    });
  });
}

// Input focus glow
if($('input:not(.otp-input), textarea').length) {
  document.querySelectorAll('input:not(.otp-input), textarea').forEach(input => {
    input.addEventListener('focus', function() {
      if(window.gsap) gsap.to(this, { duration: 0.2, boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)', ease: 'power2.out' });
    });

    input.addEventListener('blur', function() {
      if(window.gsap) gsap.to(this, { duration: 0.2, boxShadow: 'none', ease: 'power2.out' });
    });
  });
}

// FAB hover
if($('.fab').length) {
  document.querySelectorAll('.fab').forEach(fab => {
    fab.addEventListener('mouseenter', function() {
      if(window.gsap) gsap.to(this, { duration: 0.3, scale: 1.1, rotation: 10, ease: 'back.out' });
    });
    fab.addEventListener('mouseleave', function() {
      if(window.gsap) gsap.to(this, { duration: 0.3, scale: 1, rotation: 0, ease: 'back.out' });
    });
  });
}

// Enter key handling for msgInput (with send button animation)
if(q("msgInput")) {
  q("msgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
      const sendBtn = document.querySelector('.send-btn');
      if(sendBtn && window.gsap) {
        gsap.to(sendBtn, { duration: 0.15, scale: 0.92 });
        gsap.to(sendBtn, { duration: 0.3, scale: 1, ease: 'elastic.out(1.5, 0.5)', delay: 0.15 });
      }
    }
  });
}

// Background parallax
document.addEventListener("mousemove",e=>{
  const x = (e.clientX/window.innerWidth - 0.5) * 10;
  const y = (e.clientY/window.innerHeight - 0.5) * 10;
  document.body.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
});

// Small helpers for animated opens
function openOtpModalWithAnimation(email){ openOtpModal(email); if(window.gsap) gsap.from('.otp-input', { duration: 0.4, opacity: 0, y: 10, stagger: 0.08, ease: 'back.out' }); }
function showChatListAnimated() { showChatList(); if(window.gsap) gsap.from('.thread', { duration: 0.4, opacity: 0, x: -20, stagger: 0.05, ease: 'power2.out' }); }
function openChatAnimated(otherId) { openChat(otherId); const chatPanel = q('chatPanel'); if(chatPanel && window.gsap) gsap.to(chatPanel, { duration: 0.3, x: 0, opacity: 1, ease: 'power2.out' }); }
function closeChatAnimated() { const chatPanel = q('chatPanel'); if(chatPanel && window.gsap) gsap.to(chatPanel, { duration: 0.3, x: '100%', opacity: 0, ease: 'power2.in', onComplete: () => closeChat() }); }

// wire avatar click shortcuts if present
if(q("meAvatar")) q("meAvatar").addEventListener("click", ()=> openMyProfile());
if(q("chatAvatar")) q("chatAvatar").addEventListener("click", async ()=>{ if(!activeOtherId) return; await openOtherProfile(activeOtherId); });

// export debug hooks
window.LG = {client, getProfile, openChat, logout, openOtpModal, openPfpModal};

// ============================================
// ========== INITIALIZE SCREEN ===============
// ============================================
showRegister();
wireOtpInputs();
