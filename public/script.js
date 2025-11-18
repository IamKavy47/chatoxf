// ********** CONFIG **********
const CONVEX_URL = "https://impartial-dachshund-607.convex.cloud";
const client = new convex.ConvexClient(CONVEX_URL);

// app state
let currentUser = null;
let activeOtherId = null;
let chatSubStop = null;
let listSubStop = null;
const profileCache = {};

// helpers
function q(id) { return document.getElementById(id); }

function showScreen(id) {
  ["screen-register","screen-login","screen-list"].forEach(s=>{
    const el = q(s); if(!el) return;
    el.classList.remove("active");
    el.style.display = "none";
  });
  q(id).style.display = "block";
  q(id).classList.add("active");

  if(!currentUser || !activeOtherId) q("chatPanel").classList.remove("open");
}

function showChatPanelUI() { q("chatPanel").classList.add("open"); }
function closeChat() {
  q("chatPanel").classList.remove("open");
  if(chatSubStop) chatSubStop();
  activeOtherId = null;
}

// ========== IMAGE COMPRESSION ==========
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

// ========== PROFILE HELPERS ==========
async function getProfile(userId){
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
  q("meName").innerText = currentUser.name;
  q("meUser").innerText = "@"+currentUser.username;

  if(currentUser.profilePic){
    try {
      const url = await client.mutation("storage:getPFPUrl",{storageId:currentUser.profilePic});
      q("meAvatarImg").src = url;
      q("meAvatarImg").style.display = "block";
    } catch {}
  } else {
    q("meAvatarImg").style.display = "none";
  }
}

// ========== OTP REGISTRATION FLOW ==========
let pendingRegistration = null;

// STEP 1 — Request OTP
async function onRegister(){
  const name = q("regName").value.trim();
  const username = q("regUser").value.trim();
  const email = q("regEmail").value.trim();
  const password = q("regPass").value;

  if(!name || !username || !email || !password)
    return alert("Please fill all fields");

  try {
    const otp = await client.mutation("otp:requestOtp", {
      email,
      purpose: "register"
    });

    // send OTP to your Gmail backend (wrap in try/catch so UI flow remains predictable)
    try {
      const res = await fetch("http://localhost:5000/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp })
      });
      // optional: check response
      const j = await res.json();
      if(!j.ok) console.warn("OTP mailer reported failure:", j);
    } catch (e) {
      console.warn("Failed to call OTP mailer:", e);
      // continue anyway (user will still have OTP in DB)
    }

    pendingRegistration = { name, username, email, password };
    openOtpModal(email);

  } catch(err){
    alert(err.message || "Failed to send OTP");
  }
}

// OTP Modal Logic
function openOtpModal(email){
  q("otpModalOverlay").style.display = "flex";
  q("otpEmailDisplay").innerText = email;

  document.querySelectorAll(".otp-input").forEach(i=>i.value="");
  startOtpTimer();
}

function closeOtpModal(){
  q("otpModalOverlay").style.display = "none";
  // clear timer if any
  if (otpInterval) {
    clearInterval(otpInterval);
    otpInterval = null;
  }
}

// OTP timer
let otpTime = 30;
let otpInterval = null;

function startOtpTimer(){
  // prevent multiple intervals
  if (otpInterval) {
    clearInterval(otpInterval);
    otpInterval = null;
  }

  otpTime = 30;
  q("otpResendBtn").disabled = true;

  otpInterval = setInterval(()=>{
    otpTime--;
    q("otpTimer").innerText = `Resend in ${otpTime}s`;

    if(otpTime <= 0){
      clearInterval(otpInterval);
      otpInterval = null;
      q("otpTimer").innerText = "";
      q("otpResendBtn").disabled = false;
    }
  },1000);
}

// resend OTP
q("otpResendBtn").onclick = async ()=>{
  if(!pendingRegistration) return;
  try {
    const otp = await client.mutation("otp:requestOtp",{
      email: pendingRegistration.email,
      purpose: "register"
    });

    try {
      const res = await fetch("http://localhost:5000/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingRegistration.email, otp })
      });
      const j = await res.json();
      if(!j.ok) console.warn("OTP mailer reported failure on resend:", j);
    } catch (e) {
      console.warn("Failed to call OTP mailer on resend:", e);
    }

    startOtpTimer();
  } catch (e) {
    alert(e.message || "Failed to resend OTP");
  }
};

// verify OTP
async function verifyOtp(){
  // ensure we have pending registration context
  if(!pendingRegistration || !pendingRegistration.email) {
    return alert("No pending registration — please request OTP first");
  }

  const boxes = [...document.querySelectorAll(".otp-input")];
  const otp = boxes.map(b => b.value.trim()).join("");

  if(otp.length !== 6)
    return alert("Enter full 6-digit OTP");

  try {
    const ok = await client.query("otp:verifyOtp", {
      email: pendingRegistration.email,
      otp,
      purpose: "register"
    });

    if(!ok)
      return alert("Invalid or expired OTP");

    // OTP SUCCESS → Create user
    const created = await client.mutation("users:register",{
      name: pendingRegistration.name,
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      password: pendingRegistration.password
    });

    currentUser = created;
    // clear pending
    pendingRegistration = null;
    closeOtpModal();
    openPfpModal();

  } catch(e){
    alert(e.message || "Verification failed");
  }
}


// ========== LOGIN ==========
async function onLogin(){
  const username = q("loginUser").value.trim();
  const pass = q("loginPass").value;
  if(!username || !pass) return alert("Provide credentials");

  try{
    const u = await client.mutation("users:login",{username,password:pass});
    currentUser = await client.query("users:getUserById",{id:u._id});
    afterLogin();
  }catch(e){
    alert(e.message);
  }
}

function afterLogin(){
  showScreen("screen-list");
  setMyProfileUI();
  startChatListSubscription();
}

// ========== LOGOUT ==========
function logout(){
  currentUser = null;
  activeOtherId = null;
  if(chatSubStop) chatSubStop();
  if(listSubStop) listSubStop();
  q("threadList").innerHTML = "";
  q("messages").innerHTML = "";
  showRegister();
}

// ========== UI navigate ==========
function showRegister(){ showScreen("screen-register"); }
function showLogin(){ showScreen("screen-login"); }
function showList(){ showScreen("screen-list"); }

// ========== SEARCH ==========
let lastSearch = null;

async function onSearch(){
  if(!currentUser) return alert("Login first");
  const username = q("searchInput").value.trim();
  if(!username) return;

  try{
    const u = await client.query("users:searchUser",{username});
    if(!u) return alert("User not found");

    lastSearch = u;
    q("searchResult").style.display = "block";
    q("srName").innerText = u.name;
    q("srUser").innerText = "@"+u.username;

    if(u.profilePic){
      try{
        const url = await client.mutation("storage:getPFPUrl",{storageId:u.profilePic});
        q("srAvatarImg").src = url;
        q("srAvatarImg").style.display = "block";
      }catch{}
    } else q("srAvatarImg").style.display = "none";

  }catch(e){
    alert(e.message);
  }
}

async function startChatWithSearch(){
  if(!lastSearch) return;
  await openChat(lastSearch._id);
  q("searchResult").style.display = "none";
  q("searchInput").value = "";
}

// ========== CHAT LIST SUBSCRIPTION ==========
function startChatListSubscription(){
  if(listSubStop) listSubStop();

  listSubStop = client.onUpdate("chatList:getChatList",{userId:currentUser._id}, async (threads)=>{
    const container = q("threadList");
    container.innerHTML = "";

    if(!threads || threads.length===0){
      container.innerHTML = "<div style='color:rgba(255,255,255,0.6)'>No chats yet</div>";
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

// ========== OPEN CHAT ==========
async function openChat(otherUserId){
  if(!currentUser) return alert("Login first");

  activeOtherId = otherUserId;

  const other = await getProfile(otherUserId);

  q("chatName").innerText = other?.name || "Unknown";
  q("chatUser").innerText = "@"+(other?.username || "");

  if(other?.avatarUrl){
    q("chatAvatarImg").src = other.avatarUrl;
    q("chatAvatarImg").style.display = "block";
  } else q("chatAvatarImg").style.display="none";

  try{
    await client.mutation("privateChat:markThreadRead",{userId:currentUser._id, otherId:otherUserId});
  }catch{}

  showChatPanelUI();

  if(chatSubStop) chatSubStop();
  chatSubStop = client.onUpdate(
    "privateChat:getPrivateMessages",
    {senderId:currentUser._id, receiverId:otherUserId},
    (msgs)=>{
      const box = q("messages");
      box.innerHTML = "";
      msgs.forEach(m=>{
        const b = document.createElement("div");
        b.className = "bubble " + (m.senderId===currentUser._id ? "me" : "");
        b.innerText = m.body;
        const time = document.createElement("div");
        time.className = "meta";
        time.innerText = new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        b.appendChild(time);
        box.appendChild(b);
      });
      box.scrollTop = box.scrollHeight;
    }
  );
}

// ========== SEND MESSAGE ==========
async function onSend(){
  const txt = q("msgInput").value.trim();
  if(!txt || !activeOtherId) return;

  await client.mutation("privateChat:sendPrivateMessage",{
    senderId:currentUser._id,
    receiverId:activeOtherId,
    body:txt
  });

  q("msgInput").value = "";
}

// initial screen
showRegister();

// background parallax
document.addEventListener("mousemove",e=>{
  const x = (e.clientX/window.innerWidth - 0.5) * 10;
  const y = (e.clientY/window.innerHeight - 0.5) * 10;
  document.body.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
});

// ========== PROFILE & PFP ==========
let pfpFile = null;
let pfpZoom = 1;

function openPfpModal(){
  q("pfpModalOverlay").style.display="flex";
  q("pfpPreviewImg").style.display="none";
  q("pfpFile").value="";
  q("pfpZoom").value=1;
  pfpFile=null;
  pfpZoom=1;
}

function skipPfp(){
  q("pfpModalOverlay").style.display="none";
  (async()=>{
    currentUser = await client.query("users:getUserById",{id:currentUser._id});
    afterLogin();
  })();
}

q("pfpFile").addEventListener("change",e=>{
  const file = e.target.files[0];
  if(!file) return;
  pfpFile = file;
  const r = new FileReader();
  r.onload = ()=>{
    q("pfpPreviewImg").style.display="block";
    q("pfpPreviewImg").src = r.result;
  };
  r.readAsDataURL(file);
});

q("pfpZoom").oninput = e=>{
  pfpZoom = parseFloat(e.target.value);
  q("pfpPreviewImg").style.transform = `scale(${pfpZoom})`;
};

// upload PFP
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

    // make sure userId is provided
    if(!currentUser || !currentUser._id) {
      throw new Error("No currentUser set – cannot save PFP");
    }

    await client.mutation("storage:savePFP",{userId:currentUser._id, storageId});
    currentUser = await client.query("users:getUserById",{id:currentUser._id});
    setMyProfileUI();

    q("pfpModalOverlay").style.display="none";
    afterLogin();

  }catch(e){
    alert("Failed to upload picture: " + (e.message || e));
  }
}

// profile modal
let profileIsOwner = false;
async function openMyProfile(){
  if(!currentUser) return;
  profileIsOwner = true;
  await fillProfileModal(currentUser, true);
  q("profileModalOverlay").style.display = "flex";
  q("profileModalOverlay").setAttribute("aria-hidden","false");
}

async function openOtherProfile(userId){
  // fetch public profile
  const u = await client.query("users:getPublicProfile", { userId });
  if(!u) return alert("User not found");
  profileIsOwner = (currentUser && currentUser._id === userId);
  await fillProfileModal(u, profileIsOwner);
  q("profileModalOverlay").style.display = "flex";
  q("profileModalOverlay").setAttribute("aria-hidden","false");
}

function closeProfileModal(){
  q("profileModalOverlay").style.display = "none";
  q("profileModalOverlay").setAttribute("aria-hidden","true");
}

async function fillProfileModal(userObj, editable){
  // userObj may be currentUser or public
  q("profileNameDisplay").innerText = userObj.name || "";
  q("profileUsernameDisplay").innerText = "@"+(userObj.username || "");
  if(userObj.profilePic){
    try{
      const url = await client.mutation("storage:getPFPUrl", { storageId: userObj.profilePic });
      q("profileAvatarImg").src = url;
      q("profileAvatarImg").style.display = "block";
    }catch(e){
      q("profileAvatarImg").style.display = "none";
    }
  } else {
    q("profileAvatarImg").style.display = "none";
  }

  if(editable){
    q("profileEditArea").style.display = "block";
    q("profileReadOnlyAbout").style.display = "none";
    // fill inputs
    q("editName").value = userObj.name || "";
    q("editUsername").value = userObj.username || "";
    q("editAbout").value = userObj.about || "";
    // attach live checking on username
    q("editUsername").oninput = async ()=>{
      const val = q("editUsername").value.trim();
      if(!val) { q("usernameStatus").innerText = ""; return; }
      try{
        const available = await client.query("users:checkUsername", { username: val });
        if(available || val === (currentUser && currentUser.username)){
          q("usernameStatus").innerText = "Available ✔";
          q("usernameStatus").className = "status-available";
        } else {
          q("usernameStatus").innerText = "Unavailable ✖";
          q("usernameStatus").className = "status-unavailable";
        }
      }catch(e){
        q("usernameStatus").innerText = "";
      }
    };
    // wire upload file
    q("editPfpFile").onchange = (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if(!f) return;
      // show preview in profile avatar
      const r = new FileReader();
      r.onload = ()=>{
        q("profileAvatarImg").src = r.result;
        q("profileAvatarImg").style.display = "block";
      };
      r.readAsDataURL(f);
    };
  } else {
    q("profileEditArea").style.display = "none";
    q("profileReadOnlyAbout").style.display = "block";
    q("profileReadOnlyAbout").innerText = userObj.about || "";
  }
}

async function saveProfile(){
  if(!currentUser) return;
  const name = q("editName").value.trim();
  const username = q("editUsername").value.trim();
  const about = q("editAbout").value;

  // validation: username availability
  try{
    const available = await client.query("users:isUsernameAvailable", { username });
    if(!available && username !== currentUser.username){
      alert("Username is taken");
      return;
    }
  }catch(e){
    // ignore
  }

  try{
    await client.mutation("users:updateProfile", {
      userId: currentUser._id,
      name,
      username,
      about
    });

    // if new pfp file selected
    const pf = q("editPfpFile").files && q("editPfpFile").files[0];
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

      // ensure currentUser exists
      if(!currentUser || !currentUser._id) {
        throw new Error("No currentUser set – cannot save PFP");
      }

      await client.mutation("storage:savePFP", {
        userId: currentUser._id,
        storageId,
      });
    }


    // refresh current user
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
    // update modal UI
    q("profileAvatarImg").style.display = "none";
  }catch(e){
    alert("Failed to remove");
  }
}

// ---------- helper to open profile when clicking avatar in header or thread list ----------
// make header avatar clickable to open own profile
q("meAvatar").addEventListener("click", ()=> openMyProfile());
// make chat header avatar clickable (view other's profile)
q("chatAvatar").addEventListener("click", async ()=>{
  if(!activeOtherId) return;
  await openOtherProfile(activeOtherId);
});

window.LG = {client, getProfile, openChat, logout};
