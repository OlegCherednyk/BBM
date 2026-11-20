const MONTHS_SHORT = ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."];
const MONTHS_LONG = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @returns {{ y: number, m: number, d: number } | null} */
export function parseIsoDate(value) {
  const [y, m, d] = String(value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return { y, m, d };
}

export function isoFromParts(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** ponytail: Monday is the first column, so a Tuesday the 1st leaves one empty cell. */
export function monthCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells = Array(lead).fill(0);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7) cells.push(0);
  return cells;
}

export function formatRangePoint(value) {
  const part = parseIsoDate(value);
  if (!part) return "оберіть";
  return `${part.d} ${MONTHS_SHORT[part.m - 1]} ${part.y}`;
}

export function formatPresetHint(from, to) {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return "";
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT[a.m - 1]}`;
  return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
}

/** ponytail: previous month ends on the last calendar day, not on today's date. */
export function quickPeriod(quick, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (quick === "month") return { from: isoFromDate(new Date(year, month, 1)), to: isoFromDate(now) };
  if (quick === "prev-month") {
    return { from: isoFromDate(new Date(year, month - 1, 1)), to: isoFromDate(new Date(year, month, 0)) };
  }
  if (quick === "3months") return { from: isoFromDate(new Date(year, month - 2, 1)), to: isoFromDate(now) };
  if (quick === "6months") return { from: isoFromDate(new Date(year, month - 5, 1)), to: isoFromDate(now) };
  if (quick === "year") return { from: isoFromDate(new Date(year, 0, 1)), to: isoFromDate(now) };
  return null;
}

/**
 * @param {{ fromEl: HTMLInputElement, toEl: HTMLInputElement, onChange: () => void | Promise<void> }} opts
 */
export function mountStatsRange({ fromEl, toEl, onChange }) {
  const field = document.getElementById("statsRangeField");
  const fromLabel = document.getElementById("statsRangeFromLabel");
  const toLabel = document.getElementById("statsRangeToLabel");
  const calendarSheet = document.getElementById("statsCalendarSheet");
  const grid = document.getElementById("statsCalendarGrid");
  const monthLabel = document.getElementById("statsCalendarMonth");
  const draftFromEl = document.getElementById("statsDraftFrom");
  const draftToEl = document.getElementById("statsDraftTo");
  const okBtn = document.getElementById("statsCalendarOk");
  if (!field || !fromEl || !toEl || !calendarSheet || !grid) return;

  if (!fromEl.value || !toEl.value) {
    const initial = quickPeriod("month");
    if (initial) {
      fromEl.value = initial.from;
      toEl.value = initial.to;
    }
  }

  let view = parseIsoDate(fromEl.value) || { y: new Date().getFullYear(), m: new Date().getMonth() + 1, d: 1 };
  /** @type {string} */
  let draftFrom = fromEl.value;
  /** @type {string} */
  let draftTo = toEl.value;

  const paintField = () => {
    if (fromLabel) fromLabel.textContent = formatRangePoint(fromEl.value);
    if (toLabel) toLabel.textContent = formatRangePoint(toEl.value);
    const active = `${fromEl.value}|${toEl.value}`;
    document.querySelectorAll("[data-quick]").forEach((btn) => {
      const period = quickPeriod(btn.getAttribute("data-quick") || "");
      btn.classList.toggle("is-active", !!period && `${period.from}|${period.to}` === active);
    });
  };

  const openSheet = (sheet) => {
    sheet.classList.remove("admin-hide");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
  };

  const closeSheet = (sheet) => {
    sheet.classList.add("admin-hide");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-modal-open");
  };

  const paintDraft = () => {
    if (draftFromEl) draftFromEl.textContent = formatRangePoint(draftFrom).replace(/ \d{4}$/, "");
    if (draftToEl) draftToEl.textContent = draftTo ? formatRangePoint(draftTo).replace(/ \d{4}$/, "") : "оберіть";
    draftFromEl?.closest(".admin-stats-end")?.classList.toggle("is-active", !draftFrom);
    draftToEl?.closest(".admin-stats-end")?.classList.toggle("is-active", !!draftFrom);
    if (okBtn) okBtn.disabled = !draftFrom || !draftTo;
  };

  const paintMonth = () => {
    if (monthLabel) monthLabel.textContent = `${MONTHS_LONG[view.m - 1]} ${view.y}`;
    const from = parseIsoDate(draftFrom);
    const to = parseIsoDate(draftTo);
    const fromIso = from ? isoFromParts(from.y, from.m, from.d) : "";
    const toIso = to ? isoFromParts(to.y, to.m, to.d) : "";
    grid.innerHTML = WEEKDAYS.map((day) => `<span class="admin-stats-cal__wd">${day}</span>`).join("") +
      monthCells(view.y, view.m).map((day) => {
        if (!day) return `<span class="admin-stats-cal__empty"></span>`;
        const iso = isoFromParts(view.y, view.m, day);
        let cls = "admin-stats-cal__day";
        if (iso === fromIso) cls += " is-start";
        else if (iso === toIso) cls += " is-end";
        else if (fromIso && toIso && iso > fromIso && iso < toIso) cls += " is-in";
        return `<button type="button" class="${cls}" data-day="${iso}">${day}</button>`;
      }).join("");
    paintDraft();
  };

  const openCalendar = () => {
    draftFrom = fromEl.value;
    draftTo = toEl.value;
    const start = parseIsoDate(draftFrom);
    if (start) view = start;
    paintMonth();
    openSheet(calendarSheet);
  };

  const apply = async (from, to) => {
    fromEl.value = from;
    toEl.value = to;
    paintField();
    closeSheet(calendarSheet);
    await onChange();
  };

  // ponytail: the date and the calendar icon are one button, so both open the month grid with no preset sheet in between.
  field.addEventListener("click", openCalendar);

  document.addEventListener("click", (event) => {
    const quick = event.target instanceof Element ? event.target.closest("[data-quick]") : null;
    if (!quick || !quick.closest("#statsQuickBtns")) return;
    const period = quickPeriod(quick.getAttribute("data-quick") || "");
    if (!period) return;
    apply(period.from, period.to);
  });

  calendarSheet.querySelectorAll("[data-sheet-close]").forEach((node) => {
    node.addEventListener("click", () => closeSheet(calendarSheet));
  });

  document.getElementById("statsCalendarPrev")?.addEventListener("click", () => {
    const date = new Date(view.y, view.m - 2, 1);
    view = { y: date.getFullYear(), m: date.getMonth() + 1, d: 1 };
    paintMonth();
  });
  document.getElementById("statsCalendarNext")?.addEventListener("click", () => {
    const date = new Date(view.y, view.m, 1);
    view = { y: date.getFullYear(), m: date.getMonth() + 1, d: 1 };
    paintMonth();
  });

  grid.addEventListener("click", (event) => {
    const day = event.target instanceof Element ? event.target.closest("[data-day]") : null;
    if (!day) return;
    const iso = day.getAttribute("data-day") || "";
    if (!draftFrom || draftTo) {
      draftFrom = iso;
      draftTo = "";
    } else if (iso < draftFrom) {
      draftFrom = iso;
      draftTo = "";
    } else {
      draftTo = iso;
    }
    const picked = parseIsoDate(iso);
    if (picked) view = picked;
    paintMonth();
  });

  okBtn?.addEventListener("click", () => {
    if (!draftFrom || !draftTo) return;
    apply(draftFrom, draftTo);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeSheet(calendarSheet);
  });

  paintField();
}
