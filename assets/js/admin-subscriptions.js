import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

function el(id) {
  return document.getElementById(id);
}

function showSubsError(msg) {
  const box = el("subsError");
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle("admin-hide", !msg);
}

function apiBase() {
  return window.location.origin;
}

/** Після зміни value нативного select оновити підпис custom-select. */
function syncSelectUi(selectEl) {
  if (selectEl && window.CustomSelects?.refreshSelect) {
    window.CustomSelects.refreshSelect(selectEl);
  }
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

function subscriptionStatusLabelUk(code) {
  switch (String(code || "")) {
    case "pending": return "в обробці";
    case "active": return "активний";
    case "exhausted": return "вичерпаний";
    default: return String(code || "—");
  }
}

function subscriptionStatusClass(code) {
  switch (String(code || "")) {
    case "active": return "admin-students-abon-badge--active";
    case "pending": return "admin-students-abon-badge--pending";
    case "exhausted": return "admin-students-abon-badge--exhausted";
    default: return "";
  }
}

/** Підказка, чому статус «вичерпаний» не збігається з лічильником у журналі. */
function exhaustedStatusTitle(sub) {
  const used = Number(sub.visits_used ?? sub.visits_attended) || 0;
  const journal = Number(sub.visits_attended) || 0;
  const total = sub.total_visits != null ? Number(sub.total_visits) : null;
  const hint = sub.status_hint;

  if (hint === "expired") {
    const d = sub.valid_until ? formatDateShort(sub.valid_until) : "—";
    return `Вичерпаний: термін дії минув (діє до ${d}). У журналі ${journal}${total != null ? ` з ${total}` : ""} занять.`;
  }
  if (hint === "visits_used") {
    if (journal < used && sub.used_visits_override != null) {
      return `Вичерпаний: враховано ${used}${total != null ? `/${total}` : ""} (у журналі ${journal}, решта — «до журналу»).`;
    }
    return `Вичерпаний: використано ${used}${total != null ? ` з ${total}` : ""} візитів.`;
  }
  if (hint === "manual") {
    return `Статус «вичерпаний» встановлено вручну. У журналі ${journal}${total != null ? `/${total}` : ""}. Змініть статус на «активний», якщо абон ще дійсний.`;
  }
  if (String(sub.status) === "exhausted") {
    return `Вичерпаний. Використано (разом): ${used}${total != null ? `/${total}` : ""}, у журналі: ${journal}.`;
  }
  return subscriptionStatusLabelUk(sub.status);
}

function toDateInputValue(isoLike) {
  if (isoLike == null || isoLike === "") return "";
  const s = String(isoLike).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function formatDateShort(isoLike) {
  if (!isoLike) return "—";
  try {
    return new Date(isoLike).toLocaleDateString("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(isoLike).slice(0, 10);
  }
}

function formatVisitDateTime(isoLike) {
  if (!isoLike) return "—";
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

function formatStudentLabel(st) {
  if (!st) return "—";
  const name = String(st.display_name || "").trim();
  const nick = String(st.telegram_username || "").trim().replace(/^@/, "");
  if (nick && name && !name.includes(nick)) return `${name} @${nick}`;
  return name || (nick ? `@${nick}` : "—");
}

function visitOccurrenceLabel(visit) {
  const snap = visit?.lesson_vote_occurrences?.lesson_snapshot || {};
  const parts = [snap.lessonTypeLabel, snap.placeLabel, snap.lessonTimeLabel].filter(
    (p) => typeof p === "string" && p.trim(),
  );
  return parts.join(" · ") || "Заняття";
}

const SUBS_PAGE_SIZE = 15;
let subsPage = 1;
/** @type {any[]} */
let cachedSubRows = [];
/** @type {string | null} */
let currentSubId = null;
let subsAdminWired = false;

export async function setupSubscriptionsAdmin() {
  const listEl = el("subsList");
  const searchEl = el("subsSearch");
  const statusFilterEl = el("subsStatusFilter");
  const lessonTypeFilterEl = el("subsLessonTypeFilter");
  const reloadBtn = el("subsReload");
  const editModal = el("subEditModal");
  const reassignModal = el("visitReassignModal");
  const createModal = el("subCreateModal");

  /** @type {HTMLElement[]} */
  const modals = [editModal, reassignModal, createModal].filter(Boolean);

  function anyModalOpen() {
    return modals.some((m) => m && !m.classList.contains("admin-hide"));
  }

  function syncBodyModalLock() {
    document.body.classList.toggle("admin-modal-open", anyModalOpen());
  }

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

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("admin-hide");
    modalEl.setAttribute("aria-hidden", "true");
    syncBodyModalLock();
  }

  function closeAllModals() {
    for (const m of modals) closeModal(m);
    currentSubId = null;
  }

  const { url, anonKey } = await getSupabaseConfig();
  if (!url || !anonKey) {
    showSubsError("Немає PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. Перезапустіть node server.js.");
    return;
  }
  const supabase = createClient(url, anonKey);

  async function loadLessonTypeFilter() {
    if (!lessonTypeFilterEl) return;
    const { data, error } = await supabase.from("lesson_types").select("id, name").order("name");
    if (error) return;
    lessonTypeFilterEl.innerHTML = `<option value="">Усі типи</option>`;
    for (const row of data || []) {
      const o = document.createElement("option");
      o.value = row.id;
      o.textContent = row.name || row.id;
      lessonTypeFilterEl.appendChild(o);
    }
  }

  async function fillLessonTypeSelect(selectEl, placeholder) {
    if (!selectEl) return;
    const { data, error } = await supabase.from("lesson_types").select("id, name").order("name");
    if (error) throw error;
    selectEl.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder || "— оберіть тип —";
    selectEl.appendChild(opt0);
    for (const row of data || []) {
      const o = document.createElement("option");
      o.value = row.id;
      o.textContent = row.name || row.id;
      selectEl.appendChild(o);
    }
    syncSelectUi(selectEl);
  }

  function hideCreateStudentResults() {
    const results = el("subCreateStudentResults");
    const searchIn = el("subCreateStudentSearch");
    results?.classList.add("admin-hide");
    if (searchIn) searchIn.setAttribute("aria-expanded", "false");
  }

  function setCreateStudentSelected(student) {
    const idIn = el("subCreateStudentId");
    const selectedBox = el("subCreateStudentSelected");
    const searchIn = el("subCreateStudentSearch");
    if (!student) {
      if (idIn) idIn.value = "";
      selectedBox?.classList.add("admin-hide");
      searchIn?.classList.remove("admin-hide");
      if (searchIn) {
        searchIn.value = "";
        searchIn.disabled = false;
      }
      hideCreateStudentResults();
      return;
    }
    if (idIn) idIn.value = String(student.id);
    const label = el("subCreateStudentSelectedLabel");
    if (label) label.textContent = formatStudentLabel(student);
    selectedBox?.classList.remove("admin-hide");
    searchIn?.classList.add("admin-hide");
    hideCreateStudentResults();
  }

  async function renderCreateStudentResults(query) {
    const results = el("subCreateStudentResults");
    const searchIn = el("subCreateStudentSearch");
    if (!results) return;

    const q = String(query ?? "").trim();
    if (q.length < 1) {
      hideCreateStudentResults();
      return;
    }

    results.innerHTML = `<li><p class="admin-student-pick__empty">Пошук…</p></li>`;
    results.classList.remove("admin-hide");
    if (searchIn) searchIn.setAttribute("aria-expanded", "true");

    try {
      const params = new URLSearchParams({ search: q });
      const json = await fetchJson(`/api/admin/students?${params}`);
      const rows = (json.rows || []).slice(0, 12);
      results.innerHTML = "";
      if (!rows.length) {
        results.innerHTML = `<li><p class="admin-student-pick__empty">Нікого не знайдено.</p></li>`;
        return;
      }
      for (const st of rows) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "admin-student-pick__option";
        btn.setAttribute("role", "option");
        btn.textContent = formatStudentLabel(st);
        btn.addEventListener("click", () => setCreateStudentSelected(st));
        li.appendChild(btn);
        results.appendChild(li);
      }
    } catch (e) {
      results.innerHTML = `<li><p class="admin-student-pick__empty">${e?.message || String(e)}</p></li>`;
    }
  }

  let createStudentSearchTimer = null;

  function resetCreateForm() {
    setCreateStudentSelected(null);
    const form = el("subCreateForm");
    form?.reset();
    el("subCreateTotalVisits").value = "";
    el("subCreateAmount").value = "";
    el("subCreateValidUntil").value = "";
    el("subCreatePurchasedAt").value = "";
    const lt = el("subCreateLessonType");
    if (lt) {
      lt.value = "";
      syncSelectUi(lt);
    }
  }

  async function openCreateModal() {
    showSubsError("");
    resetCreateForm();
    openModal(createModal);
    try {
      await fillLessonTypeSelect(el("subCreateLessonType"), "— оберіть тип —");
    } catch (e) {
      showSubsError(e?.message || String(e));
    }
    const searchIn = el("subCreateStudentSearch");
    if (searchIn && !el("subCreateStudentId")?.value) {
      searchIn.focus();
    }
  }

  function renderPagination(totalCount) {
    const paginationRoot = el("subsPagination");
    if (!paginationRoot) return;
    paginationRoot.innerHTML = "";
    if (totalCount <= SUBS_PAGE_SIZE) return;

    const totalPages = Math.max(1, Math.ceil(totalCount / SUBS_PAGE_SIZE));
    subsPage = Math.min(Math.max(1, subsPage), totalPages);

    const pagination = document.createElement("div");
    pagination.className = "admin-lessons__pagination";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn--ghost btn--sm";
    prevBtn.textContent = "← Попередні";
    prevBtn.disabled = subsPage <= 1;
    prevBtn.addEventListener("click", () => {
      if (subsPage <= 1) return;
      subsPage -= 1;
      mountSubsList(cachedSubRows);
    });

    const info = document.createElement("span");
    info.className = "admin-muted";
    info.textContent = `Сторінка ${subsPage} з ${totalPages} · абонементів: ${totalCount}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn--ghost btn--sm";
    nextBtn.textContent = "Наступні →";
    nextBtn.disabled = subsPage >= totalPages;
    nextBtn.addEventListener("click", () => {
      if (subsPage >= totalPages) return;
      subsPage += 1;
      mountSubsList(cachedSubRows);
    });

    pagination.append(prevBtn, info, nextBtn);
    paginationRoot.appendChild(pagination);
  }

  function mountSubsList(rows) {
    if (!listEl) return;
    cachedSubRows = rows;
    const totalPages = Math.max(1, Math.ceil(rows.length / SUBS_PAGE_SIZE));
    subsPage = Math.min(Math.max(1, subsPage), totalPages);
    listEl.innerHTML = "";

    if (!rows.length) {
      listEl.innerHTML = `<p class="admin-muted">Нічого не знайдено.</p>`;
      renderPagination(0);
      listEl.dataset.ready = "true";
      return;
    }

    const pageStart = (subsPage - 1) * SUBS_PAGE_SIZE;
    const pageRows = rows.slice(pageStart, pageStart + SUBS_PAGE_SIZE);
    const frag = document.createDocumentFragment();

    for (const sub of pageRows) {
      const studentLabel = formatStudentLabel(sub.students);
      const ltName = sub.lesson_types?.name || sub.lesson_type_id || "—";
      const journalVisits = Number(sub.visits_attended) || 0;
      const usedVisits = Number(sub.visits_used ?? sub.visits_attended) || 0;
      const totalVisits = sub.total_visits != null ? Number(sub.total_visits) : null;
      const visitsText = totalVisits != null ? `${usedVisits}/${totalVisits}` : `${usedVisits}/—`;
      const visitsTitle =
        journalVisits !== usedVisits
          ? `Використано (разом): ${usedVisits}. У журналі привʼязано до цього абонемента: ${journalVisits}.`
          : "Використано / пакет візитів";

      const card = document.createElement("div");
      card.className = "admin-panel admin-students-card";

      const row = document.createElement("div");
      row.className = "admin-students-card__row";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "admin-students-card__name-btn";
      nameBtn.style.textAlign = "left";
      nameBtn.innerHTML = `<span>${studentLabel}</span><span class="admin-muted" style="font-size:0.82rem;margin-left:6px">${ltName}</span>`;
      nameBtn.addEventListener("click", () => void openSubDetail(sub.id));

      const tail = document.createElement("div");
      tail.className = "admin-students-card__tail";

      const statusBadge = document.createElement("span");
      statusBadge.className = `admin-students-abon-badge ${subscriptionStatusClass(sub.status)}`;
      statusBadge.textContent = subscriptionStatusLabelUk(sub.status);
      statusBadge.title = exhaustedStatusTitle(sub);
      tail.appendChild(statusBadge);

      const visitsMeta = document.createElement("span");
      visitsMeta.className = "admin-students-card__meta";
      visitsMeta.textContent = visitsText;
      visitsMeta.title = visitsTitle;
      tail.appendChild(visitsMeta);

      if (sub.valid_until) {
        const dateMeta = document.createElement("span");
        dateMeta.className = "admin-muted";
        dateMeta.style.fontSize = "0.78rem";
        dateMeta.textContent = `до ${formatDateShort(sub.valid_until)}`;
        tail.appendChild(dateMeta);
      }

      const actions = document.createElement("div");
      actions.className = "admin-students-card__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--sm admin-students-card__edit-btn";
      editBtn.textContent = "✏️";
      editBtn.title = "Редагувати";
      editBtn.setAttribute("aria-label", "Редагувати");
      editBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void openSubDetail(sub.id);
      });

      actions.append(editBtn);
      row.append(nameBtn, tail, actions);
      card.appendChild(row);
      frag.appendChild(card);
    }

    listEl.appendChild(frag);
    renderPagination(rows.length);
    listEl.dataset.ready = "true";
  }

  let listRequestSeq = 0;

  async function refreshList({ resetPage = false } = {}) {
    if (!listEl) return;
    if (resetPage) subsPage = 1;
    const requestSeq = ++listRequestSeq;
    const hasRendered = listEl.dataset.ready === "true";
    showSubsError("");
    listEl.setAttribute("aria-busy", "true");
    listEl.classList.toggle("admin-students-list--loading", hasRendered);
    if (reloadBtn) reloadBtn.disabled = true;
    if (!hasRendered) {
      listEl.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
      el("subsPagination") && (el("subsPagination").innerHTML = "");
    }

    const q = new URLSearchParams();
    const search = searchEl?.value.trim() || "";
    const status = statusFilterEl?.value || "";
    const lessonType = lessonTypeFilterEl?.value || "";
    if (search) q.set("search", search);
    if (status) q.set("status", status);
    if (lessonType) q.set("lesson_type_id", lessonType);

    try {
      const json = await fetchJson(`/api/admin/subscriptions${q.toString() ? `?${q}` : ""}`);
      if (requestSeq !== listRequestSeq) return;
      mountSubsList(json.rows || []);
    } catch (e) {
      if (requestSeq !== listRequestSeq) return;
      if (!hasRendered) listEl.innerHTML = "";
      el("subsPagination") && (el("subsPagination").innerHTML = "");
      showSubsError(e?.message || String(e));
    } finally {
      if (requestSeq === listRequestSeq) {
        listEl.setAttribute("aria-busy", "false");
        listEl.classList.remove("admin-students-list--loading");
        if (reloadBtn) reloadBtn.disabled = false;
      }
    }
  }

  /**
   * Fetch student's subscriptions for the reassign dropdown.
   * @param {string} studentId
   * @param {string} currentSubId
   */
  async function loadStudentSubsForReassign(studentId, currentSubId) {
    const select = el("visitReassignSubSelect");
    if (!select) return;
    select.innerHTML = `<option value="">— без абонемента (разове) —</option>`;
    try {
      const json = await fetchJson(`/api/admin/students/${encodeURIComponent(studentId)}`);
      for (const sub of json.subscriptions || []) {
        const o = document.createElement("option");
        o.value = sub.id;
        const ltName = sub.lesson_types?.name || sub.lesson_type_id || "—";
        const used = Number(sub.visits_attended ?? 0);
        const total = sub.total_visits != null ? `/${sub.total_visits}` : "/—";
        o.textContent = `${ltName} · ${subscriptionStatusLabelUk(sub.status)}`;
        if (String(sub.id) === String(currentSubId)) o.selected = true;
        select.appendChild(o);
      }
      syncSelectUi(select);
    } catch (e) {
      showSubsError(e?.message || String(e));
    }
  }

  /**
   * Mount visit rows with reassign buttons inside the subscription detail modal.
   * @param {HTMLElement} container
   * @param {any[]} visits
   * @param {string} studentId
   */
  function mountSubVisits(container, visits, studentId) {
    container.innerHTML = "";
    const abon = (visits || []).filter((v) => v && String(v.vote_choice || "") !== "skip");
    if (!abon.length) {
      container.innerHTML = `<p class="admin-muted" style="margin:0">Немає відвіданих занять у журналі.</p>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const visit of abon) {
      const isAbon = String(visit.vote_choice || "") === "abon";
      const rolledBack = String(visit.visit_status || "") === "rolled_back";

      const item = document.createElement("div");
      item.className = `admin-visit-journal__item${rolledBack ? " admin-visit-journal__item--rolled-back" : ""}`;
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "8px";

      const kind = document.createElement("span");
      kind.className = `admin-visit-journal__kind admin-visit-journal__kind--${isAbon ? "abon" : "single"}`;
      kind.textContent = isAbon ? "Абон" : "Раз";

      const main = document.createElement("div");
      main.className = "admin-visit-journal__main";
      main.style.flex = "1";
      const label = document.createElement("div");
      label.className = "admin-visit-journal__label";
      label.textContent = visitOccurrenceLabel(visit);
      const meta = document.createElement("div");
      meta.className = "admin-visit-journal__meta";
      const when = visit.lesson_vote_occurrences?.occurrence_at || visit.created_at || null;
      meta.textContent = formatVisitDateTime(when);
      main.append(label, meta);

      item.append(kind, main);

      if (rolledBack) {
        const st = document.createElement("span");
        st.className = "admin-visit-journal__status";
        st.textContent = "Не був";
        item.appendChild(st);
      }

      const reassignBtn = document.createElement("button");
      reassignBtn.type = "button";
      reassignBtn.className = "btn btn--ghost btn--sm";
      reassignBtn.style.flexShrink = "0";
      reassignBtn.textContent = "Перечіпити";
      reassignBtn.title = "Змінити абонемент цього візиту";
      reassignBtn.addEventListener("click", () => {
        el("visitReassignVisitId").value = String(visit.id);
        const occLabel = visitOccurrenceLabel(visit);
        const dateLabel = formatVisitDateTime(when);
        el("visitReassignLabel").textContent = `${occLabel} · ${dateLabel}`;
        void loadStudentSubsForReassign(studentId, visit.subscription_id);
        openModal(reassignModal);
      });
      item.appendChild(reassignBtn);

      frag.appendChild(item);
    }
    container.appendChild(frag);
  }

  async function openSubDetail(subId) {
    currentSubId = subId;
    showSubsError("");
    openModal(editModal);
    const titleEl = el("subEditModalTitle");
    if (titleEl) titleEl.textContent = "Завантаження…";

    try {
      const json = await fetchJson(`/api/admin/subscriptions?search=`);
      const sub = (json.rows || []).find((r) => String(r.id) === String(subId));
      if (!sub) throw new Error("Абонемент не знайдено в списку.");

      if (titleEl) {
        const ltName = sub.lesson_types?.name || sub.lesson_type_id || "—";
        titleEl.textContent = `${ltName} · ${subscriptionStatusLabelUk(sub.status)}`;
      }

      const studentLabel = formatStudentLabel(sub.students);
      el("subEditStudentName").textContent = `Учень: ${studentLabel}`;
      el("subEditId").value = String(sub.id);
      el("subEditLessonType").value = sub.lesson_types?.name || sub.lesson_type_id || "";
      const statusSel = el("subEditStatus");
      if (statusSel) {
        statusSel.value = String(sub.status || "pending");
        syncSelectUi(statusSel);
      }
      el("subEditTotalVisits").value = sub.total_visits != null ? String(sub.total_visits) : "";
      el("subEditUsedVisits").value = String(Number(sub.visits_used ?? sub.visits_attended) || 0);
      el("subEditValidUntil").value = toDateInputValue(sub.valid_until);
      el("subEditAmount").value = sub.amount_uah != null ? String(Number(sub.amount_uah)) : "";
      el("subEditPurchasedAt").value = toDateInputValue(sub.purchased_at);

      const visitsContainer = el("subEditVisitsList");
      if (visitsContainer && sub.students?.id) {
        visitsContainer.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
        const studentJson = await fetchJson(`/api/admin/students/${encodeURIComponent(sub.students.id)}`);
        const subVisits = (studentJson.visits || []).filter(
          (v) => String(v.subscription_id || "") === String(sub.id),
        );
        mountSubVisits(visitsContainer, subVisits, sub.students.id);
      }
    } catch (e) {
      showSubsError(e?.message || String(e));
    }
  }

  const wireOnce = !subsAdminWired;
  if (wireOnce) subsAdminWired = true;

  if (wireOnce) {
    for (const modal of modals) {
      modal?.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
        node.addEventListener("click", () => {
          if (modal === reassignModal) {
            closeModal(reassignModal);
            if (currentSubId) openModal(editModal);
          } else {
            closeAllModals();
          }
        });
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (reassignModal && !reassignModal.classList.contains("admin-hide")) {
        closeModal(reassignModal);
        if (currentSubId) openModal(editModal);
        return;
      }
      if (createModal && !createModal.classList.contains("admin-hide")) {
        closeAllModals();
        return;
      }
      if (editModal && !editModal.classList.contains("admin-hide")) {
        closeAllModals();
      }
    });

    document.addEventListener("click", (e) => {
      const pick = el("subCreateStudentSearch")?.closest(".admin-student-pick");
      if (!pick || pick.contains(/** @type {Node} */ (e.target))) return;
      hideCreateStudentResults();
    });

    el("subCreateOpenBtn")?.addEventListener("click", () => void openCreateModal());

    el("subCreateStudentSearch")?.addEventListener("input", () => {
      const q = el("subCreateStudentSearch")?.value ?? "";
      if (createStudentSearchTimer) clearTimeout(createStudentSearchTimer);
      createStudentSearchTimer = setTimeout(() => void renderCreateStudentResults(q), 280);
    });

    el("subCreateStudentSearch")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (createStudentSearchTimer) clearTimeout(createStudentSearchTimer);
      void renderCreateStudentResults(el("subCreateStudentSearch")?.value ?? "");
    });

    el("subCreateStudentClear")?.addEventListener("click", () => {
      setCreateStudentSelected(null);
      el("subCreateStudentSearch")?.focus();
    });

    el("subCreateForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      showSubsError("");

      const student_id = el("subCreateStudentId")?.value?.trim();
      const lesson_type_id = el("subCreateLessonType")?.value?.trim();
      if (!student_id) {
        showSubsError("Оберіть учня з пошуку.");
        return;
      }
      if (!lesson_type_id) {
        showSubsError("Оберіть тип заняття.");
        return;
      }

      const tvRaw = el("subCreateTotalVisits")?.value.trim();
      const total_visits =
        tvRaw === "" ? null : Math.max(1, Number.parseInt(tvRaw, 10));
      if (tvRaw !== "" && !Number.isFinite(total_visits)) {
        showSubsError("Некоректна кількість візитів у пакеті.");
        return;
      }

      const amountRaw = el("subCreateAmount")?.value.trim();
      const amount_uah = amountRaw === "" ? null : Number(amountRaw);
      if (amountRaw !== "" && !Number.isFinite(amount_uah)) {
        showSubsError("Некоректна сума.");
        return;
      }

      const submitBtn = el("subCreateForm")?.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const json = await fetchJson("/api/admin/subscriptions", {
          method: "POST",
          body: JSON.stringify({
            student_id,
            lesson_type_id,
            total_visits,
            amount_uah,
            valid_until: el("subCreateValidUntil")?.value.trim() || null,
            purchased_at: el("subCreatePurchasedAt")?.value.trim() || null,
          }),
        });
        const newId = json.row?.id;
        closeAllModals();
        await refreshList();
        const ok = el("dashOk");
        if (ok) {
          ok.textContent = "Абонемент створено.";
          ok.classList.remove("admin-hide");
          setTimeout(() => ok.classList.add("admin-hide"), 2400);
        }
        if (newId) await openSubDetail(String(newId));
      } catch (err) {
        showSubsError(err?.message || String(err));
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });

    reloadBtn?.addEventListener("click", () => void refreshList({ resetPage: true }));
    searchEl?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void refreshList({ resetPage: true });
    });
    statusFilterEl?.addEventListener("change", () => void refreshList({ resetPage: true }));
    lessonTypeFilterEl?.addEventListener("change", () => void refreshList({ resetPage: true }));

    el("subEditSaveBtn")?.addEventListener("click", async () => {
      const id = el("subEditId")?.value;
      if (!id) return;
      showSubsError("");

      const tvRaw = el("subEditTotalVisits")?.value.trim();
      const total_visits = tvRaw === "" ? null : Math.max(0, Number.parseInt(tvRaw, 10));
      if (total_visits != null && !Number.isFinite(total_visits)) {
        showSubsError("Некоректна кількість візитів у пакеті.");
        return;
      }

      const usedRaw = el("subEditUsedVisits")?.value.trim();
      const uNum = usedRaw === "" ? 0 : Number.parseInt(usedRaw, 10);
      if (!Number.isFinite(uNum) || uNum < 0) {
        showSubsError("Некоректна кількість використаних візитів.");
        return;
      }

      const attendedNow = Number(
        cachedSubRows.find((r) => String(r.id) === String(id))?.visits_attended ?? 0,
      );
      const used_visits_override = uNum === attendedNow ? null : Math.max(0, uNum - attendedNow);

      const amountRaw = el("subEditAmount")?.value.trim();
      const amount_uah = amountRaw === "" ? null : Number(amountRaw);
      if (amountRaw !== "" && !Number.isFinite(amount_uah)) {
        showSubsError("Некоректна сума.");
        return;
      }

      const saveBtn = el("subEditSaveBtn");
      if (saveBtn) saveBtn.disabled = true;
      try {
        await fetchJson(`/api/admin/subscriptions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            total_visits,
            valid_until: el("subEditValidUntil")?.value.trim() || null,
            amount_uah,
            purchased_at: el("subEditPurchasedAt")?.value.trim() || null,
            status: el("subEditStatus")?.value,
            used_visits_override,
          }),
        });
        await refreshList();
        await openSubDetail(id);
        const ok = el("dashOk");
        if (ok) {
          ok.textContent = "Абонемент збережено.";
          ok.classList.remove("admin-hide");
          setTimeout(() => ok.classList.add("admin-hide"), 2400);
        }
      } catch (err) {
        showSubsError(err?.message || String(err));
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });

    el("subEditDeleteBtn")?.addEventListener("click", async () => {
      const id = el("subEditId")?.value;
      if (!id) return;
      if (!confirm("Видалити цей абонемент?")) return;
      showSubsError("");
      try {
        await fetchJson(`/api/admin/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
        closeAllModals();
        await refreshList();
        const ok = el("dashOk");
        if (ok) {
          ok.textContent = "Абонемент видалено.";
          ok.classList.remove("admin-hide");
          setTimeout(() => ok.classList.add("admin-hide"), 2400);
        }
      } catch (err) {
        showSubsError(err?.message || String(err));
      }
    });

    el("visitReassignSaveBtn")?.addEventListener("click", async () => {
      const visitId = el("visitReassignVisitId")?.value;
      if (!visitId) return;
      showSubsError("");
      const newSubId = el("visitReassignSubSelect")?.value || null;
      const saveBtn = el("visitReassignSaveBtn");
      if (saveBtn) saveBtn.disabled = true;
      try {
        await fetchJson(`/api/admin/visits/${encodeURIComponent(visitId)}`, {
          method: "PATCH",
          body: JSON.stringify({ subscription_id: newSubId }),
        });
        closeModal(reassignModal);
        await refreshList();
        if (currentSubId) {
          await openSubDetail(currentSubId);
          openModal(editModal);
        }
        const ok = el("dashOk");
        if (ok) {
          ok.textContent = "Візит перечіплено.";
          ok.classList.remove("admin-hide");
          setTimeout(() => ok.classList.add("admin-hide"), 2400);
        }
      } catch (err) {
        showSubsError(err?.message || String(err));
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  await loadLessonTypeFilter();
  await refreshList();
}
