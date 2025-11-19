// Mindmate Style Animations

gsap.config({ nullTargetWarn: false });

// Screen Transitions
function animateScreenIn(screenId) {
  const screen = document.querySelector(screenId);
  if (!screen) return;

  // Reset
  gsap.set(
    screen.querySelectorAll(
      ".hero-text, .feature-card, .input-group, .btn, .thread, .dashboard-header"
    ),
    {
      y: 30,
      opacity: 0,
    }
  );

  // Stagger In
  gsap.to(
    screen.querySelectorAll(
      ".hero-text, .feature-card, .input-group, .btn, .thread, .dashboard-header"
    ),
    {
      y: 0,
      opacity: 1,
      duration: 0.6,
      stagger: 0.05,
      ease: "power3.out",
      delay: 0.1,
    }
  );
}

// Observer for screen changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === "attributes" && mutation.attributeName === "class") {
      if (mutation.target.classList.contains("active")) {
        animateScreenIn("#" + mutation.target.id);
      }
    }
  });
});

document
  .querySelectorAll(".screen")
  .forEach((s) => observer.observe(s, { attributes: true }));

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
  const active = document.querySelector(".screen.active");
  if (active) animateScreenIn("#" + active.id);
});

// Chat Panel Slide (Mobile)
const chatPanel = document.getElementById("chatPanel");
const chatObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (
      mutation.target.id === "chatPanel" &&
      mutation.attributeName === "class"
    ) {
      if (chatPanel.classList.contains("open")) {
        // Animate bubbles when chat opens
        gsap.fromTo(
          "#messages .bubble",
          { y: 20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.05,
            duration: 0.4,
            ease: "back.out(1.2)",
          }
        );
      }
    }
  });
});
chatObserver.observe(chatPanel, { attributes: true });

// Button Press Effect
document.querySelectorAll(".btn, .feature-card, .thread").forEach((el) => {
  el.addEventListener("mousedown", () =>
    gsap.to(el, { scale: 0.96, duration: 0.1 })
  );
  el.addEventListener("mouseup", () =>
    gsap.to(el, { scale: 1, duration: 0.1 })
  );
  el.addEventListener("mouseleave", () =>
    gsap.to(el, { scale: 1, duration: 0.1 })
  );
});
