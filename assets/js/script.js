import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

/* ── SCROLL-TO-TOP ── */
const scrollTopBtn = document.getElementById("scrollTop");
if (scrollTopBtn) {
  window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 400);
  }, { passive: true });
  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ── MOBILE NAV HAMBURGER ── */
const navHamburger = document.getElementById("navHamburger");
const mobileNav    = document.getElementById("mobileNav");

function openMobileNav() {
  navHamburger.setAttribute("aria-expanded", "true");
  mobileNav.classList.add("is-open");
  mobileNav.removeAttribute("aria-hidden");
  document.body.style.overflow = "hidden";
}
function closeMobileNav() {
  navHamburger.setAttribute("aria-expanded", "false");
  mobileNav.classList.remove("is-open");
  mobileNav.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

if (navHamburger && mobileNav) {
  navHamburger.addEventListener("click", () => {
    const isOpen = mobileNav.classList.contains("is-open");
    isOpen ? closeMobileNav() : openMobileNav();
  });

  mobileNav.querySelectorAll(".mobile-nav__link").forEach((link) => {
    link.addEventListener("click", closeMobileNav);
  });

  const openModalNavBtn = document.getElementById("openModalNav");
  if (openModalNavBtn) {
    openModalNavBtn.addEventListener("click", () => {
      closeMobileNav();
    });
  }
}

/* ── NAV SCROLL ── */
const nav = document.getElementById("nav");
function syncNavTheme() {
  const y = window.scrollY;
  nav.classList.toggle("scrolled", y > 50);
  nav.classList.toggle("nav--hero", y <= 50);
}
syncNavTheme();
window.addEventListener("scroll", syncNavTheme, { passive: true });

/* ── ROTATING HERO WORDS ── */
const words = ["це подорож", "це відчуття", "це свідомість", "це вільний рух", "це відкриття"];
let wordIdx = 0;
const rotating = document.getElementById("rotatingWord");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ROTATE_INTERVAL_MS = 3400;
const ROTATE_PHASE_MS = 440;

function stabilizeRotatingSlotWidth() {
  if (!rotating || !rotating.parentElement) return;

  const probe = document.createElement("span");
  probe.className = rotating.className;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.style.pointerEvents = "none";
  probe.style.transform = "none";
  probe.style.filter = "none";
  probe.style.opacity = "1";
  probe.style.transition = "none";

  document.body.appendChild(probe);

  let maxWidth = 0;
  for (const word of words) {
    probe.textContent = word;
    maxWidth = Math.max(maxWidth, probe.getBoundingClientRect().width);
  }

  document.body.removeChild(probe);
  rotating.parentElement.style.setProperty("--rotating-slot-width", `${Math.ceil(maxWidth + 20)}px`);
}

function nextWord() {
  if (!rotating) return;

  if (prefersReducedMotion) {
    wordIdx = (wordIdx + 1) % words.length;
    rotating.textContent = words[wordIdx];
    return;
  }

  rotating.classList.remove("is-entering", "is-visible");
  rotating.classList.add("is-leaving");

  window.setTimeout(() => {
    wordIdx = (wordIdx + 1) % words.length;
    rotating.textContent = words[wordIdx];

    rotating.classList.remove("is-leaving", "is-visible");
    rotating.classList.add("is-entering");

    requestAnimationFrame(() => {
      rotating.classList.remove("is-entering");
      rotating.classList.add("is-visible");
    });
  }, ROTATE_PHASE_MS);
}

if (rotating && !prefersReducedMotion) {
  rotating.classList.add("is-visible");
}
stabilizeRotatingSlotWidth();
window.addEventListener("resize", stabilizeRotatingSlotWidth);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(stabilizeRotatingSlotWidth);
}
setInterval(nextWord, ROTATE_INTERVAL_MS);

/* ── SCHEDULE CALENDAR (тижневий розклад = seed_kyiv_schedule) ── */
const UK_DOW = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
let scheduleSlots = [
  { dow: 2, time: "19:00", bank: "left", type: "Сучасний танець", duration: "1,5 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 3, time: "17:30", bank: "right", type: "Тренаж", duration: "1 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 3, time: "18:30", bank: "right", type: "Сучасний танець", duration: "1,5 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 3, time: "20:00", bank: "left", type: "Тренаж", duration: "1 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 4, time: "19:00", bank: "left", type: "Сучасний танець", duration: "1,5 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 6, time: "10:00", bank: "right", type: "Тренаж", duration: "1 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 6, time: "11:00", bank: "right", type: "Сучасний танець", duration: "1,5 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 6, time: "12:30", bank: "left", type: "Тренаж", duration: "1 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
];

const { url: supabaseUrl, anonKey: supabaseAnonKey } = await getSupabaseConfig();
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function normalizeBank(riverBank) {
  const v = String(riverBank || "").toLowerCase();
  if (v.includes("лів")) return "left";
  if (v.includes("прав")) return "right";
  return "all";
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes % 60 === 0) return `${minutes / 60} год`;
  const h = minutes / 60;
  return `${String(h).replace(".", ",")} год`;
}

function formatTimeToHm(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

async function withRetry(fn, { attempts = 3, delayMs = 400 } = {}) {
  let lastResult = null;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, delayMs * i));
    try {
      lastResult = await fn();
      if (lastResult?.ok) return lastResult.value;
    } catch (err) {
      console.warn("Supabase request failed:", err?.message || err);
      lastResult = { ok: false, value: false };
    }
  }
  return lastResult?.value;
}

async function loadScheduleSlotsFromSupabase() {
  if (!supabase) return false;

  const result = await withRetry(async () => {
    const { data, error } = await supabase
      .from("lesson_times")
      .select("day_of_week, start_time, lesson_types(name,duration_minutes), places(name,address,river_bank)");

    if (error) {
      console.warn("Schedule fetch attempt failed:", error.message);
      return { ok: false, value: false };
    }

    const mapped = (data || [])
      .filter((row) => row?.lesson_types?.name && row?.places?.name)
      .map((row) => ({
        dow: row.day_of_week,
        time: formatTimeToHm(row.start_time),
        bank: normalizeBank(row.places.river_bank),
        type: row.lesson_types.name,
        duration: formatDuration(row.lesson_types.duration_minutes),
        venue: row.places.name,
        address: row.places.address || "",
      }));

    if (!mapped.length) return { ok: false, value: false };

    scheduleSlots = mapped;
    return { ok: true, value: true };
  });

  if (!result) {
    console.error("Cannot load schedule from Supabase after retries.");
  }
  return Boolean(result);
}

function formatUah(amount) {
  return new Intl.NumberFormat("uk-UA").format(amount);
}

function lessonKey(lessonType) {
  const slug = String(lessonType?.slug || "").toLowerCase();
  if (slug) return slug;
  const name = String(lessonType?.name || "").toLowerCase();
  if (name.includes("тренаж")) return "training";
  if (name.includes("сучас")) return "contemporary";
  return "";
}

async function loadPricesFromSupabase() {
  if (!supabase) return false;

  const result = await withRetry(async () => {
    const { data, error } = await supabase
      .from("prices")
      .select("price_kind,visits_count,amount_uah,lesson_types(slug,name)");

    if (error) {
      console.warn("Prices fetch attempt failed:", error.message);
      return { ok: false, value: false };
    }

    const byKey = {};
    for (const row of data || []) {
      const key = lessonKey(row.lesson_types);
      if (!key) continue;
      if (!byKey[key]) byKey[key] = {};
      if (row.price_kind === "single") byKey[key].single = row.amount_uah;
      if (row.price_kind === "abon" && Number(row.visits_count) === 8) byKey[key].abon8 = row.amount_uah;
    }

    if (!Object.keys(byKey).length) return { ok: false, value: false };

    const setText = (id, amount) => {
      if (!Number.isFinite(amount)) return;
      const el = document.getElementById(id);
      if (el) el.textContent = formatUah(amount);
    };

    setText("priceTrainingSingle", byKey.training?.single);
    setText("priceTrainingAbon", byKey.training?.abon8);
    setText("priceContemporarySingle", byKey.contemporary?.single);
    setText("priceContemporaryAbon", byKey.contemporary?.abon8);
    return { ok: true, value: true };
  });

  if (!result) {
    console.error("Cannot load prices from Supabase after retries.");
  }
  return Boolean(result);
}

let selectedBank = "all";
let selectedType = "all";

function sessionsForDay(d) {
  const dow = d.getDay();
  let list = scheduleSlots.filter((s) => s.dow === dow);
  if (selectedBank !== "all") {
    list = list.filter((s) => s.bank === selectedBank);
  }
  if (selectedType !== "all") {
    list = list.filter((s) => s.type === selectedType);
  }
  return list.sort((a, b) => a.time.localeCompare(b.time));
}

function sameCalendarDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

const calGrid = document.getElementById("calGrid");
const calMonthLabel = document.getElementById("calMonthLabel");
const calDetailDate = document.getElementById("calDetailDate");
const calSessions = document.getElementById("calSessions");
const calPrev = document.getElementById("calPrev");
const calNext = document.getElementById("calNext");

let calView = new Date();
let selectedCalDay = startOfToday();

calView = new Date(selectedCalDay.getFullYear(), selectedCalDay.getMonth(), 1);

function renderDetail() {
  const y = selectedCalDay.getFullYear();
  const m = selectedCalDay.getMonth();
  const day = selectedCalDay.getDate();
  const long = selectedCalDay.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
  const dowName = UK_DOW[selectedCalDay.getDay()];
  calDetailDate.textContent = `${long} — ${dowName}`;

  const sessions = sessionsForDay(selectedCalDay);
  calSessions.innerHTML = "";
  if (!sessions.length) {
    const p = document.createElement("p");
    p.className = "hero-cal__empty";
    const hasCustomFilter = selectedBank !== "all" || selectedType !== "all";
    p.textContent = hasCustomFilter
      ? "За обраними фільтрами в цей день занять немає."
      : "У цей день занять немає — обери іншу дату.";
    calSessions.appendChild(p);
    return;
  }
  for (const s of sessions) {
    const li = document.createElement("li");
    li.className = "hero-cal__session";
    li.innerHTML = `
      <time datetime="${s.time}">${s.time}</time>
      <p class="hero-cal__session-type">${s.type} · ${s.duration}</p>
      <p class="hero-cal__session-meta">${s.venue}<br />${s.address}</p>
    `;
    calSessions.appendChild(li);
  }
}

function renderCalGrid() {
  const y = calView.getFullYear();
  const m = calView.getMonth();
  calMonthLabel.textContent = new Date(y, m, 15).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

  const first = new Date(y, m, 1);
  const pad = (first.getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();
  const totalSlots = Math.ceil((pad + dim) / 7) * 7;

  const today = startOfToday();
  calGrid.innerHTML = "";

  for (let i = 0; i < totalSlots; i++) {
    const dayNum = i - pad + 1;
    let cellDate;
    let muted = false;
    if (dayNum < 1) {
      cellDate = new Date(y, m - 1, prevDim + dayNum);
      muted = true;
    } else if (dayNum > dim) {
      cellDate = new Date(y, m + 1, dayNum - dim);
      muted = true;
    } else {
      cellDate = new Date(y, m, dayNum);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hero-cal__day";
    btn.textContent = String(cellDate.getDate());
    btn.setAttribute("role", "gridcell");
    if (muted) btn.classList.add("hero-cal__day--muted");
    if (sameCalendarDate(cellDate, today)) btn.classList.add("hero-cal__day--today");
    if (sameCalendarDate(cellDate, selectedCalDay)) {
      btn.classList.add("hero-cal__day--selected");
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.setAttribute("aria-selected", "false");
    }
    if (sessionsForDay(cellDate).length) btn.classList.add("hero-cal__day--has");

    btn.addEventListener("click", () => {
      selectedCalDay = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      if (
        selectedCalDay.getMonth() !== calView.getMonth() ||
        selectedCalDay.getFullYear() !== calView.getFullYear()
      ) {
        calView = new Date(selectedCalDay.getFullYear(), selectedCalDay.getMonth(), 1);
      }
      renderCalGrid();
      renderDetail();
    });

    calGrid.appendChild(btn);
  }
}

calPrev.addEventListener("click", () => {
  calView = new Date(calView.getFullYear(), calView.getMonth() - 1, 1);
  renderCalGrid();
  renderDetail();
});

calNext.addEventListener("click", () => {
  calView = new Date(calView.getFullYear(), calView.getMonth() + 1, 1);
  renderCalGrid();
  renderDetail();
});

const bankSelect = document.getElementById("bankSelect");
if (bankSelect) {
  bankSelect.addEventListener("change", () => {
    selectedBank = bankSelect.value;
    renderCalGrid();
    renderDetail();
  });
}

const typeSelect = document.getElementById("typeSelect");
if (typeSelect) {
  typeSelect.addEventListener("change", () => {
    selectedType = typeSelect.value;
    renderCalGrid();
    renderDetail();
  });
}

renderCalGrid();
renderDetail();

const [scheduleLoaded] = await Promise.all([
  loadScheduleSlotsFromSupabase(),
  loadPricesFromSupabase(),
]);
if (scheduleLoaded) {
  renderCalGrid();
  renderDetail();
}

/* ── SCROLL REVEAL ── */
const revealEls = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealEls.forEach((el) => observer.observe(el));

/* ── ACCORDION MICRO-ANIMATIONS ── */
document.querySelectorAll(".accordion__item").forEach((details) => {
  const summary = details.querySelector(".accordion__q");
  const body    = details.querySelector(".accordion__body");
  if (!summary || !body) return;

  // Collapse initially (native [open] state may differ)
  if (!details.open) body.style.height = "0px";

  summary.addEventListener("click", (e) => {
    e.preventDefault();

    if (details.open) {
      // ── CLOSING ──
      const h = body.scrollHeight;
      body.style.height = h + "px";
      body.offsetHeight; // force reflow
      body.style.height = "0px";
      body.addEventListener(
        "transitionend",
        () => {
          details.removeAttribute("open");
          // height stays 0px for next open cycle
        },
        { once: true }
      );
    } else {
      // ── OPENING ──
      body.style.height = "0px";
      details.setAttribute("open", "");
      const h = body.scrollHeight;
      body.offsetHeight; // force reflow
      body.style.height = h + "px";
      body.addEventListener(
        "transitionend",
        () => {
          body.style.height = ""; // auto — allows resize
        },
        { once: true }
      );
    }
  });
});

/* ── QUOTES SLIDER ── */
const quotes = document.querySelectorAll(".quote");
const dots   = document.querySelectorAll(".dot");
let activeQuote = 0;

function goToQuote(idx) {
  quotes[activeQuote].classList.remove("quote--active");
  dots[activeQuote].classList.remove("dot--active");
  activeQuote = idx;
  quotes[activeQuote].classList.add("quote--active");
  dots[activeQuote].classList.add("dot--active");
}

dots.forEach((dot, i) => dot.addEventListener("click", () => goToQuote(i)));
setInterval(() => goToQuote((activeQuote + 1) % quotes.length), 4500);

/* ── CARD CTA (direction detail) ── */
const cardCtaBtns = document.querySelectorAll(".card__cta");
const directionDetails = {
  "Турбота про тіло":
    "Практика близька до тренажу: дихання й напруга, поєднання хореографічного тренажу з йогою, реабілітаційними техніками й пілатесом. Фокус на силі, гнучкості й витривалості та на поверненні уваги в тіло.",
  "Сучасний танець":
    "Півторні заняття: опанування технік і способів руху, координація, комбінації та імпровізація. Ідеально, якщо хочеш відчувати тіло вільніше з кожним разом.",
  Хорео:
    "Щоразу різний педагог, різна хореографія, різна якість руху. Для тих, хто вже рухається і хоче йти далі меж стилю.",
};

cardCtaBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const dir = btn.dataset.direction;
    const card = btn.closest(".card");
    const existing = card.querySelector(".card__detail");

    if (existing) {
      existing.remove();
      btn.textContent = "Дізнатись більше →";
    } else {
      const detail = document.createElement("p");
      detail.className = "card__detail";
      detail.style.cssText =
        "font-size:.87rem;line-height:1.65;margin-top:6px;opacity:0;transition:opacity .3s ease;";
      detail.textContent = directionDetails[dir] || "";
      btn.insertAdjacentElement("beforebegin", detail);
      requestAnimationFrame(() => requestAnimationFrame(() => (detail.style.opacity = "1")));
      btn.textContent = "Сховати ↑";
    }
  });
});

/* ── MODAL ── */
const modal      = document.getElementById("signupModal");
const backdrop   = document.getElementById("modalBackdrop");
const closeBtnEl = document.getElementById("closeModal");
const openBtns   = [
  document.getElementById("openModal"),
  document.getElementById("openModal3"),
  document.getElementById("openModal4"),
];
const form = document.getElementById("signupForm");

function openModal() {
  form.hidden = false;
  modal.showModal ? modal.showModal() : (modal.open = true);
  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

/* ── TOAST ── */
function showToast(title, desc = "", durationMs = 4500) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <div class="toast__icon" aria-hidden="true">✓</div>
    <div class="toast__text">
      <div class="toast__title">${title}</div>
      ${desc ? `<div class="toast__desc">${desc}</div>` : ""}
    </div>
  `;

  container.appendChild(toast);
  // Double rAF: let the element render before triggering transition
  requestAnimationFrame(() =>
    requestAnimationFrame(() => toast.classList.add("is-visible"))
  );

  setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, durationMs);
}

function closeModal() {
  modal.close ? modal.close() : (modal.open = false);
  backdrop.classList.remove("active");
  document.body.style.overflow = "";
}

const openModalNavBtn2 = document.getElementById("openModalNav");
if (openModalNavBtn2) openBtns.push(openModalNavBtn2);
openBtns.forEach((b) => b && b.addEventListener("click", openModal));
closeBtnEl.addEventListener("click", closeModal);
backdrop.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.open) closeModal();
});

/* ── FORM VALIDATION & SUBMIT ── */
function showError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errorId);
  input.classList.add("error");
  err.textContent = msg;
  return false;
}
function clearError(inputId, errorId) {
  document.getElementById(inputId).classList.remove("error");
  document.getElementById(errorId).textContent = "";
}

function mapSignupErrorToUa(message) {
  const m = String(message || "").toLowerCase();
  if (m.includes("bot can't initiate conversation")) {
    return "Бот не може написати першим. Спочатку відкрий бота в Telegram і натисни Start, потім спробуй ще раз.";
  }
  if (m.includes("chat not found")) {
    return "Чат не знайдено. Перевір TELEGRAM_CHAT_ID або напиши боту в Telegram, щоб чат став доступним.";
  }
  if (m.includes("forbidden")) {
    return "Telegram заборонив надсилання в цей чат. Перевір, чи бот не заблокований і чи ти натиснула Start.";
  }
  if (m.includes("no chat ids found")) {
    return "Не знайдено чат для надсилання. Спочатку напиши боту в Telegram або додай TELEGRAM_CHAT_ID у .env.";
  }
  return "Не вдалося надіслати заявку. Спробуй ще раз.";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  let valid = true;

  clearError("name", "nameError");
  clearError("contact", "contactError");

  const name    = document.getElementById("name").value.trim();
  const contact = document.getElementById("contact").value.trim();

  if (!name) {
    showError("name", "nameError", "Напиши своє ім'я");
    valid = false;
  }
  if (!contact) {
    showError("contact", "contactError", "Вкажи Instagram або Telegram");
    valid = false;
  }

  if (!valid) return;

  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, contact }),
    });

    if (!response.ok) {
      let serverError = "";
      try {
        const payload = await response.json();
        serverError = String(payload?.error || payload?.message || "");
      } catch (_ignored) {
        serverError = "";
      }
      throw new Error(serverError || `Request failed with status ${response.status}`);
    }

    closeModal();
    form.reset();
    showToast("Дякуємо!", "Ми напишемо тобі найближчим часом.");
  } catch (error) {
    showError("contact", "contactError", mapSignupErrorToUa(error?.message));
  }
});
