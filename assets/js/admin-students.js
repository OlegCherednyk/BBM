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

/** Бейдж у списку: пріоритет активний → в обробці → вичерпаний. */
function appendAbonBadgeIfAny(rowWrap, summary) {
  const p = Number(summary?.pending) || 0;
  const a = Number(summary?.active) || 0;
  const x = Number(summary?.exhausted) || 0;
  if (!p && !a && !x) return;
  const span = document.createElement("span");
  span.className = "admin-students-abon-badge";
  span.textContent = "Абон";
  span.title =
    a > 0 ? "Є активний абонемент" : p > 0 ? "Є абонемент «в обробці»" : "Лише вичерпані абонементи";
  if (a > 0) span.classList.add("admin-students-abon-badge--active");
  else if (p > 0) span.classList.add("admin-students-abon-badge--pending");
  else span.classList.add("admin-students-abon-badge--exhausted");
  rowWrap.appendChild(span);
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

function subscriptionsCountFallback(summary) {
  const raw = Number(summary?.subscriptions_count);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  const p = Number(summary?.pending) || 0;
  const a = Number(summary?.active) || 0;
  const x = Number(summary?.exhausted) || 0;
  return p + a + x;
}

function appendStudentCardMetaNums(tail, summary) {
  const nSubs = subscriptionsCountFallback(summary);
  const totalPkg = Number(summary?.abon_visits_total);
  let remPkg = Number(summary?.abon_visits_remaining);

  /** @type {string[]} */
  const parts = [];
  if (nSubs > 0) parts.push(String(nSubs));

  let visitsTitle = "";
  if (Number.isFinite(totalPkg) && totalPkg > 0) {
    if (!Number.isFinite(remPkg) || remPkg < 0) remPkg = 0;
    parts.push(`${Math.floor(remPkg)}/${Math.floor(totalPkg)}`);
    visitsTitle = ` Візити: ${Math.floor(remPkg)} із ${Math.floor(totalPkg)} (усі абонементи з пакетом).`;
  }

  if (!parts.length) return;

  const meta = document.createElement("span");
  meta.className = "admin-students-card__meta";
  meta.textContent = parts.join("\u2003·\u2003");
  const titleBits = [];
  if (nSubs > 0) titleBits.push(`Абонементів: ${nSubs}.`);
  if (visitsTitle.trim()) titleBits.push(visitsTitle.trim());
  meta.title = titleBits.join(" ").trim() || "Зведення по абонементах учня.";
  tail.appendChild(meta);
}

function appendAttendedVisitsDot(tail, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const dot = document.createElement("span");
  dot.className = "admin-students-visits-dot";
  dot.textContent = String(n);
  dot.title =
    n === 0 ? "Немає відвіданих занять" : n === 1 ? "1 відвідане заняття" : `${n} відвіданих занять`;
  tail.appendChild(dot);
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

let studentsAdminWired = false;

export async function setupStudentsAdmin() {
  const listEl = el("studentsList");
  const searchEl = el("studentsSearch");
  const filterEl = el("studentsFilter");
  const abonFilterEl = el("studentsAbonFilter");
  const reloadBtn = el("studentsReload");
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
          const okBox = el("dashOk");
          if (okBox) {
            okBox.textContent = "Абонемент збережено.";
            okBox.classList.remove("admin-hide");
            setTimeout(() => okBox.classList.add("admin-hide"), 2400);
          }
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
          const okBox = el("dashOk");
          if (okBox) {
            okBox.textContent = "Абонемент видалено.";
            okBox.classList.remove("admin-hide");
            setTimeout(() => okBox.classList.add("admin-hide"), 2400);
          }
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

  const params = new URLSearchParams(window.location.search);
  const qFilter = params.get("filter");
  if (filterEl && qFilter && ["all", "pending", "active", "exhausted"].includes(qFilter)) {
    filterEl.value = qFilter;
  }
  const qAbon = params.get("abon");
  if (abonFilterEl && qAbon && ["all", "has_abon", "no_abon"].includes(qAbon)) {
    abonFilterEl.value = qAbon;
  }

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

  async function refreshList() {
    if (!listEl) return;
    const requestSeq = ++listRequestSeq;
    const hasRenderedList = listEl.dataset.ready === "true";
    showStudentsLocalError("");
    listEl.setAttribute("aria-busy", "true");
    listEl.classList.toggle("admin-students-list--loading", hasRenderedList);
    if (reloadBtn) reloadBtn.disabled = true;
    if (!hasRenderedList) {
      listEl.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
    }
    const search = searchEl?.value.trim() || "";
    const filter = filterEl?.value || "all";
    const abonFilter = abonFilterEl?.value || "all";
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (filter !== "all") q.set("filter", filter);
    if (abonFilter !== "all") q.set("abon", abonFilter);
    const query = q.toString();
    try {
      const json = await fetchJson(`/api/admin/students${query ? `?${query}` : ""}`);
      if (requestSeq !== listRequestSeq) return;
      const rows = json.rows || [];
      if (!rows.length) {
        listEl.innerHTML = `<p class="admin-muted">Нікого не знайдено.</p>`;
        listEl.dataset.ready = "true";
        return;
      }
      const frag = document.createDocumentFragment();
      for (const s of rows) {
        const card = document.createElement("div");
        card.className = "admin-panel admin-students-card";
        const row = document.createElement("div");
        row.className = "admin-students-card__row";

        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "admin-students-card__name-btn";
        nameBtn.textContent = formatStudentListLabel(s);
        nameBtn.addEventListener("click", () => {
          void openDetail(String(s.id));
        });

        const tail = document.createElement("div");
        tail.className = "admin-students-card__tail";
        appendAbonBadgeIfAny(tail, s.subscription_summary);
        appendStudentCardMetaNums(tail, s.subscription_summary);
        appendAttendedVisitsDot(tail, s.attended_visits_count);

        const actions = document.createElement("div");
        actions.className = "admin-students-card__actions";

        const journalBtn = document.createElement("button");
        journalBtn.type = "button";
        journalBtn.className = "btn btn--ghost btn--sm";
        journalBtn.textContent = "Журнал відвідування";
        journalBtn.title = "Усі заняття учня";
        journalBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void openVisitsJournal(String(s.id), formatStudentListLabel(s));
        });

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn--primary btn--sm";
        editBtn.textContent = "Редагувати";
        editBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void openDetail(String(s.id));
        });

        actions.append(journalBtn, editBtn);
        row.append(nameBtn, tail, actions);
        card.appendChild(row);
        frag.appendChild(card);
      }
      listEl.innerHTML = "";
      listEl.appendChild(frag);
      listEl.dataset.ready = "true";
    } catch (e) {
      if (requestSeq !== listRequestSeq) return;
      if (!hasRenderedList) listEl.innerHTML = "";
      showStudentsLocalError(e?.message || String(e));
    } finally {
      if (requestSeq === listRequestSeq) {
        listEl.setAttribute("aria-busy", "false");
        listEl.classList.remove("admin-students-list--loading");
        if (reloadBtn) reloadBtn.disabled = false;
      }
    }
  }

  async function openDetail(id) {
    selectedId = id;
    showStudentsLocalError("");
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

    reloadBtn?.addEventListener("click", () => void refreshList());
    searchEl?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void refreshList();
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
        if (window.showDashOk) {
          /* admin.js may not export — use dashOk element if present */
          const ok = el("dashOk");
          if (ok) {
            ok.textContent = "Збережено.";
            ok.classList.remove("admin-hide");
            setTimeout(() => ok.classList.add("admin-hide"), 2400);
          }
        }
        await refreshList();
        await openDetail(id);
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
        const ok = el("dashOk");
        if (ok) {
          ok.textContent = "Абонемент оновлено.";
          ok.classList.remove("admin-hide");
          setTimeout(() => ok.classList.add("admin-hide"), 2400);
        }
      } catch (err) {
        showStudentsLocalError(err?.message || String(err));
      }
    });
  }

  await refreshList();
  if (selectedId) await openDetail(selectedId);
}
