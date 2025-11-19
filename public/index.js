function updateGreeting() {
  const hour = new Date().getHours();
  let text = "Hello";

  if (hour >= 5 && hour < 12) text = "Good morning";
  else if (hour >= 12 && hour < 16) text = "Good afternoon";
  else if (hour >= 16 && hour < 20) text = "Good evening";
  else text = "Good night";

  document.getElementById("dynamicGreeting").innerText = text;
}

// Update on load
updateGreeting();
