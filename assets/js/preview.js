const FEATURES = ["nav", "hero", "calendar", "footer", "modal", "sticky"];
const STORAGE_KEY = "bbm-preview-features";

const defaultState = () => Object.fromEntries(FEATURES.map((key) => [key, true]));

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch (_err) {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyState(state) {
  FEATURES.forEach((key) => {
    document.body.classList.toggle(`preview-on-${key}`, Boolean(state[key]));
    const input = document.querySelector(`[data-feature="${key}"]`);
    if (input) input.checked = Boolean(state[key]);
  });

  const scheduleBtn = document.getElementById("heroScheduleBtn");
  if (scheduleBtn) {
    scheduleBtn.textContent = state.hero ? "До розкладу" : "Розклад";
  }

  const extraHero = document.querySelectorAll("[data-hero-extra]");
  extraHero.forEach((el) => {
    el.style.display = state.hero ? "none" : "";
  });

  const onCount = FEATURES.filter((key) => state[key]).length;
  const summary = document.getElementById("previewSummary");
  if (summary) {
    summary.textContent =
      onCount === 0
        ? "Усі зміни вимкнено — це поточний сайт"
        : `Обрано ${onCount} з ${FEATURES.length} змін`;
  }
}

function bind() {
  const state = loadState();
  applyState(state);

  document.querySelectorAll("[data-feature]").forEach((input) => {
    input.addEventListener("change", () => {
      state[input.dataset.feature] = input.checked;
      saveState(state);
      applyState(state);
    });
  });

  document.getElementById("previewAllOn")?.addEventListener("click", () => {
    FEATURES.forEach((key) => {
      state[key] = true;
    });
    saveState(state);
    applyState(state);
  });

  document.getElementById("previewAllOff")?.addEventListener("click", () => {
    FEATURES.forEach((key) => {
      state[key] = false;
    });
    saveState(state);
    applyState(state);
  });

  const dock = document.getElementById("previewDock");
  document.getElementById("previewDockToggle")?.addEventListener("click", () => {
    const collapsed = dock.classList.toggle("is-collapsed");
    document.getElementById("previewDockToggle")?.setAttribute("aria-expanded", String(!collapsed));
  });

  const openPrimary = document.getElementById("openModal");
  document.querySelectorAll("[data-open-signup]").forEach((btn) => {
    btn.addEventListener("click", () => openPrimary?.click());
  });

  const onScroll = () => {
    document.body.classList.toggle("preview-scrolled", window.scrollY > 420);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind);
} else {
  bind();
}
