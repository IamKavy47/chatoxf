// ********** CONFIG **********
const CONVEX_URL = "https://doting-pony-792.convex.cloud";
// const CONVEX_URL = "https://impartial-dachshund-607.convex.cloud";
const client = new convex.ConvexClient(CONVEX_URL);

// app state
let currentUser = null;
let activeOtherId = null;
let chatSubStop = null;
let listSubStop = null;
let currentReplyTarget = null;
const REACTION_SET = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const profileCache = {};

window.onload = async () => {
  const stored = localStorage.getItem("mindmate_user");
  if (stored) {
    try {
      const user = JSON.parse(stored);
      // Verify user still exists (optional, but good practice)
      const freshUser = await client.query("users:getUserById", {
        id: user._id,
      });
      if (freshUser) {
        currentUser = freshUser;
        afterLogin();
        return;
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }
  // If no session, show register/login
  showRegister();
};

// helpers
function q(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  ["screen-register", "screen-login", "screen-list"].forEach((s) => {
    const el = q(s);
    if (!el) return;
    el.classList.remove("active");
    el.style.display = "none";
  });
  q(id).style.display = "flex"; // Changed to flex to match CSS
  q(id).classList.add("active");

  if (!currentUser || !activeOtherId) q("chatPanel").classList.remove("open");
}

function showChatPanelUI() {
  q("chatPanel").classList.add("open");
}
function closeChat() {
  q("chatPanel").classList.remove("open");
  if (chatSubStop && typeof chatSubStop === "function") {
    try {
      chatSubStop();
    } catch (e) {
      console.error("Error unsubscribing from chat:", e);
    }
  }
  chatSubStop = null;
  activeOtherId = null;
}

// ========== IMAGE COMPRESSION ==========
async function compressImage(file, maxWidth = 420, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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
async function getProfile(userId) {
  if (profileCache[userId]) return profileCache[userId];
  const p = await client.query("users:getUserById", { id: userId });
  if (p && p.profilePic) {
    try {
      p.avatarUrl = await client.mutation("storage:getPFPUrl", {
        storageId: p.profilePic,
      });
    } catch {}
  }
  profileCache[userId] = p;
  return p;
}

async function setMyProfileUI() {
  if (!currentUser) return;
  if (q("meNameDisplay")) q("meNameDisplay").innerText = currentUser.name;
  if (q("meUser")) q("meUser").innerText = "@" + currentUser.username;

  if (currentUser.profilePic) {
    try {
      const url = await client.mutation("storage:getPFPUrl", {
        storageId: currentUser.profilePic,
      });
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
async function onRegister() {
  const name = q("regName").value.trim();
  const username = q("regUser").value.trim();
  const email = q("regEmail").value.trim();
  const password = q("regPass").value;

  if (!name || !username || !email || !password)
    return alert("Please fill all fields");

  try {
    const otp = await client.mutation("otp:requestOtp", {
      email,
      purpose: "register",
    });

    // send OTP to your Gmail backend (wrap in try/catch so UI flow remains predictable)
    try {
      const res = await fetch("https://chatmail-tan.vercel.app/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      // optional: check response
      const j = await res.json();
      if (!j.ok) console.warn("OTP mailer reported failure:", j);
    } catch (e) {
      console.warn("Failed to call OTP mailer:", e);
      // continue anyway (user will still have OTP in DB)
    }

    pendingRegistration = { name, username, email, password };
    openOtpModal(email);
  } catch (err) {
    alert(err.message || "Failed to send OTP");
  }
}

// OTP Modal Logic
function openOtpModal(email) {
  q("otpModalOverlay").style.display = "flex";
  q("otpEmailDisplay").innerText = email;

  const inputs = document.querySelectorAll(".otp-input");
  inputs.forEach((i) => (i.value = ""));

  setupOtpAutoFocus();

  // Focus first input
  if (inputs[0]) inputs[0].focus();

  startOtpTimer();
}

function closeOtpModal() {
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

function startOtpTimer() {
  // prevent multiple intervals
  if (otpInterval) {
    clearInterval(otpInterval);
    otpInterval = null;
  }

  otpTime = 30;
  if (q("otpResendBtn")) q("otpResendBtn").disabled = true;

  otpInterval = setInterval(() => {
    otpTime--;
    if (q("otpTimer")) q("otpTimer").innerText = `Resend in ${otpTime}s`;

    if (otpTime <= 0) {
      clearInterval(otpInterval);
      otpInterval = null;
      if (q("otpTimer")) q("otpTimer").innerText = "";
      if (q("otpResendBtn")) q("otpResendBtn").disabled = false;
    }
  }, 1000);
}

// resend OTP
if (q("otpResendBtn")) {
  q("otpResendBtn").onclick = async () => {
    if (!pendingRegistration) return;
    try {
      const otp = await client.mutation("otp:requestOtp", {
        email: pendingRegistration.email,
        purpose: "register",
      });

      try {
        const res = await fetch(
          "https://chatmail-tan.vercel.app/api/send-otp",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: pendingRegistration.email, otp }),
          }
        );
        const j = await res.json();
        if (!j.ok) console.warn("OTP mailer reported failure on resend:", j);
      } catch (e) {
        console.warn("Failed to call OTP mailer on resend:", e);
      }

      startOtpTimer();
    } catch (e) {
      alert(e.message || "Failed to resend OTP");
    }
  };
}

// verify OTP
async function verifyOtp() {
  // ensure we have pending registration context
  if (!pendingRegistration || !pendingRegistration.email) {
    return alert("No pending registration — please request OTP first");
  }

  const boxes = [...document.querySelectorAll(".otp-input")];
  const otp = boxes.map((b) => b.value.trim()).join("");

  if (otp.length !== 6) return alert("Enter full 6-digit OTP");

  try {
    const ok = await client.query("otp:verifyOtp", {
      email: pendingRegistration.email,
      otp,
      purpose: "register",
    });

    if (!ok) return alert("Invalid or expired OTP");

    // OTP SUCCESS → Create user
    const created = await client.mutation("users:register", {
      name: pendingRegistration.name,
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      password: pendingRegistration.password,
    });

    currentUser = created;
    localStorage.setItem("mindmate_user", JSON.stringify(currentUser));

    // clear pending
    pendingRegistration = null;
    closeOtpModal();
    openPfpModal();
  } catch (e) {
    alert(e.message || "Verification failed");
  }
}

function setupOtpAutoFocus() {
  const inputs = document.querySelectorAll(".otp-input");

  inputs.forEach((input, index) => {
    // Remove any existing listeners to prevent duplicates
    input.replaceWith(input.cloneNode(true));
  });

  // Re-query after cloning
  const freshInputs = document.querySelectorAll(".otp-input");

  freshInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;

      // Only allow numbers
      if (value && !/^\d$/.test(value)) {
        e.target.value = "";
        return;
      }

      // Move to next input if value entered
      if (value && index < freshInputs.length - 1) {
        freshInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      // Handle backspace - move to previous input if current is empty
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        freshInputs[index - 1].focus();
      }

      // Handle left arrow
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        freshInputs[index - 1].focus();
      }

      // Handle right arrow
      if (e.key === "ArrowRight" && index < freshInputs.length - 1) {
        e.preventDefault();
        freshInputs[index + 1].focus();
      }
    });

    // Handle paste
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text").trim();

      // Only process if it's 6 digits
      if (/^\d{6}$/.test(pastedData)) {
        pastedData.split("").forEach((char, i) => {
          if (freshInputs[i]) {
            freshInputs[i].value = char;
          }
        });
        // Focus last input
        freshInputs[5].focus();
      }
    });
  });
}

// ========== LOGIN ==========
async function onLogin() {
  const username = q("loginUser").value.trim();
  const pass = q("loginPass").value;
  if (!username || !pass) return alert("Provide credentials");

  try {
    const u = await client.mutation("users:login", {
      username,
      password: pass,
    });
    currentUser = await client.query("users:getUserById", { id: u._id });

    localStorage.setItem("mindmate_user", JSON.stringify(currentUser));

    afterLogin();
  } catch (e) {
    alert(e.message);
  }
}

function afterLogin() {
  showScreen("screen-list");
  setMyProfileUI();
  startChatListSubscription();
}

// ========== LOGOUT ==========
function logout() {
  currentUser = null;
  activeOtherId = null;
  localStorage.removeItem("mindmate_user");

  if (chatSubStop && typeof chatSubStop === "function") {
    try {
      chatSubStop();
    } catch (e) {
      console.error("Error unsubscribing from chat:", e);
    }
  }
  if (listSubStop && typeof listSubStop === "function") {
    try {
      listSubStop();
    } catch (e) {
      console.error("Error unsubscribing from list:", e);
    }
  }
  chatSubStop = null;
  listSubStop = null;

  q("threadList").innerHTML = "";
  q("messages").innerHTML = "";
  showRegister();
}

// ========== UI navigate ==========
function showRegister() {
  showScreen("screen-register");
}
function showLogin() {
  showScreen("screen-login");
}
function showList() {
  showScreen("screen-list");
}

// ========== SEARCH ==========

function openSearchPanel() {
  q("searchPanel").classList.add("open");
  q("searchInput").focus();
}

function closeSearchPanel() {
  q("searchPanel").classList.remove("open");
  q("searchInput").value = "";
  q("searchResults").innerHTML = `
    <div style="text-align:center; color:var(--text-secondary); margin-top:40px;">
      <i class="ri-search-2-line" style="font-size: 32px; margin-bottom:12px; display:block;"></i>
      Type a username to find people
    </div>
  `;
}

let searchDebounce = null;
function onSearchInput(e) {
  clearTimeout(searchDebounce);
  const val = e.target.value.trim();

  if (!val) {
    q("searchResults").innerHTML = "";
    return;
  }

  searchDebounce = setTimeout(() => performSearch(val), 500);
}

async function performSearch(username) {
  try {
    // Note: The backend currently only supports exact match via 'searchUser' which returns a single user.
    // If you have a fuzzy search, use that. For now, we use the existing query.
    const u = await client.query("users:searchUser", { username });

    const container = q("searchResults");
    container.innerHTML = "";

    if (!u) {
      container.innerHTML = `<div style="text-align:center; color:#666; margin-top:20px;">No user found</div>`;
      return;
    }

    if (currentUser && u._id === currentUser._id) {
      container.innerHTML = `<div style="text-align:center; color:#666; margin-top:20px;">That's you!</div>`;
      return;
    }

    // Render result item
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.onclick = () => startChatWithSearch(u);

    let avatarHtml = `<div class="avatar-circle" style="width:40px; height:40px; background:#333; display:grid; place-items:center;">${u.name[0]}</div>`;

    if (u.profilePic) {
      // We need to fetch the URL. Since this is async inside a sync render, we'll load it after.
      // Or we can just use the placeholder and let the click handle the full load.
      // Better: fetch it now.
      client
        .mutation("storage:getPFPUrl", { storageId: u.profilePic })
        .then((url) => {
          item.querySelector(".avatar-circle").innerHTML =
            `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
        });
    }

    item.innerHTML = `
      ${avatarHtml}
      <div>
        <div style="font-weight:600; color:white;">${u.name}</div>
        <div style="font-size:12px; color:var(--text-secondary);">@${u.username}</div>
      </div>
      <i class="ri-message-3-line" style="margin-left:auto; color:var(--accent-green);"></i>
    `;

    container.appendChild(item);
  } catch (e) {
    console.error(e);
  }
}

async function startChatWithSearch(userObj) {
  if (!userObj) return;
  await openChat(userObj._id);
  closeSearchPanel();
}

// ========== OPEN CHAT ==========
async function openChat(otherUserId) {
  if (!currentUser) return alert("Login first");

  activeOtherId = otherUserId;

  const other = await getProfile(otherUserId);

  q("chatName").innerText = other?.name || "Unknown";
  if (q("chatUser")) q("chatUser").innerText = "@" + (other?.username || "");

  try {
    await client.mutation("privateChat:markThreadRead", {
      userId: currentUser._id,
      otherId: otherUserId,
    });
  } catch {}

  showChatPanelUI();

  if (chatSubStop && typeof chatSubStop === "function") {
    try {
      chatSubStop();
    } catch (e) {
      console.error("Error unsubscribing from previous chat:", e);
    }
  }

  chatSubStop = client.onUpdate(
    "privateChat:getPrivateMessages",
    { senderId: currentUser._id, receiverId: otherUserId },
    (msgs) => {
      const box = q("messages");
      box.innerHTML = "";

      msgs.forEach((m) => {
        const b = document.createElement("div");
        b.className = "bubble " + (m.senderId === currentUser._id ? "me" : "");
        b.dataset.msgId = m._id;

        // -------- reply preview inside message --------
        if (m.replyTo && m.replyTo.body) {
          const r = document.createElement("div");
          r.className = "reply-preview";
          r.innerText = `${m.replyTo.senderName || "Reply"}: ${m.replyTo.body}`;
          b.appendChild(r);
        }

        // -------- message body --------
        const body = document.createElement("div");
        body.innerText = m.body;
        b.appendChild(body);

        // -------- reactions --------
        if (m.reactions && Object.keys(m.reactions).length) {
          const bar = document.createElement("div");
          bar.className = "reaction-display";

          const count = {};
          for (const [uid, emoji] of Object.entries(m.reactions))
            count[emoji] = (count[emoji] || 0) + 1;

          for (const [emoji, c] of Object.entries(count)) {
            const pill = document.createElement("div");
            pill.className = "reaction-pill";
            pill.innerText = `${emoji} ${c}`;
            pill.onclick = () => openReactionInfo(m, emoji);
            bar.appendChild(pill);
          }

          b.appendChild(bar);
        }

        // timestamp
        const t = document.createElement("div");
        t.className = "meta";
        t.style.fontSize = "10px";
        t.style.opacity = "0.6";
        t.style.marginTop = "4px";
        t.innerText = new Date(m.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        b.appendChild(t);

        // attach long press / right click
        attachMessageInteractionHandlers(b, m);

        box.appendChild(b);
      });

      box.scrollTop = box.scrollHeight;
    }
  );
}

// ========== SEND MESSAGE ==========
async function onSend() {
  const input = q("msgInput");
  const txt = input.value.trim();
  if (!txt || !activeOtherId) return;

  // 🔥 FIX → clear immediately
  input.value = "";


  const payload = {
    senderId: currentUser._id,
    receiverId: activeOtherId,
    body: txt,
    replyToId: currentReplyTarget ? currentReplyTarget._id : undefined,
  };

  // send user message to DB (existing behavior)
  await client.mutation("privateChat:sendPrivateMessage", payload);

  // ===== AI SEND HOOK (FIXED) =====
  // Use the correct variable (txt) and call the backend action + mutation names
  // that your backend expects:
  //   action:  sendToAI_action:callAI   (returns aiText string)
  //   mutation: sendToAI:saveAIChat     (saves both user+AI messages)
  //
  // If your backend uses different names, change them below to match.

  const AI_BOT_ID = "jn74f01v6hfsne187hkzbq5gkn7vsfpc";
  if (String(activeOtherId) === AI_BOT_ID) {
    try {
      // 1) Ask server-side action to call the external AI provider
      //    (this runs in Node runtime and returns aiText)
      let aiText = null;

      // try action name that earlier dev messages used
      try {
        const res = await client.action("sendToAI_action:callAI", {
          text: txt,
        });
        // action may return either string or { aiText: '...' }
        if (typeof res === "string") aiText = res;
        else if (res && typeof res.aiText === "string") aiText = res.aiText;
        else if (res && typeof res.text === "string") aiText = res.text;
      } catch (actionErr) {
        // fallback: maybe you still have the old action name or mutation.
        // Try the old action name 'sendToAI' (non-namespaced) if present.
        try {
          const res2 = await client.action("sendToAI", {
            userId: currentUser._id,
            text: txt,
          });
          if (typeof res2 === "string") aiText = res2;
          else if (res2 && typeof res2.aiText === "string")
            aiText = res2.aiText;
        } catch (fallbackErr) {
          console.warn("AI action fallback failed:", fallbackErr);
        }
      }

      // If action didn't return anything, set a safe fallback string
      if (!aiText) aiText = "AI unavailable.";

      // 2) Save AI reply in DB via mutation (server-side mutation)
      //    saveToAI mutation name used in examples was `sendToAI:saveAIChat`
      //    If your mutation name is different, change it accordingly.
      try {
        await client.mutation("sendToAI:saveAIChat", {
          userId: currentUser._id,
          text: txt,
          aiText,
        });
      } catch (saveErr) {
        // As a fallback, try the older mutation name `sendToAI`
        try {
          await client.mutation("sendToAI", {
            userId: currentUser._id,
            text: txt,
          });
        } catch (saveErr2) {
          console.warn("Saving AI chat failed:", saveErr, saveErr2);
        }
      }

      // 3) Optionally render AI message in the AI screen if you have an AI UI
      // If user is currently viewing the chat panel with the bot, message will
      // be fetched by your Convex subscription and appear automatically.
      // But if you want immediate optimistic UI, you can append it now:
    } catch (e) {
      console.error("AI reply failed:", e);
    }
  }

  // clear composer
  q("msgInput").value = "";

  // remove reply bar if present
  const rb = q("replyBar");
  if (rb) rb.remove();
  currentReplyTarget = null;
}

// Press Enter to send message (keyboard + mobile)
document.addEventListener("keydown", function (e) {
  // If chat is not open, ignore
  if (!q("chatPanel").classList.contains("open")) return;

  // Prevent shift+enter (new line support)
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});

// showRegister();

// ========== LONG PRESS + ACTION SHEET ==========
function attachMessageInteractionHandlers(domNode, msg) {
  let timer = null;

  // mobile long press
  domNode.addEventListener("touchstart", () => {
    timer = setTimeout(() => openMessageMenu(domNode, msg), 600);
  });

  domNode.addEventListener("touchend", () => {
    if (timer) clearTimeout(timer);
  });

  // desktop right click
  domNode.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMessageMenu(domNode, msg);
  });
}

function openMessageMenu(domNode, msg) {
  // Remove old sheet if already open
  const old = document.getElementById("actionSheetOverlay");
  if (old) old.remove();

  let sheet = document.createElement("div");
  sheet.id = "actionSheetOverlay";
  sheet.style.position = "fixed";
  sheet.style.inset = "0";
  sheet.style.background = "rgba(0,0,0,0.4)";
  sheet.style.zIndex = "9999";

  // Close when clicking outside the box
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) sheet.remove();
  });

  const box = document.createElement("div");
  box.className = "action-sheet";

  // Reply
  const btnReply = document.createElement("button");
  btnReply.innerText = "Reply";
  btnReply.onclick = () => {
    startReply(msg);
    sheet.remove();
  };
  box.appendChild(btnReply);

  // React options
  const reactRow = document.createElement("div");
  reactRow.style.display = "flex";
  reactRow.style.gap = "8px";
  reactRow.style.margin = "12px 0";

  REACTION_SET.forEach((e) => {
    const r = document.createElement("button");
    r.className = "reaction-quick";
    r.innerText = e;
    r.onclick = async () => {
      await reactToMessage(msg._id, e);
      sheet.remove();
    };
    reactRow.appendChild(r);
  });

  box.appendChild(reactRow);

  // Delete for everyone (sender only)
  if (msg.senderId === currentUser._id) {
    const delAll = document.createElement("button");
    delAll.className = "btn-danger";
    delAll.innerText = "Delete for everyone";
    delAll.onclick = async () => {
      await deleteMessage(msg._id, true);
      sheet.remove();
    };
    box.appendChild(delAll);
  }

  // Delete for me
  const delMe = document.createElement("button");
  delMe.innerText = "Delete for me";
  delMe.onclick = async () => {
    await deleteMessage(msg._id, false);
    sheet.remove();
  };
  box.appendChild(delMe);

  // --- COPY MESSAGE ---
  const copyBtn = document.createElement("button");
  copyBtn.innerText = "Copy message";
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(msg.body || "");
    sheet.remove();
  };
  box.appendChild(copyBtn);

  sheet.appendChild(box);
  document.body.appendChild(sheet);
}


function startReply(msg) {
  currentReplyTarget = msg;

  let bar = q("replyBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "replyBar";

    const composer = document.querySelector(".floating-input-bar");

    if (!composer) {
      console.warn("❗ .composer not found when starting reply");
      return;
    }

    if (!composer.parentNode) {
      console.warn("❗ composer has no parentNode");
      return;
    }

    composer.parentNode.insertBefore(bar, composer);
  }

  bar.innerHTML = `
    <div>Replying to: <b>${msg.body.slice(0, 50)}</b></div>
    <button onclick="cancelReply()" class="btn-ghost">✕</button>
  `;
}

function cancelReply() {
  currentReplyTarget = null;
  const rb = q("replyBar");
  if (rb) rb.remove();
}

// reactToMessage + deleteMessage
async function reactToMessage(messageId, emoji) {
  await client.mutation("privateChat:reactMessage", {
    messageId,
    userId: currentUser._id,
    emoji,
  });
}

async function deleteMessage(messageId, forEveryone) {
  await client.mutation("privateChat:deleteMessage", {
    messageId,
    userId: currentUser._id,
    forEveryone,
  });
}

// background parallax
document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 10;
  const y = (e.clientY / window.innerHeight - 0.5) * 10;
  document.body.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
});

// ========== PROFILE & PFP ==========
let pfpFile = null;
let pfpZoom = 1;

function openPfpModal() {
  q("pfpModalOverlay").style.display = "flex";
  q("pfpPreviewImg").style.display = "none";
  q("pfpFile").value = "";
  if (q("pfpZoom")) q("pfpZoom").value = 1;
  pfpFile = null;
  pfpZoom = 1;
  if (q("pfpPreviewImg")) q("pfpPreviewImg").style.transform = "scale(1)";
}

async function savePfp() {
  if (!pfpFile) return skipPfp();

  try {
    const dataUrl = await compressImage(pfpFile, 800, 0.8);
    const binary = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: pfpFile.type || "image/jpeg" });
    const uploadUrl = await client.mutation("storage:getUploadUrl");

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    const { storageId } = await res.json();

    // make sure userId is provided
    if (!currentUser || !currentUser._id) {
      throw new Error("No currentUser set – cannot save PFP");
    }

    await client.mutation("storage:savePFP", {
      userId: currentUser._id,
      storageId,
    });
    currentUser = await client.query("users:getUserById", {
      id: currentUser._id,
    });
    setMyProfileUI();

    q("pfpModalOverlay").style.display = "none";
    afterLogin();
  } catch (e) {
    alert("Failed to upload picture: " + (e.message || e));
  }
}

function skipPfp() {
  q("pfpModalOverlay").style.display = "none";
  afterLogin();
}

async function openMyProfile() {
  if (!currentUser) return;
  profileIsOwner = true;
  await fillProfileModal(currentUser, true);
  q("profileModalOverlay").style.display = "flex";
  q("profileModalOverlay").setAttribute("aria-hidden", "false");
}

async function openOtherProfile(userId) {
  // fetch public profile
  const u = await client.query("users:getPublicProfile", { userId });
  if (!u) return alert("User not found");
  profileIsOwner = currentUser && currentUser._id === userId;
  await fillProfileModal(u, profileIsOwner);
  q("profileModalOverlay").style.display = "flex";
  q("profileModalOverlay").setAttribute("aria-hidden", "false");
}

function closeProfileModal() {
  q("profileModalOverlay").style.display = "none";
  q("profileModalOverlay").setAttribute("aria-hidden", "true");
}

async function fillProfileModal(userObj, editable) {
  // userObj may be currentUser or public
  q("profileNameDisplay").innerText = userObj.name || "";
  if (q("profileUsernameDisplay"))
    q("profileUsernameDisplay").innerText = "@" + (userObj.username || "");
  if (userObj.profilePic) {
    try {
      const url = await client.mutation("storage:getPFPUrl", {
        storageId: userObj.profilePic,
      });
      q("profileAvatarImg").src = url;
      q("profileAvatarImg").style.display = "block";
    } catch (e) {
      q("profileAvatarImg").style.display = "none";
    }
  } else {
    q("profileAvatarImg").style.display = "none";
  }

  if (editable) {
    q("profileEditArea").style.display = "block";
    if (q("profileReadOnlyAbout"))
      q("profileReadOnlyAbout").style.display = "none";
    // fill inputs
    q("editName").value = userObj.name || "";
    q("editUsername").value = userObj.username || "";
    if (q("editAbout")) q("editAbout").value = userObj.about || "";
    // attach live checking on username
    q("editUsername").oninput = async () => {
      const val = q("editUsername").value.trim();
      if (!val) {
        if (q("usernameStatus")) q("usernameStatus").innerText = "";
        return;
      }
      try {
        const available = await client.query("users:checkUsername", {
          username: val,
        });
        if (available || val === (currentUser && currentUser.username)) {
          if (q("usernameStatus")) {
            q("usernameStatus").innerText = "Available ✔";
            q("usernameStatus").className = "status-text status-available";
          }
        } else {
          if (q("usernameStatus")) {
            q("usernameStatus").innerText = "Unavailable ✖";
            q("usernameStatus").className = "status-text status-unavailable";
          }
        }
      } catch (e) {
        if (q("usernameStatus")) q("usernameStatus").innerText = "";
      }
    };
    // wire upload file
    if (q("editPfpFile")) {
      q("editPfpFile").onchange = (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        // show preview in profile avatar
        const r = new FileReader();
        r.onload = () => {
          q("profileAvatarImg").src = r.result;
          q("profileAvatarImg").style.display = "block";
        };
        r.readAsDataURL(f);
      };
    }
  } else {
    q("profileEditArea").style.display = "none";
    if (q("profileReadOnlyAbout")) {
      q("profileReadOnlyAbout").style.display = "block";
      q("profileReadOnlyAbout").innerText = userObj.about || "";
    }
  }
}

async function saveProfile() {
  if (!currentUser) return;
  const name = q("editName").value.trim();
  const username = q("editUsername").value.trim();
  const about = q("editAbout") ? q("editAbout").value : "";

  // validation: username availability
  try {
    const available = await client.query("users:isUsernameAvailable", {
      username,
    });
    if (!available && username !== currentUser.username) {
      alert("Username is taken");
      return;
    }
  } catch (e) {
    // ignore
  }

  try {
    await client.mutation("users:updateProfile", {
      userId: currentUser._id,
      name,
      username,
      about,
    });

    // if new pfp file selected
    const pf =
      q("editPfpFile") && q("editPfpFile").files && q("editPfpFile").files[0];
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
      if (!currentUser || !currentUser._id) {
        throw new Error("No currentUser set – cannot save PFP");
      }

      await client.mutation("storage:savePFP", {
        userId: currentUser._id,
        storageId,
      });
    }

    // refresh current user
    currentUser = await client.query("users:getUserById", {
      id: currentUser._id,
    });
    setMyProfileUI();
    closeProfileModal();
  } catch (err) {
    alert(err.message || String(err));
  }
}

async function onRemovePfp() {
  if (!currentUser) return;
  if (!confirm("Remove profile picture?")) return;
  try {
    await client.mutation("users:removePFP", { userId: currentUser._id });
    currentUser = await client.query("users:getUserById", {
      id: currentUser._id,
    });
    setMyProfileUI();
    // update modal UI
    q("profileAvatarImg").style.display = "none";
  } catch (e) {
    alert("Failed to remove");
  }
}

// ---------- helper to open profile when clicking avatar in header or thread list ----------
// make header avatar clickable to open own profile
if (q("meAvatar"))
  q("meAvatar").addEventListener("click", () => openMyProfile());
// make chat header avatar clickable (view other's profile)

window.LG = { client, getProfile, openChat, logout };

// ========== REACTION INFO POPUP ==========

async function openReactionInfo(msg, emoji) {
  const modal = q("reactionInfoModal");
  const listBox = q("rimList");
  const emojiBox = q("rimEmoji");

  if (!modal || !listBox) return;

  emojiBox.innerText = emoji;
  listBox.innerHTML = "";

  // Filter users who reacted with this emoji
  const reactions = msg.reactions || {};
  const users = Object.keys(reactions).filter(
    (uid) => reactions[uid] === emoji
  );

  // Load profiles for each
  for (let uid of users) {
    let profile = profileCache[uid];
    if (!profile) {
      profile = await getProfile(uid);
      profileCache[uid] = profile;
    }

    const item = document.createElement("div");
    item.className = "rim-item";
    item.innerHTML = `
      <img src="${profile?.avatarUrl || "assets/default.png"}" />
      <div class="name">${profile?.name || profile?.username}</div>
    `;
    listBox.appendChild(item);
  }

  modal.style.display = "flex";
}

function closeReactionInfo() {
  const modal = q("reactionInfoModal");
  if (modal) modal.style.display = "none";
}

// ========== CHAT LIST SUBSCRIPTION ==========
function startChatListSubscription() {
  if (listSubStop && typeof listSubStop === "function") {
    try {
      listSubStop();
    } catch (e) {
      console.error("Error unsubscribing from list:", e);
    }
  }

  listSubStop = client.onUpdate(
    "chatList:getChatList",
    { userId: currentUser._id },
    async (threads) => {
      const container = q("threadList");
      container.innerHTML = "";

      // ====== AI PINNED CHAT ======
      const AI_BOT_ID = "jn74f01v6hfsne187hkzbq5gkn7vsfpc";

      const aiRow = document.createElement("div");
      aiRow.className = "thread ai-thread";
      aiRow.onclick = () => openChat(AI_BOT_ID);

      aiRow.innerHTML = `
  <div class="left" style="display:flex;align-items:center;gap:12px;">
    <div class="avatar-circle" style="background:#333;">A</div>
    <div class="meta">
      <div class="name">ChatOXF AI</div>
      <div class="last" style="font-size:12px;color:#999;">AI Assistant</div>
    </div>
  </div>
`;

      container.appendChild(aiRow);

      if (!threads || threads.length === 0) {
        container.innerHTML =
          "<div style='color:rgba(255,255,255,0.6); text-align:center; padding:20px;'>No chats yet</div>";
        return;
      }

      for (const t of threads) {

        if (t.otherUserId === AI_BOT_ID) continue;

        const other = await getProfile(t.otherUserId);

        const row = document.createElement("div");
        row.className = "thread";
        row.onclick = () => openChat(t.otherUserId, t.threadId);

        const left = document.createElement("div");
        left.className = "left";
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "12px";

        const avatar = document.createElement("div");
        avatar.className = "avatar-circle"; // Reused existing class
        avatar.style.width = "40px";
        avatar.style.height = "40px";

        if (other && other.avatarUrl) {
          const img = document.createElement("img");
          img.src = other.avatarUrl;
          avatar.appendChild(img);
        } else {
          avatar.innerText = other ? other.name[0].toUpperCase() : "?";
          avatar.style.display = "grid";
          avatar.style.placeItems = "center";
          avatar.style.background = "#333";
        }

        left.appendChild(avatar);

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.style.display = "flex";
        meta.style.flexDirection = "column";

        const name = document.createElement("div");
        name.className = "name";
        name.innerText = other ? other.name : "Unknown";

        const last = document.createElement("div");
        last.className = "last";
        last.style.fontSize = "12px";
        last.style.color = "#888";
        last.innerText = t.lastMsg || "";

        meta.appendChild(name);
        meta.appendChild(last);

        left.appendChild(meta); // Append meta to left group

        const right = document.createElement("div");
        if (t.unread) {
          const b = document.createElement("div");
          b.className = "badge";
          b.innerText = t.unread;
          b.style.background = "var(--accent-green)";
          b.style.color = "black";
          b.style.padding = "2px 8px";
          b.style.borderRadius = "10px";
          b.style.fontSize = "12px";
          right.appendChild(b);
        }

        row.appendChild(left);
        row.appendChild(right);

        container.appendChild(row);
      }
    }
  );
}

if (q("pfpFile")) {
  q("pfpFile").onchange = function (e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    pfpFile = f;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = q("pfpPreviewImg");
      img.src = evt.target.result;
      img.style.display = "block";
      img.style.transform = `scale(${pfpZoom})`;
    };
    reader.readAsDataURL(f);
  };
}

if (q("pfpZoom")) {
  q("pfpZoom").oninput = (e) => {
    pfpZoom = parseFloat(e.target.value);
    const img = q("pfpPreviewImg");
    if (img && img.style.display !== "none") {
      img.style.transform = `scale(${pfpZoom})`;
    }
  };
}

// ===== AI BUTTON HANDLER =====
const AI_BOT_ID = "jn74f01v6hfsne187hkzbq5gkn7vsfpc";

if (q("navAI")) {
  q("navAI").onclick = () => {
    openChat(AI_BOT_ID);
  };
}
