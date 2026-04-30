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
const words = ["подорож", "відчуття", "свідомість", "вільний рух", "відкриття"];
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
const scheduleSlots = [
  { dow: 2, time: "19:00", bank: "left", type: "Сучасний танець", duration: "1,5 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 3, time: "17:30", bank: "right", type: "Тренаж", duration: "1 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 3, time: "18:30", bank: "right", type: "Сучасний танець", duration: "1,5 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 3, time: "20:00", bank: "left", type: "Тренаж", duration: "1 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 4, time: "19:00", bank: "left", type: "Сучасний танець", duration: "1,5 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
  { dow: 6, time: "10:00", bank: "right", type: "Тренаж", duration: "1 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 6, time: "11:00", bank: "right", type: "Сучасний танець", duration: "1,5 год", venue: "Правий берег · Кирилівська", address: "вул. Кирилівська, 41" },
  { dow: 6, time: "12:30", bank: "left", type: "Тренаж", duration: "1 год", venue: "Лівий берег · Мішуги", address: "вул. Мішуги, 10" },
];

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
const form        = document.getElementById("signupForm");
const formSuccess = document.getElementById("formSuccess");

function openModal() {
  form.hidden = false;
  formSuccess.hidden = true;
  modal.showModal ? modal.showModal() : (modal.open = true);
  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.close ? modal.close() : (modal.open = false);
  backdrop.classList.remove("active");
  document.body.style.overflow = "";
}

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
      throw new Error("Request failed");
    }

    form.hidden = true;
    formSuccess.hidden = false;
    setTimeout(closeModal, 2800);
    setTimeout(() => {
      form.hidden = false;
      formSuccess.hidden = true;
      form.reset();
    }, 3200);
  } catch (error) {
    showError("contact", "contactError", "Не вдалося надіслати заявку. Спробуй ще раз.");
  }
});
