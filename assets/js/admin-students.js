import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

function el(id) {
  return document.getElementById(id);
}

function showStudentsLocalError(msg) {
  const box = el("studentsError");
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle("admin-hide", !msg);
  if (msg) clearStudentEditOk();
}

/** @type {ReturnType<typeof setTimeout> | null} */
let studentEditOkTimer = null;

function clearStudentEditOk() {
  if (studentEditOkTimer) {
    clearTimeout(studentEditOkTimer);
    studentEditOkTimer = null;
  }
  el("studentEditOk")?.classList.add("admin-hide");
}

function showStudentsDashOk(msg) {
  const ok = el("dashOk");
  if (!ok) return;
  ok.textContent = msg;
  ok.classList.remove("admin-hide");
  setTimeout(() => ok.classList.add("admin-hide"), 3600);
}

function showStudentEditOk(msg) {
  const box = el("studentEditOk");
  if (!box) {
    showStudentsDashOk(msg);
    return;
  }
  clearStudentEditOk();
  box.textContent = msg;
  box.classList.remove("admin-hide");
  studentEditOkTimer = setTimeout(() => {
    box.classList.add("admin-hide");
    studentEditOkTimer = null;
  }, 3600);
}

function apiBase() {
  return window.location.origin;
}

/** Людський підпис статусу абонемента (у БД лишаються pending / active / exhausted). */
function isTelegramIdPlaceholder(name) {
  return /^Telegram \d+$/.test(String(name ?? "").trim());
}

/** Імʼя + @нік для списку та заголовків (не дублює @ у display_name). */
function formatStudentListLabel(student) {
  const name = String(student?.display_name ?? "").trim();
  const nickRaw = String(student?.telegram_username ?? "").trim().replace(/^@/, "");
  const nick = nickRaw ? `@${nickRaw}` : "";
  if (nick && (isTelegramIdPlaceholder(name) || !name)) return nick;
  if (nick && !name.includes(nick)) return `${name} ${nick}`;
  return name || nick || "—";
}

function subscriptionStatusLabelUk(code) {
  switch (String(code || "")) {
    case "pending":
      return "в обробці";
    case "active":
      return "активний";
    case "exhausted":
      return "вичерпаний";
    default:
      return String(code || "—");
  }
}

function toDateInputValue(isoLike) {
  if (isoLike == null || isoLike === "") return "";
  const s = String(isoLike).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function fmtStudentMoney(amount) {
  const n = Number(amount) || 0;
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

function formatStudentLastVisitShort(lastVisitAt) {
  if (!lastVisitAt) return "—";
  try {
    return new Date(lastVisitAt).toLocaleDateString("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** @param {Record<string, unknown> | null | undefined} summary */
function studentAbonStatus(summary) {
  const a = Number(summary?.active) || 0;
  const p = Number(summary?.pending) || 0;
  const x = Number(summary?.exhausted) || 0;
  if (a > 0) {
    return { valueClass: "admin-students-card__metric-value--abon-active", title: "Є активний абонемент" };
  }
  if (p > 0) {
    return { valueClass: "admin-students-card__metric-value--abon-pending", title: "Є абонемент «в обробці»" };
  }
  if (x > 0) {
    return { valueClass: "admin-students-card__metric-value--abon-exhausted", title: "Лише вичерпані абонементи" };
  }
  return null;
}

function studentAbonVisitsText(summary) {
  const totalPkg = Number(summary?.abon_visits_total);
  if (!Number.isFinite(totalPkg) || totalPkg <= 0) return null;
  let remPkg = Number(summary?.abon_visits_remaining);
  if (!Number.isFinite(remPkg) || remPkg < 0) remPkg = 0;
  const usedPkg = Math.max(0, Math.floor(totalPkg) - Math.floor(remPkg));
  return {
    text: `${usedPkg}/${Math.floor(totalPkg)}`,
    title: `Використано ${usedPkg} із ${Math.floor(totalPkg)} візитів абонемента.`,
  };
}

/** @param {HTMLElement} container @param {string} label @param {string} value @param {string} [extraClass] @param {string} [title] @param {string} [valueClass] */
function appendStudentMetric(container, label, value, extraClass = "", title = "", valueClass = "") {
  const tile = document.createElement("div");
  tile.className = `admin-students-card__metric${extraClass ? ` ${extraClass}` : ""}`;
  if (title) tile.title = title;

  const lab = document.createElement("span");
  lab.className = "admin-students-card__metric-label";
  lab.textContent = label;
  const val = document.createElement("span");
  val.className = `admin-students-card__metric-value${valueClass ? ` ${valueClass}` : ""}`;
  val.textContent = value;
  tile.append(lab, val);
  container.appendChild(tile);
}

/** @param {HTMLElement} container @param {any} student */
function mountStudentTileMetrics(container, student) {
  container.innerHTML = "";
  const summary = student.subscription_summary;
  const visits = Math.max(0, Math.floor(Number(student.attended_visits_count) || 0));
  const visitsTitle =
    visits === 0 ? "Немає відвіданих занять" : visits === 1 ? "1 відвідане заняття" : `${visits} відвіданих занять`;

  const lastVisit = formatStudentLastVisitShort(student.last_visit_at);
  const lastTitle = student.last_visit_at
    ? `Останнє відвідане заняття: ${lastVisit}`
    : "Ще не був на занятті";

  appendStudentMetric(
    container,
    "Виручка",
    fmtStudentMoney(student.total_revenue_uah),
    "admin-students-card__metric--revenue",
    "Сума куплених абонементів (у т.ч. вичерпаних) + разові відвідування",
  );
  appendStudentMetric(container, "Останнє", lastVisit, "admin-students-card__metric--last", lastTitle);
  appendStudentMetric(container, "Візити", String(visits), "", visitsTitle);

  const abonStatus = studentAbonStatus(summary);
  const abonVisits = studentAbonVisitsText(summary);
  if (abonStatus) {
    const abonTitle = abonVisits?.title ? `${abonStatus.title}. ${abonVisits.title}` : abonStatus.title;
    appendStudentMetric(
      container,
      "Абонемент",
      abonVisits?.text || "—",
      "admin-students-card__metric--abon",
      abonTitle,
      abonStatus.valueClass,
    );
  } else {
    appendStudentMetric(container, "Абонемент", "—", "admin-students-card__metric--muted");
  }
}

/** Кількість абонементів і дроб Р/Т по візитах — один блок у рядку картки списку. */
function countAttendedVisitsForSubscription(visits, subscriptionId) {
  const sid = String(subscriptionId || "");
  let n = 0;
  for (const v of visits || []) {
    if (!v || String(v.subscription_id || "") !== sid) continue;
    if (String(v.visit_status || "") !== "attended") continue;
    n += 1;
  }
  return n;
}

/** Узгоджено з computeSubscriptionUsedVisits у students-api.js */
function computeUsedVisitsDisplay(sub, visits) {
  const fromJournal = countAttendedVisitsForSubscription(visits, sub.id);
  const ovRaw = sub.used_visits_override;
  if (ovRaw == null || ovRaw === "" || !Number.isFinite(Number(ovRaw))) return fromJournal;
  const opening = Math.max(0, Math.floor(Number(ovRaw)));
  const total =
    sub.total_visits != null && Number.isFinite(Number(sub.total_visits))
      ? Math.max(0, Math.floor(Number(sub.total_visits)))
      : null;
  const used = opening + fromJournal;
  if (total != null) return Math.min(total, used);
  return used;
}

function isStudentAbsentOverTwoWeeks(student, lastVisitAt) {
  const attended = Math.max(0, Math.floor(Number(student?.attended_visits_count) || 0));

  if (attended === 0) {
    return true;
  }

  if (!lastVisitAt) return false;

  const t = new Date(lastVisitAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > STUDENT_ABSENT_MS;
}

function absentStudentTriggerTitle(student, lastVisitAt) {
  const attended = Math.max(0, Math.floor(Number(student?.attended_visits_count) || 0));
  if (attended === 0) {
    return "Не був на жодному занятті.";
  }
  if (lastVisitAt) {
    try {
      const when = new Date(lastVisitAt).toLocaleDateString("uk-UA", {
        timeZone: "Europe/Kyiv",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return `Останнє заняття: ${when}. Більше 2 тижнів без відвідування.`;
    } catch {
      return "Більше 2 тижнів без відвідування.";
    }
  }
  return "Більше 2 тижнів без відвідування.";
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await res.text();
  /** @type {any} */
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

function formatVisitDateTime(isoLike) {
  if (isoLike == null || isoLike === "") return "—";
  try {
    return new Date(isoLike).toLocaleString("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(isoLike).slice(0, 16);
  }
}

function visitOccurrenceLabel(visit) {
  const snap = visit?.lesson_vote_occurrences?.lesson_snapshot || {};
  const parts = [snap.lessonTypeLabel, snap.placeLabel, snap.lessonTimeLabel].filter(
    (p) => typeof p === "string" && p.trim(),
  );
  return parts.join(" · ") || "Заняття";
}

/** @param {HTMLElement} container */
function mountVisitJournal(container, visits) {
  container.innerHTML = "";
  const attended = (visits || []).filter((v) => v && String(v.vote_choice || "") !== "skip");
  if (!attended.length) {
    container.innerHTML = `<p class="admin-muted" style="margin:0">Поки немає відвіданих занять у журналі.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const visit of attended) {
    const isAbon = String(visit.vote_choice || "") === "abon";
    const rolledBack = String(visit.visit_status || "") === "rolled_back";
    const item = document.createElement("div");
    item.className = `admin-visit-journal__item${rolledBack ? " admin-visit-journal__item--rolled-back" : ""}`;

    const kind = document.createElement("span");
    kind.className = `admin-visit-journal__kind admin-visit-journal__kind--${isAbon ? "abon" : "single"}`;
    kind.textContent = isAbon ? "Абон" : "Раз";
    kind.title = isAbon ? "Абонемент" : "Разове";

    const main = document.createElement("div");
    main.className = "admin-visit-journal__main";
    const label = document.createElement("div");
    label.className = "admin-visit-journal__label";
    label.textContent = visitOccurrenceLabel(visit);
    const meta = document.createElement("div");
    meta.className = "admin-visit-journal__meta";
    const when =
      visit.lesson_vote_occurrences?.occurrence_at || visit.created_at || null;
    meta.textContent = formatVisitDateTime(when);
    main.append(label, meta);

    item.append(kind, main);
    if (rolledBack) {
      const st = document.createElement("span");
      st.className = "admin-visit-journal__status";
      st.textContent = "Не був";
      item.appendChild(st);
    }
    frag.appendChild(item);
  }
  container.appendChild(frag);
}

/** @type {string | null} */
let selectedId = null;

const STUDENTS_PAGE_SIZE = 12;
const STUDENT_ABSENT_MS = 14 * 24 * 60 * 60 * 1000;
let studentsPage = 1;
let studentsRiskFilter = false;
/** @type {any[]} */
let cachedAllStudentRows = [];
/** @type {any[]} */
let cachedStudentRows = [];

function studentRowsForDisplay(allRows) {
  if (!studentsRiskFilter) return allRows;
  return allRows.filter((s) => isStudentAbsentOverTwoWeeks(s, s.last_visit_at));
}

let studentsAdminWired = false;

export async function setupStudentsAdmin() {
  const listEl = el("studentsList");
  const searchEl = el("studentsSearch");
  const reloadBtn = el("studentsReload");
  const riskBtn = el("studentsRiskFilter");
  const editModal = el("studentEditModal");
  const visitsModal = el("studentVisitsModal");
  const subFormToggle = el("subscriptionFormToggle");
  const subForm = el("subscriptionAddForm");
  let listRequestSeq = 0;

  /** @type {HTMLElement[]} */
  const modals = [editModal, visitsModal].filter(Boolean);

  function anyModalOpen() {
    return modals.some((m) => m && !m.classList.contains("admin-hide"));
  }

  function syncBodyModalLock() {
    document.body.classList.toggle("admin-modal-open", anyModalOpen());
  }

  /** @param {HTMLElement | null} modalEl */
  function openModal(modalEl) {
    if (!modalEl) return;
    for (const m of modals) {
      if (m && m !== modalEl) {
        m.classList.add("admin-hide");
        m.setAttribute("aria-hidden", "true");
      }
    }
    modalEl.classList.remove("admin-hide");
    modalEl.setAttribute("aria-hidden", "false");
    syncBodyModalLock();
    const closeBtn = modalEl.querySelector(".admin-modal__close");
    if (closeBtn instanceof HTMLElement) closeBtn.focus();
  }

  /** @param {HTMLElement | null} modalEl */
  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("admin-hide");
    modalEl.setAttribute("aria-hidden", "true");
    syncBodyModalLock();
  }

  function closeAllModals() {
    for (const m of modals) closeModal(m);
    selectedId = null;
    subForm?.classList.add("admin-hide");
    el("studentDeleteBtn")?.classList.add("admin-hide");
  }

  /**
   * Картки абонементів з редагуванням (PATCH /api/admin/subscriptions/:id).
   * @param {HTMLElement} container
   * @param {any[]} subscriptions
   * @param {string} studentId
   * @param {any[]} visits
   */
  function mountStudentSubscriptionCards(container, subscriptions, studentId, visits) {
    container.innerHTML = "";
    if (!subscriptions.length) {
      container.classList.add("admin-muted");
      container.innerHTML = `<p class="admin-muted" style="margin:0">Немає абонементів.</p>`;
      return;
    }
    container.classList.remove("admin-muted");

    const reloadSubs = async () => {
      await refreshList();
      await openDetail(studentId);
    };

    const field = (labelText, ctrl) => {
      const wrap = document.createElement("div");
      wrap.className = "admin-field";
      const lab = document.createElement("label");
      lab.textContent = labelText;
      wrap.appendChild(lab);
      wrap.appendChild(ctrl);
      return wrap;
    };

    for (const sub of subscriptions) {
      const lt = sub.lesson_types;
      const ltName = (lt && lt.name) || sub.lesson_type_id || "—";

      const card = document.createElement("div");
      card.className = "admin-panel admin-subscription-card";

      const head = document.createElement("div");
      head.className = "admin-subscription-card__head";
      const titleEl = document.createElement("strong");
      titleEl.className = "admin-subscription-card__title";
      titleEl.textContent = ltName;
      const sep = document.createElement("span");
      sep.className = "admin-muted";
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = " · ";
      const statusEl = document.createElement("span");
      statusEl.className = "admin-subscription-card__status";
      statusEl.textContent = subscriptionStatusLabelUk(sub.status);
      head.append(titleEl, sep, statusEl);
      card.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "admin-grid admin-grid--2";

      const visitsIn = document.createElement("input");
      visitsIn.type = "number";
      visitsIn.min = "0";
      visitsIn.step = "1";
      visitsIn.value = sub.total_visits != null ? String(sub.total_visits) : "";

      const attendedCount = countAttendedVisitsForSubscription(visits, sub.id);
      const displayedUsed = computeUsedVisitsDisplay(sub, visits);

      const usedIn = document.createElement("input");
      usedIn.type = "number";
      usedIn.min = "0";
      usedIn.step = "1";
      usedIn.className = "admin-subscription-card__visits-used-input";
      usedIn.id = `visit-used-${sub.id}`;
      usedIn.value = String(displayedUsed);
      usedIn.title =
        "Використані візити (разом). Якщо зберегти число як у журналі — лише авто-списання; більше значення задає «вже використано до журналу», і нові finalize додаються зверху.";

      const visitsField = document.createElement("div");
      visitsField.className = "admin-field";
      const visitsLab = document.createElement("label");
      visitsLab.textContent = "Використано · пакет";
      const visitsRow = document.createElement("div");
      visitsRow.className = "admin-subscription-card__visits-row";
      visitsLab.setAttribute("for", `visit-pkg-${sub.id}`);
      visitsIn.id = `visit-pkg-${sub.id}`;
      visitsRow.append(usedIn, visitsIn);
      visitsField.append(visitsLab, visitsRow);

      const validUntil = document.createElement("input");
      validUntil.type = "date";
      validUntil.value = toDateInputValue(sub.valid_until);

      const amountIn = document.createElement("input");
      amountIn.type = "number";
      amountIn.min = "0";
      amountIn.step = "1";
      amountIn.value =
        sub.amount_uah != null && sub.amount_uah !== "" ? String(Number(sub.amount_uah)) : "";

      const statusSel = document.createElement("select");
      const statusOpts = [
        ["pending", "в обробці"],
        ["active", "активний"],
        ["exhausted", "вичерпаний"],
      ];
      for (const [val, txt] of statusOpts) {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = txt;
        statusSel.appendChild(o);
      }
      statusSel.value = String(sub.status || "pending");

      grid.appendChild(visitsField);
      grid.appendChild(field("Діє до", validUntil));
      grid.appendChild(field("Сума ₴", amountIn));
      grid.appendChild(field("Статус", statusSel));
      card.appendChild(grid);

      const actions = document.createElement("div");
      actions.className = "admin-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn--primary btn--sm";
      saveBtn.textContent = "Зберегти абонемент";

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--sm";
      delBtn.textContent = "Видалити";

      saveBtn.addEventListener("click", async () => {
        showStudentsLocalError("");
        const tvRaw = visitsIn.value.trim();
        const total_visits = tvRaw === "" ? null : Math.max(0, Number.parseInt(tvRaw, 10));
        if (total_visits != null && !Number.isFinite(total_visits)) {
          showStudentsLocalError("Некоректна кількість візитів.");
          return;
        }
        const valid_until = validUntil.value.trim() || null;
        const amountRaw = amountIn.value.trim();
        const amount_uah = amountRaw === "" ? null : Number(amountRaw);
        if (amountRaw !== "" && !Number.isFinite(amount_uah)) {
          showStudentsLocalError("Некоректна сума.");
          return;
        }

        const attendedNow = countAttendedVisitsForSubscription(visits, sub.id);
        const u = Number.parseInt(String(usedIn.value).trim(), 10);
        if (!Number.isFinite(u) || u < 0) {
          showStudentsLocalError("Некоректна кількість використаних візитів.");
          return;
        }
        /** Авто з журналу — якщо лишили число як у журналі. Інакше override = «використано до журналу» (u − journal). */
        const used_visits_override = u === attendedNow ? null : Math.max(0, u - attendedNow);

        saveBtn.disabled = true;
        delBtn.disabled = true;
        try {
          await fetchJson(`/api/admin/subscriptions/${encodeURIComponent(sub.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              total_visits,
              valid_until,
              amount_uah,
              status: statusSel.value,
              used_visits_override,
            }),
          });
          await reloadSubs();
          showStudentEditOk("Абонемент збережено.");
        } catch (err) {
          showStudentsLocalError(err?.message || String(err));
        } finally {
          saveBtn.disabled = false;
          delBtn.disabled = false;
        }
      });

      delBtn.addEventListener("click", async () => {
        if (!confirm("Видалити цей абонемент?")) return;
        showStudentsLocalError("");
        saveBtn.disabled = true;
        delBtn.disabled = true;
        try {
          await fetchJson(`/api/admin/subscriptions/${encodeURIComponent(sub.id)}`, {
            method: "DELETE",
          });
          await reloadSubs();
          showStudentEditOk("Абонемент видалено.");
        } catch (err) {
          showStudentsLocalError(err?.message || String(err));
        } finally {
          saveBtn.disabled = false;
          delBtn.disabled = false;
        }
      });

      actions.append(saveBtn, delBtn);
      card.appendChild(actions);
      container.appendChild(card);
    }
  }

  listEl?.classList.add("admin-students-list");

  const { url, anonKey } = await getSupabaseConfig();
  if (!url || !anonKey) {
    showStudentsLocalError(
      "Немає PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY з сервера (.env). Перезапустіть node server.js.",
    );
    return;
  }
  const supabase = createClient(url, anonKey);

  async function loadLessonTypeOptions() {
    const select = el("subscriptionLessonType");
    if (!select) return;
    const { data, error } = await supabase.from("lesson_types").select("id, name").order("name");
    if (error) throw error;
    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— оберіть тип —";
    select.appendChild(opt0);
    for (const row of data || []) {
      const o = document.createElement("option");
      o.value = row.id;
      o.textContent = row.name || row.id;
      select.appendChild(o);
    }
    if (window.CustomSelects?.refreshSelect) {
      window.CustomSelects.refreshSelect(select);
    }
  }

  function renderStudentsPagination(totalCount) {
    const paginationRoot = el("studentsPagination");
    if (!paginationRoot) return;
    paginationRoot.innerHTML = "";
    if (totalCount <= STUDENTS_PAGE_SIZE) return;

    const totalPages = Math.max(1, Math.ceil(totalCount / STUDENTS_PAGE_SIZE));
    studentsPage = Math.min(Math.max(1, studentsPage), totalPages);

    const pagination = document.createElement("div");
    pagination.className = "admin-lessons__pagination";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn--ghost btn--sm";
    prevBtn.textContent = "← Попередні";
    prevBtn.disabled = studentsPage <= 1;
    prevBtn.addEventListener("click", () => {
      if (studentsPage <= 1) return;
      studentsPage -= 1;
      mountStudentsList(cachedStudentRows);
    });

    const info = document.createElement("span");
    info.className = "admin-muted";
    const scopeLabel = studentsRiskFilter ? " · зона ризику" : "";
    info.textContent = `Сторінка ${studentsPage} з ${totalPages} · учнів: ${totalCount}${scopeLabel}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn--ghost btn--sm";
    nextBtn.textContent = "Наступні →";
    nextBtn.disabled = studentsPage >= totalPages;
    nextBtn.addEventListener("click", () => {
      if (studentsPage >= totalPages) return;
      studentsPage += 1;
      mountStudentsList(cachedStudentRows);
    });

    pagination.append(prevBtn, info, nextBtn);
    paginationRoot.appendChild(pagination);
  }

  function mountStudentsList(rows) {
    if (!listEl) return;

    cachedStudentRows = rows;
    const totalPages = Math.max(1, Math.ceil(rows.length / STUDENTS_PAGE_SIZE));
    studentsPage = Math.min(Math.max(1, studentsPage), totalPages);

    listEl.innerHTML = "";
    if (!rows.length) {
      const emptyMsg = studentsRiskFilter
        ? "У зоні ризику зараз нікого немає."
        : "Нікого не знайдено.";
      listEl.innerHTML = `<p class="admin-muted">${emptyMsg}</p>`;
      renderStudentsPagination(0);
      listEl.dataset.ready = "true";
      return;
    }

    const pageStart = (studentsPage - 1) * STUDENTS_PAGE_SIZE;
    const pageRows = rows.slice(pageStart, pageStart + STUDENTS_PAGE_SIZE);
    const frag = document.createDocumentFragment();
    for (const s of pageRows) {
      const absent = isStudentAbsentOverTwoWeeks(s, s.last_visit_at);

      const card = document.createElement("article");
      card.className = "admin-students-card admin-students-card--tile";
      if (absent) card.classList.add("admin-students-card--absent");

      if (absent) {
        const trigger = document.createElement("span");
        trigger.className = "admin-students-card__absent-trigger";
        trigger.title = absentStudentTriggerTitle(s, s.last_visit_at);
        trigger.setAttribute("aria-label", trigger.title);
        card.appendChild(trigger);
      }

      const head = document.createElement("div");
      head.className = "admin-students-card__head";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "admin-students-card__name-btn";
      nameBtn.textContent = formatStudentListLabel(s);
      nameBtn.addEventListener("click", () => {
        void openDetail(String(s.id));
      });
      head.appendChild(nameBtn);

      const metrics = document.createElement("div");
      metrics.className = "admin-students-card__metrics";
      mountStudentTileMetrics(metrics, s);

      const actions = document.createElement("div");
      actions.className = "admin-students-card__actions";

      const journalBtn = document.createElement("button");
      journalBtn.type = "button";
      journalBtn.className = "btn btn--ghost btn--sm admin-students-card__journal-btn";
      journalBtn.textContent = "Журнал";
      journalBtn.title = "Журнал відвідування";
      journalBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void openVisitsJournal(String(s.id), formatStudentListLabel(s));
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--sm admin-students-card__edit-btn";
      editBtn.textContent = "✏️";
      editBtn.title = "Редагувати";
      editBtn.setAttribute("aria-label", "Редагувати");
      editBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void openDetail(String(s.id));
      });

      actions.append(journalBtn, editBtn);
      card.append(head, metrics, actions);
      frag.appendChild(card);
    }
    listEl.appendChild(frag);
    renderStudentsPagination(rows.length);
    listEl.dataset.ready = "true";
  }

  function syncRiskFilterButton() {
    if (!riskBtn) return;
    riskBtn.textContent = studentsRiskFilter ? "Показати всіх" : "Зона ризику";
    riskBtn.setAttribute("aria-pressed", studentsRiskFilter ? "true" : "false");
    riskBtn.title = studentsRiskFilter
      ? "Повернути повний список учнів"
      : "Учні без жодного заняття або без відвідування понад 2 тижні";
    riskBtn.classList.toggle("btn--danger", !studentsRiskFilter);
    riskBtn.classList.toggle("btn--ghost", studentsRiskFilter);
  }

  function mountStudentsFromCache({ resetPage = false } = {}) {
    if (resetPage) studentsPage = 1;
    mountStudentsList(studentRowsForDisplay(cachedAllStudentRows));
  }

  async function refreshList({ resetPage = false } = {}) {
    if (!listEl) return;
    if (resetPage) studentsPage = 1;
    const requestSeq = ++listRequestSeq;
    const hasRenderedList = listEl.dataset.ready === "true";
    showStudentsLocalError("");
    listEl.setAttribute("aria-busy", "true");
    listEl.classList.toggle("admin-students-list--loading", hasRenderedList);
    if (reloadBtn) reloadBtn.disabled = true;
    if (riskBtn) riskBtn.disabled = true;
    if (!hasRenderedList) {
      listEl.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
      el("studentsPagination") && (el("studentsPagination").innerHTML = "");
    }
    const search = searchEl?.value.trim() || "";
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    const query = q.toString();
    try {
      const json = await fetchJson(`/api/admin/students${query ? `?${query}` : ""}`);
      if (requestSeq !== listRequestSeq) return;
      cachedAllStudentRows = json.rows || [];
      mountStudentsList(studentRowsForDisplay(cachedAllStudentRows));
    } catch (e) {
      if (requestSeq !== listRequestSeq) return;
      if (!hasRenderedList) listEl.innerHTML = "";
      el("studentsPagination") && (el("studentsPagination").innerHTML = "");
      showStudentsLocalError(e?.message || String(e));
    } finally {
      if (requestSeq === listRequestSeq) {
        listEl.setAttribute("aria-busy", "false");
        listEl.classList.remove("admin-students-list--loading");
        if (reloadBtn) reloadBtn.disabled = false;
        if (riskBtn) riskBtn.disabled = false;
      }
    }
  }

  async function openDetail(id) {
    selectedId = id;
    showStudentsLocalError("");
    clearStudentEditOk();
    openModal(editModal);
    const title = el("studentDetailTitle");
    if (title) title.textContent = "Завантаження…";
    try {
      const json = await fetchJson(`/api/admin/students/${encodeURIComponent(id)}`);
      const st = json.student;
      if (title) title.textContent = formatStudentListLabel(st) || "Учень";
      el("studentDetailId").value = st.id;
      el("studentDisplayName").value = st.display_name || "";
      el("studentTelegramUsername").value = st.telegram_username || "";
      el("studentPhone").value = st.phone || "";
      el("studentInstagram").value = st.instagram || "";
      el("studentAdminNote").value = st.admin_note || "";

      const subsEl = el("studentSubscriptions");
      if (subsEl) {
        mountStudentSubscriptionCards(subsEl, json.subscriptions || [], st.id, json.visits || []);
      }

      await loadLessonTypeOptions();
      el("subscriptionTotalVisits").value = "";
      el("subscriptionAmount").value = "";
      el("subscriptionValidUntil").value = "";
      el("subscriptionLessonType").value = "";
      if (subForm) subForm.classList.add("admin-hide");
      el("studentDeleteBtn")?.classList.remove("admin-hide");
    } catch (e) {
      showStudentsLocalError(e?.message || String(e));
    }
  }

  async function openVisitsJournal(id, displayName) {
    showStudentsLocalError("");
    openModal(visitsModal);
    const title = el("studentVisitsModalTitle");
    const sub = el("studentVisitsModalSub");
    const listBox = el("studentVisitsList");
    if (title) title.textContent = "Журнал відвідування";
    if (sub) sub.textContent = displayName ? `Учень: ${displayName}` : "";
    if (listBox) listBox.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
    try {
      const json = await fetchJson(`/api/admin/students/${encodeURIComponent(id)}`);
      const st = json.student;
      if (sub) {
        sub.textContent = formatStudentListLabel(st) || displayName || "";
      }
      if (listBox) mountVisitJournal(listBox, json.visits || []);
    } catch (e) {
      if (listBox) listBox.innerHTML = "";
      showStudentsLocalError(e?.message || String(e));
    }
  }

  const wireOnce = !studentsAdminWired;
  if (wireOnce) studentsAdminWired = true;

  if (wireOnce) {
    for (const modal of modals) {
      modal?.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
        node.addEventListener("click", () => closeModal(modal));
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (visitsModal && !visitsModal.classList.contains("admin-hide")) {
        closeModal(visitsModal);
        return;
      }
      if (editModal && !editModal.classList.contains("admin-hide")) {
        closeAllModals();
      }
    });

    reloadBtn?.addEventListener("click", () => void refreshList({ resetPage: true }));
    riskBtn?.addEventListener("click", () => {
      studentsRiskFilter = !studentsRiskFilter;
      syncRiskFilterButton();
      mountStudentsFromCache({ resetPage: true });
    });
    searchEl?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void refreshList({ resetPage: true });
    });

    subFormToggle?.addEventListener("click", () => {
      if (!subForm) return;
      subForm.classList.toggle("admin-hide");
      if (!subForm.classList.contains("admin-hide")) {
        void loadLessonTypeOptions();
      }
    });

    el("studentEditForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      showStudentsLocalError("");
      const id = el("studentDetailId")?.value;
      if (!id) return;
      try {
        await fetchJson(`/api/admin/students/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            display_name: el("studentDisplayName")?.value.trim(),
            telegram_username: el("studentTelegramUsername")?.value.trim() || null,
            phone: el("studentPhone")?.value.trim() || null,
            instagram: el("studentInstagram")?.value.trim() || null,
            admin_note: el("studentAdminNote")?.value.trim() || null,
          }),
        });
        await refreshList();
        await openDetail(id);
        showStudentEditOk("Контакти збережено.");
      } catch (err) {
        showStudentsLocalError(err?.message || String(err));
      }
    });

    el("studentDeleteBtn")?.addEventListener("click", async () => {
      const id = el("studentDetailId")?.value;
      if (!id) return;
      if (!confirm("Видалити учня з усіма повʼязаними даними?")) return;
      try {
        const json = await fetchJson(`/api/admin/students/${encodeURIComponent(id)}`, { method: "DELETE" });
        const n = json.visitCount ?? 0;
        alert(`Видалено. Було візитів у записі: ${n}.`);
        closeAllModals();
        await refreshList();
      } catch (err) {
        showStudentsLocalError(err?.message || String(err));
      }
    });

    el("subscriptionAddForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sid = el("studentDetailId")?.value;
      const lessonTypeId = el("subscriptionLessonType")?.value;
      if (!sid || !lessonTypeId) return;
      const tvRaw = el("subscriptionTotalVisits")?.value.trim();
      const total_visits =
        tvRaw === "" ? null : Math.max(1, Number.parseInt(tvRaw, 10));
      try {
        await fetchJson("/api/admin/subscriptions", {
          method: "POST",
          body: JSON.stringify({
            student_id: sid,
            lesson_type_id: lessonTypeId,
            total_visits,
            amount_uah: el("subscriptionAmount")?.value ? Number(el("subscriptionAmount").value) : null,
            valid_until: el("subscriptionValidUntil")?.value || null,
          }),
        });
        await openDetail(sid);
        await refreshList();
        showStudentEditOk("Абонемент додано.");
      } catch (err) {
        showStudentsLocalError(err?.message || String(err));
      }
    });
  }

  syncRiskFilterButton();
  await refreshList();
  if (selectedId) await openDetail(selectedId);
}
