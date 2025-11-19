function updateGreeting() {
  const hour = new Date().getHours();
  let text = "Hello";

  if (hour >= 5 && hour < 12) text = "Good morning";
  else if (hour >= 12 && hour < 16) text = "Good afternoon";
  else if (hour >= 16 && hour < 20) text = "Good evening";
  else text = "Good night";

  document.getElementById("dynamicGreeting").innerText = text;
}

// =======================
// CHAT TOPBAR MENU (3 DOT)
// =======================
function openChatOptions() {
  if (!activeOtherId) return;

  let sheet = document.createElement("div");
  sheet.id = "actionSheetOverlay";

  const box = document.createElement("div");
  box.className = "action-sheet";

  // View Profile
  const prof = document.createElement("button");
  prof.innerText = "View Profile";
  prof.onclick = () => {
    openOtherProfile(activeOtherId);
    sheet.remove();
  };
  box.appendChild(prof);

  // Clear full chat
  const clr = document.createElement("button");
  clr.className = "btn-danger";
  clr.innerText = "Clear Chat";
  clr.onclick = async () => {
    await clearThread(activeOtherId);
    sheet.remove();
  };
  box.appendChild(clr);

  // Cancel
  const cancel = document.createElement("button");
  cancel.innerText = "Cancel";
  cancel.onclick = () => sheet.remove();
  box.appendChild(cancel);

  sheet.appendChild(box);
  document.body.appendChild(sheet);
}

async function clearThread(otherUserId) {
  if (!confirm("Clear this entire chat?")) return;

  await client.mutation("privateChat:clearThread", {
    userA: currentUser._id,
    userB: otherUserId,
  });
}


// Update on load
updateGreeting();
