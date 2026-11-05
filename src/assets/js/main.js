// Progressive enhancement only: every page stays readable and navigable without this file.

const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function initHeader() {
  const header = document.querySelector("[data-header]");
  if (!header) return;

  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:48px;pointer-events:none";
  document.body.prepend(sentinel);

  new IntersectionObserver(([entry]) => {
    header.classList.toggle("is-scrolled", !entry.isIntersecting);
  }).observe(sentinel);
}

function initMobileNav() {
  const header = document.querySelector("[data-header]");
  const toggle = document.querySelector("[data-nav-toggle]");
  const label = document.querySelector("[data-nav-toggle-label]");
  const nav = document.getElementById("site-nav");
  if (!header || !toggle || !nav) return;

  const behindPanel = [document.querySelector(".skip-link"), document.querySelector("main"), document.querySelector(".site-footer")];

  const setOpen = (open, { restoreFocus = false } = {}) => {
    toggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close" : "Menu";
    root.classList.toggle("nav-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    behindPanel.forEach((element) => {
      if (element) element.inert = open;
    });

    if (open) nav.querySelector("a")?.focus({ preventScroll: true });
    else if (restoreFocus) toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true", { restoreFocus: true });
  });

  header.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("nav-open")) {
      setOpen(false, { restoreFocus: true });
    }
  });

  window.matchMedia("(min-width: 48rem)").addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
}

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length || reducedMotion.matches) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );

  items.forEach((item) => observer.observe(item));
}

// The cinematic opening plays once per visit and ends at the first sign of impatience.
function initOpening() {
  const opening = document.querySelector("[data-opening]");
  if (!opening) return;

  const heroImages = [...opening.querySelectorAll("img")].map((image) => image.decode().catch(() => {}));
  Promise.all(heroImages).then(() => root.classList.add("opening-ready"));

  const remember = () => {
    try {
      sessionStorage.setItem("fireleg-intro", "1");
    } catch {
      // Storage can be blocked: the opening then simply plays again.
    }
  };

  const events = ["pointerdown", "keydown", "wheel", "touchmove"];
  const skip = () => {
    events.forEach((type) => window.removeEventListener(type, skip));
    root.classList.add("opening-ready");
    for (const animation of document.getAnimations()) {
      const oneShot = animation.effect?.getTiming().iterations !== Infinity;
      if (oneShot && animation.timeline === document.timeline) animation.finish();
    }
    remember();
  };

  events.forEach((type) => window.addEventListener(type, skip, { passive: true }));
  window.setTimeout(remember, 3500);
}

// A few embers rising through the opening. Stops whenever it cannot be seen.
function initEmbers() {
  const canvas = document.querySelector("[data-embers]");
  if (!canvas || reducedMotion.matches) return;

  const context = canvas.getContext("2d");
  const embers = [];

  // Soft glows drawn once and reused: a plain circle would show a hard edge.
  const makeGlow = (color) => {
    const glow = document.createElement("canvas");
    glow.width = glow.height = 32;
    const paint = glow.getContext("2d");
    const gradient = paint.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "#FFF1DC");
    gradient.addColorStop(0.16, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 32, 32);
    return glow;
  };
  const glows = [makeGlow("#FF4A00"), makeGlow("#D4A552")];
  let width = 0;
  let height = 0;
  let frame = 0;
  let previous = 0;

  const spawn = (ember, scatter = false) =>
    Object.assign(ember, {
      x: Math.random() * width,
      y: scatter ? Math.random() * height : height + 8,
      rise: 14 + Math.random() * 34,
      sway: 6 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      size: 2 + Math.random() * 4.5,
      glow: Math.random() < 0.72 ? glows[0] : glows[1],
      age: 0,
      span: 5 + Math.random() * 8,
    });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const target = Math.round(Math.min(34, width / 42));
    embers.length = Math.min(embers.length, target);
    while (embers.length < target) embers.push(spawn({}, true));
  };

  const draw = (time) => {
    frame = requestAnimationFrame(draw);
    const delta = Math.min((time - previous) / 1000, 0.05);
    previous = time;

    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    for (const ember of embers) {
      ember.age += delta;
      ember.y -= ember.rise * delta;
      ember.x += Math.sin(ember.phase + ember.age * 1.3) * ember.sway * delta;
      if (ember.age > ember.span || ember.y < -8) spawn(ember);

      context.globalAlpha = Math.sin((ember.age / ember.span) * Math.PI) * 0.85;
      context.drawImage(ember.glow, ember.x - ember.size, ember.y - ember.size, ember.size * 2, ember.size * 2);
    }
  };

  let onScreen = false;
  const update = () => {
    cancelAnimationFrame(frame);
    if (onScreen && !document.hidden) {
      previous = performance.now();
      frame = requestAnimationFrame(draw);
    }
  };

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener("visibilitychange", update);
}

// Gallery thumbnails open in a dialog. Without JavaScript they are plain links to the image.
function initLightbox() {
  const links = document.querySelectorAll("[data-lightbox]");
  if (!links.length) return;

  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = '<button class="lightbox__close" type="button">Close</button><img alt="">';
  document.body.append(dialog);
  const image = dialog.querySelector("img");

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      image.src = link.href;
      image.alt = link.querySelector("img")?.alt ?? "";
      dialog.showModal();
    });
  });

  dialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => image.removeAttribute("src"));
}

initHeader();
initMobileNav();
initReveal();
initOpening();
initEmbers();
initLightbox();
