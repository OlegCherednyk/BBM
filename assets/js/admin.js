import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

/** 0 = Sunday … 6 = Saturday (Date.getDay) */
const DAYS_UK = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];
const DAYS_SHORT_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function maybeEl(id) {
  return document.getElementById(id);
}

function syncCustomSelect(selectEl) {
  if (!selectEl) return;
  if (window.CustomSelects?.refreshSelect) {
    window.CustomSelects.refreshSelect(selectEl);
  }
}

/** @type {"login"|"lesson-types"|"prices"|"places"|"teachers"|"students"|"subscriptions"|"votes"|"lessons"|"stats"} */
const ADMIN_PAGE = /** @type {any} */ (document.body?.dataset.adminPage ?? "lesson-types");

const isLoginPage = ADMIN_PAGE === "login";

/** Cross-page admin nav (order matches product menu). */
const ADMIN_NAV_PAGES = [
  { id: "prices", href: "prices.html", label: "Ціни" },
  { id: "places", href: "places.html", label: "Місця" },
  { id: "teachers", href: "teachers.html", label: "Викладачі" },
  { id: "students", href: "students.html", label: "Учні" },
  { id: "subscriptions", href: "subscriptions.html", label: "Абонементи" },
  { id: "votes", href: "votes.html", label: "Голосування" },
  { id: "lessons", href: "lessons.html", label: "Заняття" },
  { id: "stats", href: "stats.html", label: "Статистика" },
];

function renderAdminNavLinks() {
  const jumps = maybeEl("adminNavJumps");
  if (!jumps) return;
  jumps.replaceChildren();
  for (const page of ADMIN_NAV_PAGES) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = page.href;
    a.textContent = page.label;
    if (page.id === ADMIN_PAGE) a.setAttribute("aria-current", "page");
    li.appendChild(a);
    jumps.appendChild(li);
  }
}

function fmtTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "";
  const part = timeStr.slice(0, 5);
  return part;
}

function lessonTypeShortLabel(lt) {
  const full = lt?.lesson_types?.name?.trim() || lt?.lesson_types?.slug?.trim() || "—";
  const short = full.split(/\s+/)[0];
  return short || full;
}

function makeAdminIconBtn(symbol, title, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = symbol;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.addEventListener("click", onClick);
  return btn;
}

function fmtMoney(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

function toDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDayIso(dateInput) {
  if (!dateInput) return null;
  const d = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function endOfDayIso(dateInput) {
  if (!dateInput) return null;
  const d = new Date(`${dateInput}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = await getSupabaseConfig();
if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    "Немає налаштувань Supabase з сервера. Додайте PUBLIC_SUPABASE_URL і PUBLIC_SUPABASE_ANON_KEY у .env і перезапустіть node server.js.";
  const errEl = maybeEl("authError");
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove("admin-hide");
  }
  throw new Error("supabase_public_config_missing");
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const authSection = maybeEl("authSection");
const blockedSection = maybeEl("blockedSection");
const dashSection = maybeEl("dashSection");
const authError = maybeEl("authError");
const authOk = maybeEl("authOk");
const dashError = maybeEl("dashError");
const dashOk = maybeEl("dashOk");
const allowlistSnippet = maybeEl("allowlistSnippet");

/** @type {{ id: string, slug: string, name: string, duration_minutes: number }[]} */
let cachedLessonTypes = [];

let editingPriceId = null;
let editingSmmPriceId = null;
let editingPlacePriceId = null;
let editingTeacherId = null;
/** @type {{ chat_id: string, username: string | null, first_name: string | null, last_name: string | null }[]} */
let cachedPrivateTelegramTargets = [];
let votesBatchVoteWired = false;
const LESSONS_PAGE_SIZE = 10;
let lessonsPage = 1;
/** @type {{ id: string, name: string }[]} */
let cachedPlaces = [];

async function loadPrivateTelegramTargets() {
  const { data, error } = await supabase
    .from("telegram_chat_targets")
    .select("chat_id, username, first_name, last_name")
    .eq("chat_type", "private");
  if (error) throw error;
  cachedPrivateTelegramTargets = (data || []).filter((row) => typeof row.chat_id === "string" && row.chat_id.trim().length > 0);
}

function populateTeacherChatSelect(selectedChatId = "", selectId = "teacherEditChatTarget") {
  const sel = maybeEl(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "— не вибрано —";
  sel.appendChild(defaultOpt);

  const rows = cachedPrivateTelegramTargets.filter((row) => row.username && row.username.trim());
  for (const row of rows) {
    const opt = document.createElement("option");
    opt.value = row.chat_id;
    opt.textContent = `@${row.username}`;
    sel.appendChild(opt);
  }
  if (selectedChatId && rows.some((row) => row.chat_id === selectedChatId)) {
    sel.value = selectedChatId;
  } else {
    sel.value = "";
  }
  syncCustomSelect(sel);
}

function teacherRiverBankScopeLabel(scope) {
  if (scope === "left") return "Лівий";
  if (scope === "right") return "Правий";
  return "Будь-який";
}

function setTeacherCreateFormOpen(isOpen) {
  const form = maybeEl("teacherCreateForm");
  const toggle = maybeEl("teacherFormToggle");
  if (!form) return;
  form.classList.toggle("admin-hide", !isOpen);
  if (toggle) {
    toggle.textContent = isOpen ? "Закрити форму" : "+ Новий викладач";
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function resetTeacherCreateForm() {
  const nameInput = maybeEl("teacherCreateName");
  if (nameInput) nameInput.value = "";
  setTeacherCreateFormOpen(false);
}

function closeTeacherEditModal() {
  const modal = maybeEl("teacherEditModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-modal-open");
  editingTeacherId = null;
}

async function openTeacherEditModal(teacher) {
  const modal = maybeEl("teacherEditModal");
  const titleEl = maybeEl("teacherEditModalTitle");
  const idInput = maybeEl("teacherEditId");
  const nameInput = maybeEl("teacherEditName");
  const descInput = maybeEl("teacherEditDescription");
  const bankSel = maybeEl("teacherEditRiverBankScope");
  const digestChk = maybeEl("teacherEditDigestEnabled");
  const smmChk = maybeEl("teacherEditIsSmm");
  if (!modal || !idInput || !nameInput || !descInput) return;

  try {
    await loadPrivateTelegramTargets();
  } catch (error) {
    showDashError(error?.message || String(error));
    return;
  }

  editingTeacherId = teacher.id;
  idInput.value = teacher.id;
  if (titleEl) titleEl.textContent = teacher.name || "Викладач";
  nameInput.value = teacher.name || "";
  descInput.value = teacher.short_description || "";
  populateTeacherChatSelect(teacher.chat_id || "", "teacherEditChatTarget");
  if (bankSel) bankSel.value = teacher.river_bank_scope || "any";
  if (digestChk) digestChk.checked = Boolean(teacher.digest_enabled);
  if (smmChk) smmChk.checked = Boolean(teacher.is_smm);
  syncCustomSelect(maybeEl("teacherEditChatTarget"));
  syncCustomSelect(bankSel);

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  nameInput.focus();
}

function initTeacherEditModal() {
  const modal = maybeEl("teacherEditModal");
  const form = maybeEl("teacherEditForm");
  if (!modal) return;

  modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => closeTeacherEditModal());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("admin-hide")) return;
    closeTeacherEditModal();
  });

  if (!form) return;
  form.noValidate = true;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();

    const id = maybeEl("teacherEditId")?.value ?? "";
    const name = maybeEl("teacherEditName")?.value.trim() ?? "";
    const short_description = maybeEl("teacherEditDescription")?.value.trim() ?? "";
    if (!id) {
      showDashError("Не знайдено викладача для збереження.");
      return;
    }
    if (!name) {
      showDashError("Вкажи ім'я викладача.");
      return;
    }

    const selectedChatId = maybeEl("teacherEditChatTarget")?.value?.trim() ?? "";
    const validSelectedChatId =
      selectedChatId && cachedPrivateTelegramTargets.some((row) => row.chat_id === selectedChatId && row.username?.trim())
        ? selectedChatId
        : null;
    const river_bank_scope = maybeEl("teacherEditRiverBankScope")?.value || "any";
    const digest_enabled = Boolean(maybeEl("teacherEditDigestEnabled")?.checked);
    const is_smm = Boolean(maybeEl("teacherEditIsSmm")?.checked);

    if (is_smm) {
      const { error: clearErr } = await supabase.from("teachers").update({ is_smm: false }).neq("id", id);
      if (clearErr) {
        showDashError(clearErr.message);
        return;
      }
    }

    const { error: dbError } = await supabase
      .from("teachers")
      .update({
        name,
        short_description: short_description || null,
        chat_id: validSelectedChatId,
        river_bank_scope,
        digest_enabled,
        is_smm,
      })
      .eq("id", id);

    if (dbError) {
      showDashError(dbError.message);
      return;
    }

    closeTeacherEditModal();
    await renderTeachersPanel();
    showDashOk("Викладача оновлено.");
  });
}

async function renderTeachersPanel() {
  const root = maybeEl("teachersList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  const { data: teachers, error } = await supabase
    .from("teachers")
    .select("id, name, short_description, sort_order, chat_id, river_bank_scope, digest_enabled, is_smm")
    .order("sort_order", { ascending: true });
  if (error) {
    root.innerHTML = `<p class="admin-muted">${error.message}</p>`;
    return;
  }
  const { data: tgTargets, error: tgError } = await supabase.from("telegram_chat_targets").select("chat_id, username");
  if (tgError) {
    root.innerHTML = `<p class="admin-muted">${tgError.message}</p>`;
    return;
  }
  const tgByChatId = new Map((tgTargets || []).map((row) => [String(row.chat_id), row.username || null]));
  if (!teachers?.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає викладачів.</p>';
    return;
  }

  const tbl = document.createElement("table");
  tbl.className = "admin-prices-table";
  tbl.innerHTML = `<thead><tr><th>Ім'я</th><th>Telegram</th><th>Берег</th><th>Дайджest</th><th>SMM</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const teacher of teachers) {
    const tr = document.createElement("tr");
    const tgUsername = teacher.chat_id ? tgByChatId.get(String(teacher.chat_id)) : null;
    const tgLabel = tgUsername ? `@${tgUsername}` : "—";
    const bankLabel = teacherRiverBankScopeLabel(teacher.river_bank_scope || "any");
    const digestLabel = teacher.digest_enabled ? "✓" : "—";
    const smmLabel = teacher.is_smm ? "✓" : "—";
    tr.innerHTML = `<td>${escapeHtml(teacher.name || "—")}</td><td>${escapeHtml(tgLabel)}</td><td>${escapeHtml(bankLabel)}</td><td>${digestLabel}</td><td>${smmLabel}</td>`;
    const td = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost btn--sm admin-teacher-row-edit";
    editBtn.style.padding = "6px 10px";
    editBtn.textContent = "Змінити";
    editBtn.addEventListener("click", () => openTeacherEditModal(teacher));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--danger btn--sm";
    delBtn.style.padding = "6px 10px";
    delBtn.style.marginLeft = "6px";
    delBtn.textContent = "✕";
    delBtn.title = "Видалити";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Видалити цього викладача?")) return;
      clearDashMessages();
      const { error: delErr } = await supabase.from("teachers").delete().eq("id", teacher.id);
      if (delErr) {
        showDashError(delErr.message);
        return;
      }
      if (editingTeacherId === teacher.id) closeTeacherEditModal();
      await renderTeachersPanel();
      showDashOk("Викладача видалено.");
    });

    td.append(editBtn, delBtn);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "prices-table-wrap";
  wrap.appendChild(tbl);
  root.innerHTML = "";
  root.appendChild(wrap);
}

const KYIV_DATE_FMT = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtKyivDateTime(isoLike) {
  if (!isoLike) return "—";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "—";
  return KYIV_DATE_FMT.format(d).replace(",", " ·");
}

/**
 * Split a Kyiv datetime into display parts for card layouts.
 * @param {string | null | undefined} isoLike
 * @returns {{ dow: string, date: string, time: string }}
 */
function fmtKyivDateParts(isoLike) {
  if (!isoLike) return { dow: "—", date: "", time: "" };
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return { dow: "—", date: "", time: "" };
  const parts = KYIV_DATE_FMT.formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value || "";
  const dow = pick("weekday");
  const date = `${pick("day")}.${pick("month")}.${pick("year")}`;
  const time = `${pick("hour")}:${pick("minute")}`;
  return { dow, date, time };
}

/** @type {object | null} */
let editingLessonRow = null;
/** @type {(() => void) | null} */
let onLessonEditSaved = null;
let lessonEditModalWired = false;

async function fetchAdminJson(path, opts = {}) {
  const res = await fetch(path, {
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

function studentDisplayName(visit) {
  const st = visit?.students;
  return formatStudentLine(st?.display_name, st?.telegram_username);
}

/** @param {string | null | undefined} displayName @param {string | null | undefined} telegramUsername */
function formatStudentLine(displayName, telegramUsername) {
  const name = (displayName && String(displayName).trim()) || "—";
  const un = telegramUsername && String(telegramUsername).trim().replace(/^@/, "");
  return un ? `${name} · @${un}` : name;
}

/** @param {{ display_name?: string | null, telegram_username?: string | null }} student */
function studentOptionLabel(student) {
  return formatStudentLine(student.display_name, student.telegram_username);
}

function populateLessonTeacherSelect(selectEl, teachers, selectedId) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "— не вибрано —";
  selectEl.appendChild(noneOpt);

  for (const t of teachers || []) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name?.trim() || "—";
    selectEl.appendChild(opt);
  }
  selectEl.value = selectedId || "";
  syncCustomSelect(selectEl);
}

function mountLessonVisitsList(container, visits, onRemove, lessonTypeSlug) {
  container.innerHTML = "";
  if (!visits.length) {
    container.innerHTML = `<p class="admin-muted" style="margin:0">Немає відвідувачів.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const visit of visits) {
    const isAbon = String(visit.vote_choice || "") === "abon";
    const item = document.createElement("div");
    item.className = "admin-visit-journal__item";

    const kind = document.createElement("span");
    kind.className = `admin-visit-journal__kind admin-visit-journal__kind--${isAbon ? "abon" : "single"}`;
    kind.textContent = isAbon ? "Абон" : "Раз";

    const subSlug = visit.subscriptions?.lesson_types?.slug || null;
    const subName = visit.subscriptions?.lesson_types?.name || null;
    const isCrossType = isAbon && subSlug && lessonTypeSlug && subSlug !== lessonTypeSlug;
    if (isCrossType) {
      kind.title = `Абонемент: ${subName || subSlug}`;
      kind.classList.add("admin-visit-journal__kind--cross");
    } else {
      kind.title = isAbon ? "Абонемент" : "Разове";
    }

    const main = document.createElement("div");
    main.className = "admin-visit-journal__main";
    const label = document.createElement("div");
    label.className = "admin-visit-journal__label";
    label.textContent = studentDisplayName(visit);
    if (isCrossType) {
      const badge = document.createElement("span");
      badge.className = "admin-visit-journal__cross-badge";
      badge.textContent = subName || subSlug;
      badge.title = `Списано з абонементу «${subName || subSlug}»`;
      label.appendChild(badge);
    }
    main.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--danger btn--sm admin-visit-journal__remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Видалити зі списку";
    removeBtn.addEventListener("click", () => onRemove(visit));

    item.append(kind, main, removeBtn);
    frag.appendChild(item);
  }
  container.appendChild(frag);
}

function resetLessonSubSelect() {
  const subRow = maybeEl("lessonAddStudentSubRow");
  const subSel = maybeEl("lessonAddStudentSubSelect");
  if (subRow) subRow.classList.add("admin-hide");
  if (subSel) {
    subSel.innerHTML = '<option value="">Автоматично</option>';
    subSel.value = "";
  }
}

async function refreshLessonSubSelect() {
  const studentSel = maybeEl("lessonAddStudentSelect");
  const isSingleEl = maybeEl("lessonAddStudentIsSingle");
  const subRow = maybeEl("lessonAddStudentSubRow");
  const subSel = maybeEl("lessonAddStudentSubSelect");
  if (!subRow || !subSel) return;

  const studentId = studentSel?.value?.trim() || "";
  const isSingle = isSingleEl?.checked ?? false;

  if (!studentId || isSingle) {
    subRow.classList.add("admin-hide");
    subSel.innerHTML = '<option value="">Автоматично</option>';
    subSel.value = "";
    return;
  }

  subRow.classList.add("admin-hide");
  subSel.innerHTML = '<option value="">Завантаження…</option>';

  try {
    const data = await fetchAdminJson(`/api/admin/students/${encodeURIComponent(studentId)}/active-subscriptions`);
    const subs = data.rows || [];
    subSel.innerHTML = '<option value="">Автоматично</option>';
    for (const sub of subs) {
      const opt = document.createElement("option");
      opt.value = sub.id;
      const name = sub.lesson_types?.name || sub.lesson_type_id || "—";
      const rem = sub.visits_remaining != null ? ` (залишилось ${sub.visits_remaining})` : "";
      opt.textContent = `${name}${rem}`;
      subSel.appendChild(opt);
    }
    subSel.value = "";
    subRow.classList.remove("admin-hide");
    syncCustomSelect(subSel);
  } catch {
    subSel.innerHTML = '<option value="">Автоматично</option>';
    subSel.value = "";
    subRow.classList.remove("admin-hide");
  }
}

function populateLessonAddStudentSelect(selectEl, allStudents, attendedStudentIds) {
  if (!selectEl) return;
  const attended = new Set(attendedStudentIds);
  selectEl.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "— оберіть учня —";
  selectEl.appendChild(defaultOpt);

  const available = (allStudents || [])
    .filter((s) => s?.id && !attended.has(String(s.id)))
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || ""), "uk"));

  for (const s of available) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = studentOptionLabel(s);
    selectEl.appendChild(opt);
  }
  syncCustomSelect(selectEl);
}

function closeLessonEditModal() {
  const modal = maybeEl("lessonEditModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-modal-open");
  editingLessonRow = null;
  onLessonEditSaved = null;
}

function ensureLessonEditModalWired() {
  if (lessonEditModalWired) return;
  const modal = maybeEl("lessonEditModal");
  const form = maybeEl("lessonEditForm");
  if (!modal) return;
  lessonEditModalWired = true;

  modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => closeLessonEditModal());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("admin-hide")) return;
    closeLessonEditModal();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveLessonEdit();
  });

  const studentSel = maybeEl("lessonAddStudentSelect");
  const isSingleEl = maybeEl("lessonAddStudentIsSingle");
  studentSel?.addEventListener("change", () => refreshLessonSubSelect());
  isSingleEl?.addEventListener("change", () => refreshLessonSubSelect());
}

const lessonEditSelectFields = `id, starts_at, abon_count, single_visitors_count, skip_visitors_count,
  conducting_display_name, vote_finalized_at, lesson_vote_occurrence_id,
  teachers ( id, name ),
  places ( id, name, address ),
  lesson_times ( id, start_time, day_of_week, lesson_types ( id, name, slug ) )`;

async function saveLessonEdit() {
  if (!editingLessonRow?.lesson_vote_occurrence_id) return;

  const teacherSel = maybeEl("lessonEditTeacherSelect");
  const selectEl = maybeEl("lessonAddStudentSelect");
  const isSingleEl = maybeEl("lessonAddStudentIsSingle");
  const submitBtn = maybeEl("lessonSaveBtn");

  clearDashMessages();
  if (submitBtn) submitBtn.disabled = true;

  try {
    const teacherId = teacherSel?.value?.trim() || null;
    const { data: updated, error: updErr } = await supabase
      .from("lessons")
      .update({ teacher_id: teacherId })
      .eq("id", editingLessonRow.id)
      .select(lessonEditSelectFields)
      .single();
    if (updErr) throw new Error(updErr.message);
    Object.assign(editingLessonRow, updated);

    const studentId = selectEl?.value?.trim() || "";
    if (studentId) {
      const voteChoice = isSingleEl?.checked ? "single" : "abon";
      const subOverrideEl = maybeEl("lessonAddStudentSubSelect");
      const subscriptionId = voteChoice === "abon" ? (subOverrideEl?.value?.trim() || null) : null;
      const body = await fetchAdminJson(
        `/api/admin/lessons/${encodeURIComponent(editingLessonRow.lesson_vote_occurrence_id)}/visits`,
        {
          method: "POST",
          body: JSON.stringify({ student_id: studentId, vote_choice: voteChoice, subscription_id: subscriptionId }),
        },
      );
      if (body.counts) {
        editingLessonRow.abon_count = body.counts.abon_count;
        editingLessonRow.single_visitors_count = body.counts.single_visitors_count;
      }
    }

    onLessonEditSaved?.();
    closeLessonEditModal();
    showDashOk("Заняття збережено.");
  } catch (err) {
    showDashError(err?.message || String(err));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** @type {{ id: string, display_name: string | null, telegram_username?: string | null }[]} */
let cachedAllStudents = [];
/** @type {{ id: string, name: string | null }[]} */
let cachedAllTeachers = [];

async function removeLessonVisit(visit) {
  if (!visit?.id || !editingLessonRow) return;
  const name = studentDisplayName(visit);
  if (!confirm(`Видалити «${name}» зі списку відвідувачів?`)) return;

  clearDashMessages();
  try {
    const body = await fetchAdminJson(`/api/admin/visits/${encodeURIComponent(visit.id)}/remove`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (body.counts && editingLessonRow) {
      editingLessonRow.abon_count = body.counts.abon_count;
      editingLessonRow.single_visitors_count = body.counts.single_visitors_count;
    }

    const visitsList = maybeEl("lessonEditVisitsList");
    const selectEl = maybeEl("lessonAddStudentSelect");
    const visitsRes = await fetchAdminJson(
      `/api/admin/lessons/${encodeURIComponent(editingLessonRow.lesson_vote_occurrence_id)}/visits`,
    );
    const visits = visitsRes.rows || [];

    const lessonTypeSlug = editingLessonRow?.lesson_times?.lesson_types?.slug || null;
    mountLessonVisitsList(visitsList, visits, (v) => removeLessonVisit(v), lessonTypeSlug);
    populateLessonAddStudentSelect(
      selectEl,
      cachedAllStudents,
      visits.map((v) => v.student_id),
    );
    onLessonEditSaved?.();
    showDashOk("Учня видалено зі списку.");
  } catch (err) {
    showDashError(err?.message || String(err));
  }
}

async function openLessonEditModal(row, onSaved) {
  ensureLessonEditModalWired();
  const modal = maybeEl("lessonEditModal");
  const titleEl = maybeEl("lessonEditModalTitle");
  const subEl = maybeEl("lessonEditModalSub");
  const visitsList = maybeEl("lessonEditVisitsList");
  const teacherSel = maybeEl("lessonEditTeacherSelect");
  const selectEl = maybeEl("lessonAddStudentSelect");
  const isSingleEl = maybeEl("lessonAddStudentIsSingle");
  const form = maybeEl("lessonEditForm");

  if (!modal || !row) return;

  const occurrenceId = String(row.lesson_vote_occurrence_id || "").trim();
  if (!occurrenceId) {
    showDashError("Для цього заняття немає прив'язки до голосування — редагування недоступне.");
    return;
  }

  editingLessonRow = row;
  onLessonEditSaved = onSaved;

  if (titleEl) titleEl.textContent = "Редагування заняття";
  if (subEl) {
    subEl.textContent = [fmtKyivDateTime(row.starts_at), lessonPlaceLabel(row), lessonTypeLabel(row)]
      .filter(Boolean)
      .join(" · ");
  }

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");

  if (visitsList) visitsList.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  if (form) form.classList.add("admin-hide");
  if (teacherSel) teacherSel.disabled = true;

  resetLessonSubSelect();

  try {
    const [visitsRes, studentsRes, teachersRes] = await Promise.all([
      fetchAdminJson(`/api/admin/lessons/${encodeURIComponent(occurrenceId)}/visits`),
      fetchAdminJson("/api/admin/students"),
      supabase.from("teachers").select("id, name").order("sort_order", { ascending: true }),
    ]);

    if (teachersRes.error) throw new Error(teachersRes.error.message);

    cachedAllStudents = studentsRes.rows || [];
    cachedAllTeachers = teachersRes.data || [];
    const visits = visitsRes.rows || [];
    const lessonTypeSlug = row.lesson_times?.lesson_types?.slug || null;

    populateLessonTeacherSelect(teacherSel, cachedAllTeachers, row.teachers?.id || "");
    if (teacherSel) teacherSel.disabled = false;

    mountLessonVisitsList(visitsList, visits, (visit) => removeLessonVisit(visit), lessonTypeSlug);
    populateLessonAddStudentSelect(
      selectEl,
      cachedAllStudents,
      visits.map((v) => v.student_id),
    );
    if (selectEl) selectEl.value = "";
    if (isSingleEl) isSingleEl.checked = false;
    form?.classList.remove("admin-hide");
  } catch (err) {
    if (teacherSel) teacherSel.disabled = false;
    if (visitsList) {
      visitsList.innerHTML = `<p class="admin-muted">${escapeHtml(err?.message || String(err))}</p>`;
    }
    showDashError(err?.message || String(err));
  }

  modal.querySelector(".admin-modal__close")?.focus();
}

function lessonTeacherLabel(row) {
  return (
    row.teachers?.name?.trim() ||
    row.conducting_display_name?.trim() ||
    "—"
  );
}

function lessonPlaceLabel(row) {
  return row.places?.name?.trim() || "—";
}

function lessonTypeLabel(row) {
  return (
    row.lesson_times?.lesson_types?.name?.trim() ||
    row.lesson_times?.lesson_types?.slug ||
    "—"
  );
}

let lessonFinanceModalWired = false;

function closeLessonFinanceModal() {
  const modal = maybeEl("lessonFinanceModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  if (!maybeEl("lessonEditModal") || maybeEl("lessonEditModal")?.classList.contains("admin-hide")) {
    document.body.classList.remove("admin-modal-open");
  }
}

function ensureLessonFinanceModalWired() {
  if (lessonFinanceModalWired) return;
  const modal = maybeEl("lessonFinanceModal");
  if (!modal) return;
  lessonFinanceModalWired = true;

  modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => closeLessonFinanceModal());
  });
}

function mountLessonFinanceSummary(container, summary) {
  if (!container) return;
  container.innerHTML = `
    <div class="admin-lesson-finance__stat admin-lesson-finance__stat--accent">
      <div class="admin-lesson-finance__stat-label">Виручка</div>
      <div class="admin-lesson-finance__stat-value">${escapeHtml(fmtMoney(summary.totalRevenue))}</div>
    </div>
    <div class="admin-lesson-finance__stat">
      <div class="admin-lesson-finance__stat-label">Абон</div>
      <div class="admin-lesson-finance__stat-value">${escapeHtml(fmtMoney(summary.abonRevenue))}</div>
    </div>
    <div class="admin-lesson-finance__stat">
      <div class="admin-lesson-finance__stat-label">Разове</div>
      <div class="admin-lesson-finance__stat-value">${escapeHtml(fmtMoney(summary.singleRevenue))}</div>
    </div>
  `;
}

/** @param {HTMLElement | null} container @param {any[]} students */
function mountLessonFinanceStudents(container, students) {
  if (!container) return;
  container.innerHTML = "";
  if (!students.length) {
    container.innerHTML = `<p class="admin-lesson-finance__empty">Немає відвідувачів для розрахунку оплати.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of students) {
    const isAbon = row.visitKind === "abon";
    const item = document.createElement("div");
    item.className = "admin-lesson-finance__student";

    const kind = document.createElement("span");
    kind.className = `admin-visit-journal__kind admin-visit-journal__kind--${isAbon ? "abon" : "single"}`;
    kind.textContent = isAbon ? "А" : "Р";

    const nameEl = document.createElement("div");
    nameEl.className = "admin-lesson-finance__student-name";
    nameEl.textContent = formatStudentLine(row.name, row.telegramUsername);
    nameEl.title = formatStudentLine(row.name, row.telegramUsername);

    const amount = document.createElement("div");
    amount.className = "admin-lesson-finance__student-amount";
    amount.textContent = fmtMoney(row.amountUah);

    item.append(kind, nameEl, amount);
    frag.appendChild(item);
  }
  container.appendChild(frag);
}

function mountLessonFinanceFooter(container, summary) {
  if (!container) return;
  const negative = Number(summary.netProfit) < 0;
  const noSmm = Boolean(summary.isSmmTeacher);
  const smmLine = noSmm
    ? ""
    : `<div class="admin-lesson-finance__footer-item">
      <span class="admin-lesson-finance__footer-label">SMM</span>
      <span class="admin-lesson-finance__footer-value">− ${escapeHtml(fmtMoney(summary.smm))}</span>
    </div>`;
  container.classList.toggle("admin-lesson-finance__footer--no-smm", noSmm);
  container.innerHTML = `
    ${smmLine}
    <div class="admin-lesson-finance__footer-item${noSmm ? " admin-lesson-finance__footer-item--grow" : ""}">
      <span class="admin-lesson-finance__footer-label">Оренда</span>
      <span class="admin-lesson-finance__footer-value">− ${escapeHtml(fmtMoney(summary.rent))}</span>
    </div>
    <div class="admin-lesson-finance__footer-net">
      <span class="admin-lesson-finance__footer-net-label">Чистий</span>
      <span class="admin-lesson-finance__footer-net-value${negative ? " admin-lesson-finance__footer-net-value--negative" : ""}">${escapeHtml(fmtMoney(summary.netProfit))}</span>
    </div>
  `;
}

async function openLessonFinanceModal(row) {
  ensureLessonFinanceModalWired();
  const modal = maybeEl("lessonFinanceModal");
  const subEl = maybeEl("lessonFinanceModalSub");
  const summaryEl = maybeEl("lessonFinanceSummary");
  const studentsEl = maybeEl("lessonFinanceStudents");
  const footerEl = maybeEl("lessonFinanceFooter");
  const peopleEl = maybeEl("lessonFinancePeopleCount");

  if (!modal || !row?.id) return;

  if (subEl) {
    subEl.textContent = [
      fmtKyivDateTime(row.starts_at),
      lessonTeacherLabel(row),
      lessonPlaceLabel(row),
      lessonTypeLabel(row),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");

  if (summaryEl) summaryEl.innerHTML = '<p class="admin-lesson-finance__empty">Завантаження…</p>';
  if (studentsEl) studentsEl.innerHTML = "";
  if (footerEl) footerEl.innerHTML = "";
  if (peopleEl) peopleEl.textContent = "";

  try {
    const data = await fetchAdminJson(`/api/admin/lessons/${encodeURIComponent(row.id)}/finance`);
    const summary = data.summary || {};
    const students = data.students || [];
    const peopleCount = data.lesson?.peopleCount ?? students.length;

    mountLessonFinanceSummary(summaryEl, summary);
    mountLessonFinanceStudents(studentsEl, students);
    mountLessonFinanceFooter(footerEl, summary);
    if (peopleEl) {
      peopleEl.textContent =
        peopleCount === 1 ? "1 уч." : `${peopleCount} уч.`;
    }
  } catch (err) {
    if (summaryEl) {
      summaryEl.innerHTML = `<p class="admin-lesson-finance__empty">${escapeHtml(err?.message || String(err))}</p>`;
    }
    showDashError(err?.message || String(err));
  }

  modal.querySelector(".admin-modal__close")?.focus();
}

/**
 * Build a fully styled lesson card body (date, meta, stats, actions).
 * @param {Object} opts
 * @param {{dow:string,date:string,time:string}} opts.when
 * @param {string} opts.teacher
 * @param {string} opts.place
 * @param {string} opts.type
 * @param {number} opts.abon
 * @param {number} opts.single
 * @param {number} opts.skip
 * @param {Array<{label:string,title:string,className:string,onClick:()=>void}>} opts.actions
 */
function buildLessonCard({ when, teacher, place, type, abon, single, skip, actions }) {
  const card = document.createElement("article");
  card.className = "lesson-card";

  const head = document.createElement("div");
  head.className = "lesson-card__head";

  const whenEl = document.createElement("div");
  whenEl.className = "lesson-card__when";
  const dowEl = document.createElement("span");
  dowEl.className = "lesson-card__dow";
  dowEl.textContent = when.dow || "—";
  const dtEl = document.createElement("span");
  dtEl.className = "lesson-card__datetime";
  dtEl.innerHTML = `<span class="lesson-card__date"></span><span class="lesson-card__time"></span>`;
  dtEl.querySelector(".lesson-card__date").textContent = when.date || "";
  dtEl.querySelector(".lesson-card__time").textContent = when.time || "";
  whenEl.append(dowEl, dtEl);

  const typeEl = document.createElement("span");
  typeEl.className = "lesson-card__type";
  typeEl.textContent = type || "—";

  head.append(whenEl, typeEl);

  const meta = document.createElement("div");
  meta.className = "lesson-card__meta";
  const teacherEl = document.createElement("span");
  teacherEl.className = "lesson-card__meta-item lesson-card__meta-item--teacher";
  teacherEl.textContent = teacher || "—";
  teacherEl.title = teacher || "";
  const placeEl = document.createElement("span");
  placeEl.className = "lesson-card__meta-item lesson-card__meta-item--place";
  placeEl.textContent = place || "—";
  placeEl.title = place || "";
  meta.append(teacherEl, placeEl);

  const stats = document.createElement("div");
  stats.className = "lesson-card__stats";
  const statDefs = [
    { mod: "abon", value: abon, label: "Абон" },
    { mod: "single", value: single, label: "Разове" },
    { mod: "skip", value: skip, label: "Пропуск" },
  ];
  for (const s of statDefs) {
    const stat = document.createElement("div");
    stat.className = `lesson-card__stat lesson-card__stat--${s.mod}`;
    const v = document.createElement("b");
    v.className = "lesson-card__stat-value";
    v.textContent = String(Number.isFinite(s.value) ? s.value : 0);
    const l = document.createElement("span");
    l.className = "lesson-card__stat-label";
    l.textContent = s.label;
    stat.append(v, l);
    stats.appendChild(stat);
  }

  const actionsEl = document.createElement("div");
  actionsEl.className = "lesson-card__actions";
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = a.className;
    btn.textContent = a.label;
    if (a.title) btn.title = a.title;
    btn.addEventListener("click", a.onClick);
    actionsEl.appendChild(btn);
  }

  card.append(head, meta, stats, actionsEl);
  return card;
}

function renderLessonCardView(container, row, onEdit, onDelete) {
  container.innerHTML = "";
  const card = buildLessonCard({
    when: fmtKyivDateParts(row.starts_at),
    teacher: lessonTeacherLabel(row),
    place: lessonPlaceLabel(row),
    type: lessonTypeLabel(row),
    abon: row.abon_count,
    single: row.single_visitors_count,
    skip: row.skip_visitors_count,
    actions: [
      {
        label: "$",
        title: "Фінанси заняття",
        className: "btn btn--ghost btn--sm lesson-card__btn lesson-card__btn--finance",
        onClick: () => openLessonFinanceModal(row),
      },
      {
        label: "Змінити",
        title: "Редагувати заняття",
        className: "btn btn--ghost btn--sm lesson-card__btn",
        onClick: () => onEdit(),
      },
      {
        label: "✕",
        title: "Видалити",
        className: "btn btn--danger btn--sm lesson-card__btn lesson-card__btn--del",
        onClick: () => onDelete(),
      },
    ],
  });
  container.appendChild(card);
}

async function renderLessonsPanel() {
  const root = maybeEl("lessonsList");
  const paginationRoot = maybeEl("lessonsPagination");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  if (paginationRoot) paginationRoot.innerHTML = "";

  const lessonsRes = await supabase
    .from("lessons")
    .select(
      `id, starts_at, abon_count, single_visitors_count, skip_visitors_count,
       conducting_display_name, vote_finalized_at, lesson_vote_occurrence_id,
       teachers ( id, name ),
       places ( id, name, address ),
       lesson_times ( id, start_time, day_of_week, lesson_types ( id, name, slug ) )`,
    )
    .order("starts_at", { ascending: false, nullsFirst: false });

  if (lessonsRes.error) {
    root.innerHTML = `<p class="admin-muted">${escapeHtml(lessonsRes.error.message)}</p>`;
    return;
  }

  const lessons = lessonsRes.data || [];
  const totalPages = Math.max(1, Math.ceil(lessons.length / LESSONS_PAGE_SIZE));
  lessonsPage = Math.min(Math.max(1, lessonsPage), totalPages);

  root.innerHTML = "";
  if (!lessons.length) {
    root.innerHTML = '<p class="admin-muted">Поки немає закритих голосувань.</p>';
  } else {
    const pageStart = (lessonsPage - 1) * LESSONS_PAGE_SIZE;
    const pageRows = lessons.slice(pageStart, pageStart + LESSONS_PAGE_SIZE);
    const grid = document.createElement("div");
    grid.className = "lesson-cards";

    for (const row of pageRows) {
      const cardSlot = document.createElement("div");
      cardSlot.className = "lesson-card-slot";

      const enterView = () => {
        renderLessonCardView(
          cardSlot,
          row,
          () => enterEdit(),
          async () => {
            if (!confirm("Видалити цей запис заняття?")) return;
            clearDashMessages();
            try {
              const res = await fetch("/api/admin/lessons/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lesson_id: row.id }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || !body.ok) {
                showDashError(body.error || `Помилка ${res.status}`);
                return;
              }
            } catch (err) {
              showDashError(err?.message || String(err));
              return;
            }
            await renderLessonsPanel();
            showDashOk("Запис заняття видалено.");
          },
        );
      };

      const enterEdit = () => {
        openLessonEditModal(row, () => enterView());
      };

      enterView();
      grid.appendChild(cardSlot);
    }

    root.appendChild(grid);
  }

  if (paginationRoot) {
    paginationRoot.innerHTML = "";
    if (lessons.length > LESSONS_PAGE_SIZE) {
      const pagination = document.createElement("div");
      pagination.className = "admin-lessons__pagination";

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "btn btn--ghost btn--sm";
      prevBtn.textContent = "← Попередні";
      prevBtn.disabled = lessonsPage <= 1;
      prevBtn.addEventListener("click", async () => {
        if (lessonsPage <= 1) return;
        lessonsPage -= 1;
        await renderLessonsPanel();
      });

      const info = document.createElement("span");
      info.className = "admin-muted";
      info.textContent = `Сторінка ${lessonsPage} з ${totalPages} · записів: ${lessons.length}`;

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "btn btn--ghost btn--sm";
      nextBtn.textContent = "Наступні →";
      nextBtn.disabled = lessonsPage >= totalPages;
      nextBtn.addEventListener("click", async () => {
        if (lessonsPage >= totalPages) return;
        lessonsPage += 1;
        await renderLessonsPanel();
      });

      pagination.append(prevBtn, info, nextBtn);
      paginationRoot.appendChild(pagination);
    }
  }
}

function voteCountFromSnapshot(snapshot, key) {
  const group = snapshot && typeof snapshot === "object" ? snapshot[key] : null;
  if (!group || typeof group !== "object") return 0;
  return Object.keys(group).length;
}

async function fetchOpenLessonVotes() {
  const res = await fetch("/api/admin/lesson-votes/open");
  if (!res.ok) {
    return { ok: false, error: `Помилка ${res.status}`, rows: [] };
  }
  const body = await res.json().catch(() => ({}));
  if (!body?.ok || !Array.isArray(body.rows)) {
    return { ok: false, error: body?.error || `Помилка ${res.status}`, rows: [] };
  }
  return { ok: true, error: "", rows: body.rows };
}

async function renderOpenLessonVotesList(openVotesRoot, openVotes, refresh) {
  if (!openVotesRoot) return;
  openVotesRoot.innerHTML = "";
  if (!openVotes.length) {
    openVotesRoot.innerHTML = '<p class="admin-muted">Немає відкритих голосувань.</p>';
    return;
  }

  const grid = document.createElement("div");
  grid.className = "lesson-cards";

  for (const vote of openVotes) {
    const snap = vote.lesson_snapshot && typeof vote.lesson_snapshot === "object" ? vote.lesson_snapshot : {};
    const card = buildLessonCard({
      when: fmtKyivDateParts(vote.occurrence_at),
      teacher: vote.conducting_display_name?.trim() || "—",
      place: snap.placeLabel || "—",
      type: snap.lessonTypeLabel || "—",
      abon: voteCountFromSnapshot(vote.votes_snapshot, "abon"),
      single: voteCountFromSnapshot(vote.votes_snapshot, "single"),
      skip: voteCountFromSnapshot(vote.votes_snapshot, "skip"),
      actions: [
        {
          label: "Закрити",
          title: "Закрити голосування",
          className: "btn btn--danger btn--sm lesson-card__btn lesson-card__btn--close",
          onClick: async (ev) => {
            const closeBtn = ev.currentTarget;
            if (!confirm("Закрити це голосування?")) return;
            closeBtn.disabled = true;
            clearDashMessages();
            try {
              const res = await fetch("/api/telegram/lesson-votes/close", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ occurrence_id: vote.id }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || !body.ok) {
                showDashError(body.error || `Помилка ${res.status}`);
                closeBtn.disabled = false;
                return;
              }
              showDashOk("Голосування закрито.");
              await refresh();
            } catch (err) {
              showDashError(err?.message || String(err));
              closeBtn.disabled = false;
            }
          },
        },
      ],
    });
    card.classList.add("lesson-card--open");
    grid.appendChild(card);
  }

  openVotesRoot.appendChild(grid);
}

async function renderVotesPanel() {
  const openVotesRoot = maybeEl("openLessonVotesList");
  if (!openVotesRoot) return;
  ensureVotesBatchVoteWired();
  openVotesRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const result = await fetchOpenLessonVotes();
  if (!result.ok) {
    openVotesRoot.innerHTML = `<p class="admin-muted">${escapeHtml(result.error)}</p>`;
    return;
  }

  await renderOpenLessonVotesList(openVotesRoot, result.rows, renderVotesPanel);
}

function ensureVotesBatchVoteWired() {
  if (votesBatchVoteWired) return;
  const btn = maybeEl("votesBatchVoteBtn");
  if (!btn) return;
  votesBatchVoteWired = true;

  btn.addEventListener("click", async () => {
    clearDashMessages();
    btn.disabled = true;
    try {
      const res = await fetch("/api/telegram/teachers/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        showDashError(body.error || `Помилка ${res.status}`);
        return;
      }

      const created = body.createdCount ?? 0;
      const dup = body.skippedDuplicate ?? 0;
      const outWin = body.skippedOutOfWindow ?? 0;
      const fail = Array.isArray(body.failures) ? body.failures.length : 0;
      const elig = body.eligibleInWindow ?? 0;
      let msg = `Створення бойових голосувань у вікні планувальника: від ${body.windowHoursMinExclusive ?? 1} до ${body.windowHoursMaxInclusive ?? 120} год до заняття (Київ). `;
      msg += `Створено: ${created} з ${elig} підходящих слотів. `;
      msg += `Пропущено дублів: ${dup}. Поза вікном: ${outWin}.`;
      if (fail > 0) msg += ` Помилок відправки: ${fail}.`;
      showDashOk(msg);
      await renderVotesPanel();
    } catch (err) {
      showDashError(err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
}

function initTeacherForm() {
  const form = maybeEl("teacherCreateForm");
  if (!form) return;
  const toggle = maybeEl("teacherFormToggle");
  const cancel = maybeEl("teacherCreateCancel");
  form.noValidate = true;

  toggle?.addEventListener("click", () => setTeacherCreateFormOpen(form.classList.contains("admin-hide")));
  cancel?.addEventListener("click", () => resetTeacherCreateForm());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    const name = maybeEl("teacherCreateName")?.value.trim() ?? "";
    if (!name) {
      showDashError("Вкажи ім'я викладача.");
      return;
    }

    const { error: dbError } = await supabase.from("teachers").insert({
      name,
      short_description: null,
      chat_id: null,
    });

    if (dbError) {
      showDashError(dbError.message);
      return;
    }
    resetTeacherCreateForm();
    await renderTeachersPanel();
    showDashOk("Викладача додано.");
  });

  initTeacherEditModal();
}

const PRICE_MODAL_IDS = ["priceModal", "smmPriceModal", "placePriceModal"];
let pricePageModalsWired = false;

function isAnyPriceModalOpen() {
  return PRICE_MODAL_IDS.some((id) => !maybeEl(id)?.classList.contains("admin-hide"));
}

function syncPriceModalBodyLock() {
  if (!isAnyPriceModalOpen()) document.body.classList.remove("admin-modal-open");
}

function wirePriceModalClose(modalId, closeFn) {
  const modal = maybeEl(modalId);
  if (!modal) return;
  modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => closeFn());
  });
}

function openPriceModal(row = null) {
  const modal = maybeEl("priceModal");
  const titleEl = maybeEl("priceModalTitle");
  const submitBtn = maybeEl("priceSubmitBtn");
  if (!modal) return;

  if (row) {
    beginEditPrice(row);
    return;
  }

  resetPriceForm({ closeModal: false });
  editingPriceId = null;
  if (titleEl) titleEl.textContent = "Нова ціна";
  if (submitBtn) submitBtn.textContent = "Додати";
  populatePriceLessonTypeSelect();
  refreshPriceKindUI();

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  maybeEl("priceLessonType")?.focus();
}

function closePriceModal() {
  const modal = maybeEl("priceModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  syncPriceModalBodyLock();
}

function openSmmPriceModal(row = null) {
  const modal = maybeEl("smmPriceModal");
  const titleEl = maybeEl("smmPriceModalTitle");
  const submitBtn = maybeEl("smmPriceSubmitBtn");
  if (!modal) return;

  if (row) {
    beginEditSmmPrice(row);
    return;
  }

  resetSmmPriceForm({ closeModal: false });
  if (titleEl) titleEl.textContent = "Новий SMM прайс";
  if (submitBtn) submitBtn.textContent = "Додати";

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  maybeEl("smmPricePeopleFrom")?.focus();
}

function closeSmmPriceModal() {
  const modal = maybeEl("smmPriceModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  syncPriceModalBodyLock();
}

function openPlacePriceModal(row = null) {
  const modal = maybeEl("placePriceModal");
  const titleEl = maybeEl("placePriceModalTitle");
  const submitBtn = maybeEl("placePriceSubmitBtn");
  if (!modal) return;

  if (row) {
    beginEditPlacePrice(row);
    return;
  }

  resetPlacePriceForm({ closeModal: false });
  if (titleEl) titleEl.textContent = "Новий тариф";
  if (submitBtn) submitBtn.textContent = "Додати";
  populatePlacePricePlaceSelect();

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  maybeEl("placePricePlaceId")?.focus();
}

function closePlacePriceModal() {
  const modal = maybeEl("placePriceModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  syncPriceModalBodyLock();
}

function initPricePageModals() {
  if (pricePageModalsWired) return;
  if (!maybeEl("priceModal") && !maybeEl("smmPriceModal") && !maybeEl("placePriceModal")) return;
  pricePageModalsWired = true;

  wirePriceModalClose("priceModal", closePriceModal);
  wirePriceModalClose("smmPriceModal", closeSmmPriceModal);
  wirePriceModalClose("placePriceModal", closePlacePriceModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!maybeEl("priceModal")?.classList.contains("admin-hide")) closePriceModal();
    else if (!maybeEl("smmPriceModal")?.classList.contains("admin-hide")) closeSmmPriceModal();
    else if (!maybeEl("placePriceModal")?.classList.contains("admin-hide")) closePlacePriceModal();
  });
}

function refreshPriceKindUI() {
  const kind = document.querySelector('input[name="priceKind"]:checked')?.value || "single";
  const wrap = maybeEl("visitsFieldWrap");
  const visits = maybeEl("priceVisits");
  if (!wrap || !visits) return;
  if (kind === "single") {
    wrap.classList.add("admin-hide");
    visits.required = false;
  } else {
    wrap.classList.remove("admin-hide");
    visits.required = true;
  }
}

function populatePriceLessonTypeSelect() {
  const sel = document.getElementById("priceLessonType");
  if (!sel) return;
  sel.innerHTML = "";
  if (!cachedLessonTypes.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(немає типів)";
    sel.appendChild(opt);
    return;
  }
  for (const lt of cachedLessonTypes) {
    const opt = document.createElement("option");
    opt.value = lt.id;
    opt.textContent = lt.name || lt.slug;
    sel.appendChild(opt);
  }
  syncCustomSelect(sel);
}

function resetPriceForm({ closeModal = true } = {}) {
  if (!maybeEl("priceForm")) return;
  editingPriceId = null;
  const priceEditingId = maybeEl("priceEditingId");
  const priceSubmitBtn = maybeEl("priceSubmitBtn");
  const priceKindSingle = maybeEl("priceKindSingle");
  const priceAmount = maybeEl("priceAmount");
  const priceVisits = maybeEl("priceVisits");
  if (!priceEditingId || !priceSubmitBtn || !priceKindSingle || !priceAmount || !priceVisits) return;
  priceEditingId.value = "";
  priceSubmitBtn.textContent = "Додати";
  priceKindSingle.checked = true;
  priceAmount.value = "";
  priceVisits.value = "8";
  populatePriceLessonTypeSelect();
  refreshPriceKindUI();
  if (closeModal) closePriceModal();
}

function beginEditPrice(p) {
  if (!maybeEl("priceForm")) return;
  const modal = maybeEl("priceModal");
  const titleEl = maybeEl("priceModalTitle");
  editingPriceId = p.id;
  const priceEditingId = maybeEl("priceEditingId");
  const priceSubmitBtn = maybeEl("priceSubmitBtn");
  const ltSel = maybeEl("priceLessonType");
  const kSingle = maybeEl("priceKindSingle");
  const kAbon = maybeEl("priceKindAbon");
  const priceVisits = maybeEl("priceVisits");
  const priceAmount = maybeEl("priceAmount");
  if (!priceEditingId || !priceSubmitBtn || !ltSel || !kSingle || !kAbon || !priceVisits || !priceAmount) return;
  priceEditingId.value = p.id;
  if (titleEl) titleEl.textContent = "Редагування ціни";
  priceSubmitBtn.textContent = "Зберегти";
  populatePriceLessonTypeSelect();
  ltSel.value = p.lesson_type_id;
  syncCustomSelect(ltSel);
  kSingle.checked = p.price_kind === "single";
  kAbon.checked = p.price_kind === "abon";
  priceVisits.value = String(p.visits_count || 8);
  priceAmount.value = String(p.amount_uah);
  refreshPriceKindUI();
  if (modal) {
    modal.classList.remove("admin-hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
    priceAmount.focus();
  }
}

async function loadLessonTypesIntoCache() {
  const { data, error } = await supabase.from("lesson_types").select("*").order("sort_order", { ascending: true });
  if (error) {
    console.error(error);
    cachedLessonTypes = [];
    throw error;
  }
  cachedLessonTypes = data || [];
}

function renderLessonTypesPanel() {
  const root = maybeEl("lessonTypesList");
  if (!root) return;
  root.innerHTML = "";
  if (!cachedLessonTypes.length) {
    root.innerHTML = '<p class="admin-muted">Не вдалося завантажити типи занять.</p>';
    return;
  }

  for (const lt of cachedLessonTypes) {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "margin-bottom:12px;padding:14px;border:1px solid var(--cream-mid);border-radius:var(--radius-sm);background:var(--cream-soft)";
    wrap.innerHTML =
      `<div style="font-size:.78rem;color:var(--olive);font-weight:700;margin-bottom:8px">${lt.slug}</div>` +
      `<form data-lt-edit class="admin-grid admin-grid--2"><div class="admin-field admin-grid-span-2"><label>Назва</label>` +
      `<input data-lt-name type="text" required /></div>` +
      `<div class="admin-field"><label>Тривалість (хв)</label>` +
      `<input data-lt-dur type="number" min="15" step="5" /></div>` +
      `<div class="admin-actions" style="align-self:end"><button type="submit" class="btn btn--primary btn--sm">Зберегти</button></div>` +
      `</form>`;

    wrap.querySelector("[data-lt-name]").value = lt.name || "";
    wrap.querySelector("[data-lt-dur]").value = String(lt.duration_minutes ?? 60);

    wrap.querySelector("[data-lt-edit]").addEventListener("submit", async (e) => {
      e.preventDefault();
      clearDashMessages();
      const name = wrap.querySelector("[data-lt-name]").value.trim();
      const dur = parseInt(wrap.querySelector("[data-lt-dur]").value, 10) || 60;
      const { error } = await supabase.from("lesson_types").update({ name, duration_minutes: dur }).eq("id", lt.id);
      if (error) {
        showDashError(error.message);
        return;
      }
      await loadLessonTypesIntoCache();
      populatePriceLessonTypeSelect();
      renderLessonTypesPanel();
      await loadPlacesHtml();
      showDashOk("Тип заняття збережено.");
    });

    root.appendChild(wrap);
  }
}

function priceKindLabel(row) {
  return row.price_kind === "single" ? "Разове" : "Абонемент";
}

function priceVisitsLabel(row) {
  return row.price_kind === "single" ? "1 заняття" : `${row.visits_count} у пакеті`;
}

function renderPriceItemCard(row) {
  const card = document.createElement("article");
  card.className = "price-item-card";
  card.dataset.priceId = row.id;

  const rowEl = document.createElement("div");
  rowEl.className = "price-item-card__row";

  const info = document.createElement("div");
  info.className = "price-item-card__info";

  const kindEl = document.createElement("span");
  kindEl.className = `price-item-card__kind price-item-card__kind--${row.price_kind}`;
  kindEl.textContent = priceKindLabel(row);

  const detailEl = document.createElement("span");
  detailEl.className = "price-item-card__detail";
  detailEl.textContent = priceVisitsLabel(row);

  const amountEl = document.createElement("span");
  amountEl.className = "price-item-card__amount";
  amountEl.textContent = fmtMoney(row.amount_uah);

  info.append(kindEl, detailEl, amountEl);

  const actions = document.createElement("div");
  actions.className = "price-item-card__actions";
  actions.append(
    makeAdminIconBtn(
      "✏️",
      "Редагувати",
      "btn btn--ghost btn--sm price-item-card__btn",
      () => beginEditPrice(row),
    ),
    makeAdminIconBtn(
      "✕",
      "Видалити",
      "btn btn--danger btn--sm price-item-card__btn price-item-card__btn--del",
      async () => {
        if (!confirm("Видалити цю ціну?")) return;
        clearDashMessages();
        const { error: delErr } = await supabase.from("prices").delete().eq("id", row.id);
        if (delErr) {
          showDashError(delErr.message);
          return;
        }
        if (editingPriceId === row.id) resetPriceForm();
        await renderPricesPanel();
        showDashOk("Ціну видалено.");
      },
    ),
  );

  rowEl.append(info, actions);
  card.append(rowEl);
  return card;
}

function renderPriceGroupCard(group) {
  const card = document.createElement("article");
  card.className = "price-group-card";

  const head = document.createElement("div");
  head.className = "price-group-card__head";
  const titleEl = document.createElement("h3");
  titleEl.className = "price-group-card__title";
  const fullName = group.lesson_types?.name || group.lesson_types?.slug || "—";
  titleEl.textContent = lessonTypeShortLabel(group);
  titleEl.title = fullName;
  head.appendChild(titleEl);
  card.appendChild(head);

  const items = document.createElement("div");
  items.className = "price-item-cards";
  for (const row of group.prices) {
    items.appendChild(renderPriceItemCard(row));
  }
  card.appendChild(items);
  return card;
}

async function renderPricesPanel() {
  const root = maybeEl("pricesList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  const { data: prices, error } = await supabase.from("prices").select("*, lesson_types(slug,name,sort_order)");

  if (error) {
    root.innerHTML = `<p class="admin-muted">${error.message}</p>`;
    return;
  }

  const sorted = [...(prices || [])];
  sorted.sort((a, b) => {
    const so = (x) => x.lesson_types?.sort_order ?? 0;
    if (so(a) !== so(b)) return so(a) - so(b);
    if (a.price_kind !== b.price_kind) return a.price_kind === "single" ? -1 : 1;
    return (a.visits_count ?? 0) - (b.visits_count ?? 0);
  });

  if (!sorted.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає записів про ціни.</p>';
    return;
  }

  /** @type {Map<string, { lesson_types: any, prices: any[] }>} */
  const groups = new Map();
  for (const row of sorted) {
    const key = row.lesson_type_id || row.lesson_types?.slug || row.id;
    if (!groups.has(key)) {
      groups.set(key, { lesson_types: row.lesson_types, prices: [] });
    }
    groups.get(key).prices.push(row);
  }

  const grid = document.createElement("div");
  grid.className = "price-cards";
  for (const group of groups.values()) {
    grid.appendChild(renderPriceGroupCard(group));
  }
  root.innerHTML = "";
  root.appendChild(grid);
}

function fmtSmmPeopleRange(minPeople, maxPeople) {
  const minVal = Number(minPeople) || 0;
  const maxVal = Number(maxPeople) || null;
  if (!maxVal) return `${minVal}+`;
  if (minVal === maxVal) return `${minVal}`;
  return `${minVal}-${maxVal}`;
}

function resetSmmPriceForm({ closeModal = true } = {}) {
  if (!maybeEl("smmPriceForm")) return;
  editingSmmPriceId = null;
  const editingId = maybeEl("smmPriceEditingId");
  const submitBtn = maybeEl("smmPriceSubmitBtn");
  const peopleFrom = maybeEl("smmPricePeopleFrom");
  const peopleTo = maybeEl("smmPricePeopleTo");
  const amount = maybeEl("smmPriceAmount");
  if (!editingId || !submitBtn || !peopleFrom || !peopleTo || !amount) return;
  editingId.value = "";
  peopleFrom.value = "";
  peopleTo.value = "";
  amount.value = "";
  submitBtn.textContent = "Додати";
  if (closeModal) closeSmmPriceModal();
}

function beginEditSmmPrice(row) {
  const modal = maybeEl("smmPriceModal");
  const titleEl = maybeEl("smmPriceModalTitle");
  const editingId = maybeEl("smmPriceEditingId");
  const submitBtn = maybeEl("smmPriceSubmitBtn");
  const peopleFrom = maybeEl("smmPricePeopleFrom");
  const peopleTo = maybeEl("smmPricePeopleTo");
  const amount = maybeEl("smmPriceAmount");
  if (!editingId || !submitBtn || !peopleFrom || !peopleTo || !amount) return;
  editingSmmPriceId = row.id;
  editingId.value = row.id;
  peopleFrom.value = String(row.people_from ?? "");
  peopleTo.value = row.people_to == null ? "" : String(row.people_to);
  amount.value = String(row.amount_uah ?? 0);
  if (titleEl) titleEl.textContent = "Редагування SMM прайсу";
  submitBtn.textContent = "Зберегти";
  if (modal) {
    modal.classList.remove("admin-hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
    amount.focus();
  }
}

function renderSmmPriceCard(row) {
  const card = document.createElement("article");
  card.className = "price-flat-card";
  card.dataset.smmPriceId = row.id;

  const rowEl = document.createElement("div");
  rowEl.className = "price-flat-card__row";

  const info = document.createElement("div");
  info.className = "price-flat-card__info";

  const rangeEl = document.createElement("span");
  rangeEl.className = "price-flat-card__label";
  rangeEl.textContent = fmtSmmPeopleRange(row.people_from, row.people_to);
  rangeEl.title = "Кількість людей";

  const amountEl = document.createElement("span");
  amountEl.className = "price-flat-card__amount";
  amountEl.textContent = fmtMoney(row.amount_uah);

  info.append(rangeEl, amountEl);

  const actions = document.createElement("div");
  actions.className = "price-flat-card__actions";
  actions.append(
    makeAdminIconBtn(
      "✏️",
      "Редагувати",
      "btn btn--ghost btn--sm price-flat-card__btn",
      () => beginEditSmmPrice(row),
    ),
    makeAdminIconBtn(
      "✕",
      "Видалити",
      "btn btn--danger btn--sm price-flat-card__btn price-flat-card__btn--del",
      async () => {
        if (!confirm("Видалити цей SMM прайс?")) return;
        clearDashMessages();
        const { error: delErr } = await supabase.from("smm_prices").delete().eq("id", row.id);
        if (delErr) {
          showDashError(delErr.message);
          return;
        }
        if (editingSmmPriceId === row.id) resetSmmPriceForm();
        await renderSmmPricesPanel();
        showDashOk("SMM прайс видалено.");
      },
    ),
  );

  rowEl.append(info, actions);
  card.append(rowEl);
  return card;
}

async function renderSmmPricesPanel() {
  const root = maybeEl("smmPricesList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const { data, error } = await supabase.from("smm_prices").select("*").order("people_from", { ascending: true });
  if (error) {
    root.innerHTML = `<p class="admin-muted">${error.message}</p>`;
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає SMM прайсів.</p>';
    return;
  }

  const grid = document.createElement("div");
  grid.className = "price-flat-cards";
  for (const row of rows) {
    grid.appendChild(renderSmmPriceCard(row));
  }
  root.innerHTML = "";
  root.appendChild(grid);
}

function fmtPlacePriceDuration(durationMinutes) {
  const d = Number(durationMinutes);
  if (d === 90) return "1.5 години";
  return "1 година";
}

function populatePlacePricePlaceSelect(selectedPlaceId = "") {
  const sel = maybeEl("placePricePlaceId");
  if (!sel) return;
  sel.innerHTML = "";
  if (!cachedPlaces.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(немає місць)";
    sel.appendChild(opt);
    return;
  }
  for (const place of cachedPlaces) {
    const opt = document.createElement("option");
    opt.value = place.id;
    opt.textContent = place.name || "—";
    sel.appendChild(opt);
  }
  if (selectedPlaceId) sel.value = selectedPlaceId;
  syncCustomSelect(sel);
}

function resetPlacePriceForm({ closeModal = true } = {}) {
  if (!maybeEl("placePriceForm")) return;
  editingPlacePriceId = null;
  const editingId = maybeEl("placePriceEditingId");
  const submitBtn = maybeEl("placePriceSubmitBtn");
  const duration = maybeEl("placePriceDuration");
  const amount = maybeEl("placePriceAmount");
  if (!editingId || !submitBtn || !duration || !amount) return;
  editingId.value = "";
  amount.value = "";
  duration.value = "60";
  submitBtn.textContent = "Додати";
  populatePlacePricePlaceSelect();
  syncCustomSelect(maybeEl("placePriceDuration"));
  if (closeModal) closePlacePriceModal();
}

function beginEditPlacePrice(row) {
  const modal = maybeEl("placePriceModal");
  const titleEl = maybeEl("placePriceModalTitle");
  const editingId = maybeEl("placePriceEditingId");
  const submitBtn = maybeEl("placePriceSubmitBtn");
  const placeSel = maybeEl("placePricePlaceId");
  const duration = maybeEl("placePriceDuration");
  const amount = maybeEl("placePriceAmount");
  if (!editingId || !submitBtn || !placeSel || !duration || !amount) return;

  editingPlacePriceId = row.id;
  editingId.value = row.id;
  if (titleEl) titleEl.textContent = "Редагування тарифу";
  submitBtn.textContent = "Зберегти";
  populatePlacePricePlaceSelect(row.place_id);
  duration.value = String(row.duration_minutes || 60);
  amount.value = String(row.amount_uah ?? 0);
  syncCustomSelect(duration);
  if (modal) {
    modal.classList.remove("admin-hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
    amount.focus();
  }
}

async function renderPlacePricesPanel() {
  const root = maybeEl("placePricesList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const [{ data: places, error: placesError }, { data: rows, error: pricesError }] = await Promise.all([
    supabase.from("places").select("id, name").order("sort_order", { ascending: true }),
    supabase
      .from("places_prices")
      .select("id, place_id, duration_minutes, amount_uah, effective_from, places(name)")
      .order("effective_from", { ascending: true }),
  ]);

  if (placesError) {
    root.innerHTML = `<p class="admin-muted">${placesError.message}</p>`;
    return;
  }
  if (pricesError) {
    root.innerHTML = `<p class="admin-muted">${pricesError.message}</p>`;
    return;
  }

  cachedPlaces = places || [];
  populatePlacePricePlaceSelect();

  // Show only the current rate per place+duration; older rows stay for historical stats.
  const latestByKey = new Map();
  for (const row of rows || []) {
    const key = `${row.place_id}:${row.duration_minutes}`;
    const prev = latestByKey.get(key);
    if (!prev || new Date(row.effective_from || 0) >= new Date(prev.effective_from || 0)) {
      latestByKey.set(key, row);
    }
  }

  const sorted = [...latestByKey.values()].sort((a, b) => {
    const placeA = (a.places?.name || "").toLowerCase();
    const placeB = (b.places?.name || "").toLowerCase();
    if (placeA !== placeB) return placeA.localeCompare(placeB, "uk");
    return (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0);
  });

  if (!sorted.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає тарифів оренди.</p>';
    return;
  }

  /** @type {Map<string, { placeName: string, prices: any[] }>} */
  const groups = new Map();
  for (const row of sorted) {
    const key = row.place_id || row.places?.name || row.id;
    if (!groups.has(key)) {
      groups.set(key, { placeName: row.places?.name || "—", prices: [] });
    }
    groups.get(key).prices.push(row);
  }

  const grid = document.createElement("div");
  grid.className = "price-cards";
  for (const group of groups.values()) {
    const card = document.createElement("article");
    card.className = "price-group-card";

    const head = document.createElement("div");
    head.className = "price-group-card__head";
    const titleEl = document.createElement("h3");
    titleEl.className = "price-group-card__title price-group-card__title--place";
    titleEl.textContent = group.placeName;
    head.appendChild(titleEl);
    card.appendChild(head);

    const items = document.createElement("div");
    items.className = "price-item-cards";
    for (const row of group.prices) {
      const item = document.createElement("article");
      item.className = "price-item-card";
      item.dataset.placePriceId = row.id;

      const rowEl = document.createElement("div");
      rowEl.className = "price-item-card__row";

      const info = document.createElement("div");
      info.className = "price-item-card__info";

      const kindEl = document.createElement("span");
      kindEl.className = "price-item-card__kind price-item-card__kind--rent";
      kindEl.textContent = fmtPlacePriceDuration(row.duration_minutes);

      const amountEl = document.createElement("span");
      amountEl.className = "price-item-card__amount";
      amountEl.textContent = fmtMoney(row.amount_uah);

      info.append(kindEl, amountEl);

      const actions = document.createElement("div");
      actions.className = "price-item-card__actions";
      actions.append(
        makeAdminIconBtn(
          "✏️",
          "Редагувати",
          "btn btn--ghost btn--sm price-item-card__btn",
          () => beginEditPlacePrice(row),
        ),
        makeAdminIconBtn(
          "✕",
          "Видалити",
          "btn btn--danger btn--sm price-item-card__btn price-item-card__btn--del",
          async () => {
            if (!confirm("Видалити цей тариф оренди?")) return;
            clearDashMessages();
            const { error: delErr } = await supabase.from("places_prices").delete().eq("id", row.id);
            if (delErr) {
              showDashError(delErr.message);
              return;
            }
            if (editingPlacePriceId === row.id) resetPlacePriceForm();
            await renderPlacePricesPanel();
            showDashOk("Тариф оренди видалено.");
          },
        ),
      );

      rowEl.append(info, actions);
      item.append(rowEl);
      items.appendChild(item);
    }
    card.appendChild(items);
    grid.appendChild(card);
  }

  root.innerHTML = "";
  root.appendChild(grid);
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function initPriceForm() {
  initPricePageModals();
  const form = maybeEl("priceForm");
  if (!form) return;
  // We validate in JS to avoid native validation conflicts with custom-select UI.
  form.noValidate = true;
  const toggle = maybeEl("priceFormToggle");
  document.querySelectorAll('input[name="priceKind"]').forEach((r) => r.addEventListener("change", refreshPriceKindUI));
  refreshPriceKindUI();

  toggle?.addEventListener("click", () => openPriceModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    const ltId = maybeEl("priceLessonType")?.value;
    if (!ltId) {
      showDashError("Обери напрям.");
      return;
    }
    const price_kind = document.querySelector('input[name="priceKind"]:checked')?.value;
    let visits_count = price_kind === "single" ? 1 : parseInt(maybeEl("priceVisits")?.value ?? "0", 10);
    if (!visits_count || visits_count < 1) {
      showDashError("Вкажи коректну кількість занять.");
      return;
    }
    if (price_kind === "single") visits_count = 1;

    const amount_uah = parseInt(maybeEl("priceAmount")?.value ?? "", 10);
    if (Number.isNaN(amount_uah) || amount_uah < 0) {
      showDashError("Вкажи суму (грн).");
      return;
    }

    const payload = { lesson_type_id: ltId, price_kind, visits_count, amount_uah };
    const id = maybeEl("priceEditingId")?.value ?? "";

    let errRow;
    if (id) {
      const { error } = await supabase.from("prices").update(payload).eq("id", id);
      errRow = error;
    } else {
      const { error } = await supabase.from("prices").insert(payload);
      errRow = error;
    }

    if (errRow) {
      showDashError(errRow.message);
      return;
    }

    resetPriceForm();
    closePriceModal();
    await renderPricesPanel();
    showDashOk(id ? "Ціну оновлено." : "Ціну додано.");
  });
}

function initSmmPriceForm() {
  const form = maybeEl("smmPriceForm");
  if (!form) return;
  form.noValidate = true;
  const toggle = maybeEl("smmPriceFormToggle");
  toggle?.addEventListener("click", () => openSmmPriceModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();

    const people_from = parseInt(maybeEl("smmPricePeopleFrom")?.value ?? "", 10);
    const peopleToRaw = (maybeEl("smmPricePeopleTo")?.value ?? "").trim();
    const amount_uah = parseInt(maybeEl("smmPriceAmount")?.value ?? "", 10);
    const people_to = peopleToRaw ? parseInt(peopleToRaw, 10) : null;

    if (Number.isNaN(people_from) || people_from < 1) {
      showDashError("Вкажи коректне значення «Людей від».");
      return;
    }
    if (peopleToRaw && (Number.isNaN(people_to) || people_to < people_from)) {
      showDashError("Верхня межа має бути не меншою за «Людей від».");
      return;
    }
    if (Number.isNaN(amount_uah) || amount_uah < 0) {
      showDashError("Вкажи коректну суму (грн).");
      return;
    }

    const payload = { people_from, people_to, amount_uah };
    const id = maybeEl("smmPriceEditingId")?.value ?? "";
    let errRow;
    if (id) {
      const { error } = await supabase.from("smm_prices").update(payload).eq("id", id);
      errRow = error;
    } else {
      const { error } = await supabase.from("smm_prices").insert(payload);
      errRow = error;
    }
    if (errRow) {
      showDashError(errRow.message);
      return;
    }

    resetSmmPriceForm();
    closeSmmPriceModal();
    await renderSmmPricesPanel();
    showDashOk(id ? "SMM прайс оновлено." : "SMM прайс додано.");
  });
}

function initPlacePriceForm() {
  const form = maybeEl("placePriceForm");
  if (!form) return;
  form.noValidate = true;
  const toggle = maybeEl("placePriceFormToggle");
  toggle?.addEventListener("click", () => openPlacePriceModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();

    const place_id = maybeEl("placePricePlaceId")?.value ?? "";
    const duration_minutes = parseInt(maybeEl("placePriceDuration")?.value ?? "", 10);
    const amount_uah = parseInt(maybeEl("placePriceAmount")?.value ?? "", 10);
    if (!place_id) {
      showDashError("Обери місце.");
      return;
    }
    if (![60, 90].includes(duration_minutes)) {
      showDashError("Тривалість має бути 60 або 90 хв.");
      return;
    }
    if (Number.isNaN(amount_uah) || amount_uah < 0) {
      showDashError("Вкажи коректну суму (грн).");
      return;
    }

    const id = maybeEl("placePriceEditingId")?.value ?? "";
    // Edit inserts a new version from now — past lessons keep the previous rent.
    const payload = {
      place_id,
      duration_minutes,
      amount_uah,
      effective_from: id ? new Date().toISOString() : "1970-01-01T00:00:00.000Z",
    };
    const { error: errRow } = await supabase.from("places_prices").insert(payload);
    if (errRow) {
      showDashError(errRow.message);
      return;
    }

    resetPlacePriceForm();
    closePlacePriceModal();
    await renderPlacePricesPanel();
    showDashOk(id ? "Тариф оренди оновлено (для нових уроків)." : "Тариф оренди додано.");
  });
}

async function refreshDashboard() {
  try {
    switch (ADMIN_PAGE) {
      case "lesson-types":
        await loadLessonTypesIntoCache();
        renderLessonTypesPanel();
        break;
      case "prices":
        await loadLessonTypesIntoCache();
        populatePriceLessonTypeSelect();
        resetPriceForm();
        resetSmmPriceForm();
        resetPlacePriceForm();
        await renderPricesPanel();
        await renderSmmPricesPanel();
        await renderPlacePricesPanel();
        break;
      case "places":
        await loadLessonTypesIntoCache();
        closePlaceEditModal();
        closePlaceLessonModal();
        await loadPlacesHtml();
        break;
      case "teachers":
        resetTeacherCreateForm();
        closeTeacherEditModal();
        await renderTeachersPanel();
        break;
      case "students": {
        const mod = await import("./admin-students.js");
        await mod.setupStudentsAdmin();
        break;
      }
      case "subscriptions": {
        const mod = await import("./admin-subscriptions.js");
        await mod.setupSubscriptionsAdmin();
        break;
      }
      case "votes":
        await renderVotesPanel();
        break;
      case "lessons":
        await renderLessonsPanel();
        break;
      case "stats":
        await renderStatsDashboard();
        break;
      default:
        break;
    }
  } catch (err) {
    showDashError(err?.message || String(err));
  }
}

function showAuthError(msg) {
  if (!authError) return;
  if (authOk) authOk.classList.add("admin-hide");
  authError.textContent = msg;
  authError.classList.remove("admin-hide");
}

function showAuthOk(msg) {
  if (!authOk) return;
  if (authError) authError.classList.add("admin-hide");
  authOk.textContent = msg;
  authOk.classList.remove("admin-hide");
}

function clearAuthMessages() {
  if (!authError) return;
  authError.textContent = "";
  authError.classList.add("admin-hide");
  if (authOk) {
    authOk.textContent = "";
    authOk.classList.add("admin-hide");
  }
}

function showDashError(msg) {
  if (!dashError) return;
  dashError.textContent = msg;
  dashError.classList.remove("admin-hide");
  if (dashOk) dashOk.classList.add("admin-hide");
}

function showDashOk(msg) {
  if (!dashOk) return;
  dashOk.textContent = msg;
  dashOk.classList.remove("admin-hide");
  if (dashError) dashError.classList.add("admin-hide");
  setTimeout(() => dashOk?.classList.add("admin-hide"), 3600);
}

function clearDashMessages() {
  dashError?.classList.add("admin-hide");
  dashOk?.classList.add("admin-hide");
}

/** @type {import('chart.js').Chart | null} */
let statsPayoutChartInstance = null;
/** @type {import('chart.js').Chart | null} */
let statsBreakdownChartInstance = null;

/**
 * Render the 4 KPI cards on the stats page.
 * @param {{ totalLessons: number, totalScheduledLessons?: number | null, totalPeople: number, totalNetAfterRent: number, totalSmm: number }} summary — totalPeople = unique students in period
 */
function renderStatsKpiCards(summary) {
  const root = maybeEl("statsSummaryCards");
  if (!root) return;
  const { totalLessons, totalScheduledLessons, totalPeople, totalNetAfterRent, totalSmm } = summary;
  const netColor = totalNetAfterRent >= 0 ? "green" : "red";

  const lessonsValueHtml =
    totalScheduledLessons != null && totalScheduledLessons > 0
      ? `${escapeHtml(String(totalLessons))}<span class="admin-stats-kpi-card__value-total"> / ${escapeHtml(String(totalScheduledLessons))}</span>`
      : escapeHtml(String(totalLessons));

  const ICON_CALENDAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>`;
  const ICON_PEOPLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  const ICON_MONEY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  const ICON_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/></svg>`;

  const cards = [
    { color: "olive", icon: ICON_CALENDAR, label: "Проведено занять",    valueHtml: lessonsValueHtml },
    { color: "blue",  icon: ICON_PEOPLE,   label: "Унікальних учнів", value: String(totalPeople) },
    { color: netColor, icon: ICON_MONEY,   label: "Чистий після оренди", value: fmtMoney(totalNetAfterRent) },
    { color: "amber", icon: ICON_SEND,     label: "SMM дохід (загалом)", value: fmtMoney(totalSmm) },
  ];

  root.innerHTML = cards.map((c) => `
    <div class="admin-stats-kpi-card admin-stats-kpi-card--${c.color}">
      <div class="admin-stats-kpi-card__icon">${c.icon}</div>
      <div class="admin-stats-kpi-card__body">
        <div class="admin-stats-kpi-card__label">${escapeHtml(c.label)}</div>
        <div class="admin-stats-kpi-card__value">${c.valueHtml ?? escapeHtml(c.value ?? "")}</div>
      </div>
    </div>
  `).join("");
}

/**
 * Render a Chart.js horizontal bar chart of teacher payouts.
 * @param {Array<{ name: string, payout: number }>} rows
 */
function renderStatsPayoutChart(rows) {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("statsPayoutChart"));
  const wrap = document.getElementById("statsPayoutWrap");
  if (!canvas || !wrap) return;

  if (statsPayoutChartInstance) {
    statsPayoutChartInstance.destroy();
    statsPayoutChartInstance = null;
  }

  if (!rows.length || !window.Chart) {
    wrap.innerHTML = '<p class="admin-muted" style="padding:20px 0;text-align:center">Немає даних для відображення.</p>';
    return;
  }

  const dynamicH = Math.max(160, rows.length * 54);
  canvas.style.height = `${dynamicH}px`;

  const labels = rows.map((r) => r.name);
  const values = rows.map((r) => r.payout);
  const bgColors = values.map((v) => v >= 0 ? "rgba(116,134,47,0.82)" : "rgba(192,79,79,0.82)");
  const borderColors = values.map((v) => v >= 0 ? "rgba(116,134,47,1)" : "rgba(192,79,79,1)");

  statsPayoutChartInstance = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `  ${fmtMoney(ctx.raw)}` },
          backgroundColor: "rgba(251,246,240,0.97)",
          titleColor: "#2d1f0e",
          bodyColor: "#5a3e22",
          borderColor: "rgba(232,217,205,0.9)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(232,217,205,0.45)" },
          ticks: {
            color: "#8b7258",
            font: { size: 11 },
            callback: (v) => fmtMoney(v),
          },
          border: { dash: [3, 3] },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#3d2b18", font: { size: 12, weight: "600" } },
        },
      },
    },
  });
}

/**
 * Render a Chart.js doughnut chart for overall financial breakdown.
 * @param {Array<{ revenue: number, rent: number, smm: number, payout: number }>} rows
 * @param {{ totalSmm?: number } | null} [summary]
 */
function renderStatsBreakdownChart(rows, summary = null) {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("statsBreakdownChart"));
  const legendRoot = document.getElementById("statsBreakdownLegend");
  const wrap = document.getElementById("statsBreakdownWrap");
  if (!canvas || !wrap) return;

  if (statsBreakdownChartInstance) {
    statsBreakdownChartInstance.destroy();
    statsBreakdownChartInstance = null;
  }

  if (!rows.length || !window.Chart) {
    wrap.innerHTML = '<p class="admin-muted" style="padding:20px 0;text-align:center">Немає даних.</p>';
    if (legendRoot) legendRoot.innerHTML = "";
    return;
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalRent    = rows.reduce((s, r) => s + r.rent, 0);
  const totalSmm     = summary?.totalSmm != null ? Number(summary.totalSmm) || 0 : rows.reduce((s, r) => s + r.smm, 0);
  // SMM is inside SMM-teacher payout — keep separate slice in the donut
  const totalPayout  = rows.reduce((s, r) => s + r.payout, 0) - totalSmm;

  const segments = [
    { label: "Виплати",  value: Math.max(0, totalPayout), color: "rgba(116,134,47,0.85)",  border: "rgba(116,134,47,1)" },
    { label: "Оренда",   value: Math.max(0, totalRent),   color: "rgba(163,128,87,0.82)",  border: "rgba(163,128,87,1)" },
    { label: "SMM",      value: Math.max(0, totalSmm),    color: "rgba(201,138,43,0.82)",  border: "rgba(201,138,43,1)" },
  ].filter((s) => s.value > 0);

  if (!segments.length) {
    wrap.innerHTML = '<p class="admin-muted" style="padding:20px 0;text-align:center">Немає даних.</p>';
    if (legendRoot) legendRoot.innerHTML = "";
    return;
  }

  statsBreakdownChartInstance = new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels: segments.map((s) => s.label),
      datasets: [{
        data: segments.map((s) => s.value),
        backgroundColor: segments.map((s) => s.color),
        borderColor: segments.map((s) => s.border),
        borderWidth: 1.5,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `  ${ctx.label}: ${fmtMoney(ctx.raw)}` },
          backgroundColor: "rgba(251,246,240,0.97)",
          titleColor: "#2d1f0e",
          bodyColor: "#5a3e22",
          borderColor: "rgba(232,217,205,0.9)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
    },
  });

  if (legendRoot) {
    legendRoot.innerHTML = segments.map((s) => `
      <div class="admin-stats-donut-legend__item">
        <span class="admin-stats-donut-legend__dot" style="background:${s.color};border:1.5px solid ${s.border}"></span>
        <span>${escapeHtml(s.label)}</span>
        <span class="admin-stats-donut-legend__amount">${escapeHtml(fmtMoney(s.value))}</span>
      </div>
    `).join("") + `
      <div class="admin-stats-donut-legend__item" style="width:100%;border-top:1px solid var(--admin-panel-border);padding-top:8px;margin-top:2px">
        <span class="admin-stats-donut-legend__dot" style="background:rgba(241,230,221,0.9);border:1.5px solid var(--cream-mid)"></span>
        <span>Виручка</span>
        <span class="admin-stats-donut-legend__amount">${escapeHtml(fmtMoney(totalRevenue))}</span>
      </div>
    `;
  }
}

/**
 * Render teacher detail cards.
 * @param {Array<{ id?: string | null, name: string, lessonsCount: number, peopleCount: number, revenue: number, rent: number, smm: number, smmIncome?: number, isSmm?: boolean, payout: number }>} rows
 */
function renderStatsTeachersTable(rows) {
  const tableRoot = maybeEl("statsTeachersTable");
  if (!tableRoot) return;

  if (!rows.length) {
    tableRoot.className = "admin-stats-teacher-cards admin-stats-teacher-cards--empty";
    tableRoot.innerHTML = '<p class="admin-muted">Немає даних.</p>';
    return;
  }

  tableRoot.className = "admin-stats-teacher-cards";
  tableRoot.innerHTML = rows.map((row, i) => {
    const rank = i + 1;
    const payoutCls = row.payout >= 0 ? "admin-stats-payout-positive" : "admin-stats-payout-negative";
    const topMod = rank <= 3 ? ` admin-stats-teacher-card--top-${rank}` : "";
    const teacherId = row.id ? escapeHtml(String(row.id)) : "";
    const teacherName = escapeHtml(row.name);
    const nameBadge = row.isSmm ? ` <span class="admin-muted">(SMM)</span>` : "";
    const rentSigned = `− ${fmtMoney(row.rent)}`;
    const smmSigned = row.isSmm
      ? fmtMoney(Number(row.smmIncome) || 0)
      : `− ${fmtMoney(row.smm)}`;
    const smmLabel = row.isSmm ? "SMM дохід" : "SMM";
    return `
      <article class="admin-stats-teacher-card${topMod}">
        <header class="admin-stats-teacher-card__head">
          <h3 class="admin-stats-teacher-card__name">${teacherName}${nameBadge}</h3>
        </header>
        <dl class="admin-stats-teacher-card__stats">
          <div class="admin-stats-teacher-card__stat">
            <dt>Уроків</dt>
            <dd>${row.lessonsCount}</dd>
          </div>
          <div class="admin-stats-teacher-card__stat">
            <dt>Людей</dt>
            <dd>${row.peopleCount}</dd>
          </div>
          <div class="admin-stats-teacher-card__stat">
            <dt>Виручка</dt>
            <dd>${escapeHtml(fmtMoney(row.revenue))}</dd>
          </div>
          <div class="admin-stats-teacher-card__stat">
            <dt>Оренда</dt>
            <dd class="admin-stats-teacher-card__stat--muted">${escapeHtml(rentSigned)}</dd>
          </div>
          <div class="admin-stats-teacher-card__stat">
            <dt>${smmLabel}</dt>
            <dd class="admin-stats-teacher-card__stat--muted">${escapeHtml(smmSigned)}</dd>
          </div>
          <div class="admin-stats-teacher-card__journal-cell">
            <button
              type="button"
              class="admin-stats-teacher-card__journal"
              data-teacher-id="${teacherId}"
              data-teacher-name="${teacherName}"
            >Журнал уроків</button>
          </div>
          <div class="admin-stats-teacher-card__stat admin-stats-teacher-card__stat--payout">
            <dt>Виплата</dt>
            <dd class="${payoutCls}">${escapeHtml(fmtMoney(row.payout))}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

let statsTeacherJournalWired = false;

function closeStatsTeacherJournalModal() {
  const modal = maybeEl("statsTeacherJournalModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-modal-open");
}

function mountStatsTeacherJournalTotals(container, summary) {
  if (!container) return;
  const payoutCls = summary.payout >= 0 ? "admin-stats-payout-positive" : "admin-stats-payout-negative";
  container.innerHTML = `
    <div class="admin-stats-journal-totals__grid">
      <div class="admin-stats-journal-totals__item">
        <span class="admin-stats-journal-totals__label">Уроків</span>
        <span class="admin-stats-journal-totals__value">${summary.lessonsCount}</span>
      </div>
      <div class="admin-stats-journal-totals__item">
        <span class="admin-stats-journal-totals__label">Людей</span>
        <span class="admin-stats-journal-totals__value">${summary.peopleCount}</span>
      </div>
      <div class="admin-stats-journal-totals__item">
        <span class="admin-stats-journal-totals__label">Виручка</span>
        <span class="admin-stats-journal-totals__value">${escapeHtml(fmtMoney(summary.revenue))}</span>
      </div>
      <div class="admin-stats-journal-totals__item">
        <span class="admin-stats-journal-totals__label">Виплата</span>
        <span class="admin-stats-journal-totals__value ${payoutCls}">${escapeHtml(fmtMoney(summary.payout))}</span>
      </div>
    </div>
  `;
  container.classList.remove("admin-hide");
}

/**
 * @param {HTMLElement | null} container
 * @param {Array<{ startsAt: string, lessonTypeName: string, placeName: string, peopleCount: number, revenue: number, rent: number, smm: number, payout: number }>} lessons
 */
function mountStatsTeacherJournalList(container, lessons) {
  if (!container) return;
  if (!lessons.length) {
    container.innerHTML = '<p class="admin-muted">Немає уроків за обраний період.</p>';
    return;
  }

  container.innerHTML = lessons.map((lesson) => {
    const payoutCls = lesson.payout >= 0 ? "admin-stats-payout-positive" : "admin-stats-payout-negative";
    const financeMod = lesson.hideSmm ? " admin-stats-journal__finance--no-smm" : "";
    const rentSigned = `− ${fmtMoney(lesson.rent)}`;
    const smmItem = lesson.hideSmm
      ? ""
      : `<div class="admin-stats-journal__finance-item">
            <dt>SMM</dt>
            <dd class="admin-stats-teacher-card__stat--muted">${escapeHtml(`− ${fmtMoney(lesson.smm)}`)}</dd>
          </div>`;
    return `
      <article class="admin-stats-journal__item">
        <div class="admin-stats-journal__main">
          <div class="admin-stats-journal__date">${escapeHtml(fmtKyivDateTime(lesson.startsAt))}</div>
          <div class="admin-stats-journal__meta">${escapeHtml(lesson.lessonTypeName)} · ${escapeHtml(lesson.placeName)} · ${lesson.peopleCount} ${lesson.peopleCount === 1 ? "людина" : lesson.peopleCount >= 2 && lesson.peopleCount <= 4 ? "людини" : "людей"}</div>
        </div>
        <dl class="admin-stats-journal__finance${financeMod}">
          <div class="admin-stats-journal__finance-item">
            <dt>Виручка</dt>
            <dd>${escapeHtml(fmtMoney(lesson.revenue))}</dd>
          </div>
          <div class="admin-stats-journal__finance-item">
            <dt>Оренда</dt>
            <dd class="admin-stats-teacher-card__stat--muted">${escapeHtml(rentSigned)}</dd>
          </div>
          ${smmItem}
          <div class="admin-stats-journal__finance-item admin-stats-journal__finance-item--payout">
            <dt>Виплата</dt>
            <dd class="${payoutCls}">${escapeHtml(fmtMoney(lesson.payout))}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

async function openStatsTeacherJournalModal({ teacherId, teacherName }) {
  ensureStatsTeacherJournalWired();
  const modal = maybeEl("statsTeacherJournalModal");
  const titleEl = maybeEl("statsTeacherJournalTitle");
  const subEl = maybeEl("statsTeacherJournalSub");
  const listEl = maybeEl("statsTeacherJournalList");
  const totalsEl = maybeEl("statsTeacherJournalTotals");
  if (!modal || !listEl) return;

  const name = teacherName || "Викладач";
  if (titleEl) titleEl.textContent = `Журнал уроків — ${name}`;
  if (subEl) subEl.textContent = "Завантаження…";
  totalsEl?.classList.add("admin-hide");
  listEl.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  modal.querySelector(".admin-modal__close")?.focus();

  const params = new URLSearchParams();
  if (teacherId) params.set("teacherId", teacherId);
  else if (teacherName) params.set("teacherName", teacherName);
  const fromInput = maybeEl("statsDateFrom")?.value?.trim() || "";
  const toInput = maybeEl("statsDateTo")?.value?.trim() || "";
  if (fromInput) params.set("from", fromInput);
  if (toInput) params.set("to", toInput);

  try {
    const res = await fetch(`/api/admin/stats/teacher-lessons?${params.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Помилка ${res.status}`);
    }
    if (subEl) {
      const parts = [];
      if (fromInput || toInput) {
        const fmt = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });
        if (fromInput) parts.push(fmt.format(new Date(`${fromInput}T12:00:00`)));
        if (toInput) parts.push(fmt.format(new Date(`${toInput}T12:00:00`)));
        subEl.textContent = `Період: ${parts.join(" — ")} · ${json.lessons?.length || 0} уроків`;
      } else {
        subEl.textContent = `${json.lessons?.length || 0} уроків за весь час`;
      }
    }
    mountStatsTeacherJournalTotals(totalsEl, json.summary || { lessonsCount: 0, peopleCount: 0, revenue: 0, payout: 0 });
    mountStatsTeacherJournalList(listEl, json.lessons || []);
  } catch (err) {
    if (subEl) subEl.textContent = "";
    listEl.innerHTML = `<p class="admin-muted">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
  }
}

function ensureStatsTeacherJournalWired() {
  if (statsTeacherJournalWired) return;
  const modal = maybeEl("statsTeacherJournalModal");
  const tableRoot = maybeEl("statsTeachersTable");
  if (!modal) return;
  statsTeacherJournalWired = true;

  modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
    node.addEventListener("click", () => closeStatsTeacherJournalModal());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("admin-hide")) return;
    closeStatsTeacherJournalModal();
  });

  tableRoot?.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest(".admin-stats-teacher-card__journal");
    if (!btn) return;
    openStatsTeacherJournalModal({
      teacherId: btn.getAttribute("data-teacher-id") || "",
      teacherName: btn.getAttribute("data-teacher-name") || "",
    });
  });
}

async function renderStatsDashboard() {
  const cardsRoot = maybeEl("statsSummaryCards");
  const tableRoot = maybeEl("statsTeachersTable");
  if (!cardsRoot) return;

  cardsRoot.innerHTML = `
    <div class="admin-stats-kpi-card admin-stats-kpi-card--skeleton"></div>
    <div class="admin-stats-kpi-card admin-stats-kpi-card--skeleton"></div>
    <div class="admin-stats-kpi-card admin-stats-kpi-card--skeleton"></div>
    <div class="admin-stats-kpi-card admin-stats-kpi-card--skeleton"></div>
  `;
  if (tableRoot) {
    tableRoot.className = "admin-stats-teacher-cards admin-stats-teacher-cards--empty";
    tableRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  }

  const fromInput = maybeEl("statsDateFrom")?.value?.trim() || "";
  const toInput   = maybeEl("statsDateTo")?.value?.trim() || "";
  if (fromInput && !startOfDayIso(fromInput)) { showDashError("Некоректна дата «від»."); return; }
  if (toInput   && !endOfDayIso(toInput))    { showDashError("Некоректна дата «до»."); return; }
  if (fromInput && toInput && fromInput > toInput) { showDashError("Дата «від» має бути не пізніше за «до»."); return; }

  const params = new URLSearchParams();
  if (fromInput) params.set("from", fromInput);
  if (toInput)   params.set("to", toInput);

  updateStatsPeriodLabel(fromInput, toInput);

  /** @type {{ ok?: boolean, error?: string, summary?: { totalLessons: number, totalScheduledLessons?: number | null, totalPeople: number, totalNetAfterRent: number, totalSmm: number }, teachers?: Array<{ name: string, lessonsCount: number, peopleCount: number, revenue: number, rent: number, smm: number, payout: number }> }} */
  let json;
  try {
    const res = await fetch(`/api/admin/stats?${params.toString()}`);
    json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      const msg = json.error || `Помилка ${res.status}`;
      renderStatsKpiCards({ totalLessons: 0, totalPeople: 0, totalNetAfterRent: 0, totalSmm: 0 });
      if (tableRoot) {
        tableRoot.className = "admin-stats-teacher-cards admin-stats-teacher-cards--empty";
        tableRoot.innerHTML = `<p class="admin-muted">${escapeHtml(msg)}</p>`;
      }
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    renderStatsKpiCards({ totalLessons: 0, totalPeople: 0, totalNetAfterRent: 0, totalSmm: 0 });
    if (tableRoot) {
      tableRoot.className = "admin-stats-teacher-cards admin-stats-teacher-cards--empty";
      tableRoot.innerHTML = `<p class="admin-muted">${escapeHtml(msg)}</p>`;
    }
    return;
  }

  const summary = json.summary || { totalLessons: 0, totalPeople: 0, totalNetAfterRent: 0, totalSmm: 0 };
  const rows = json.teachers || [];

  renderStatsKpiCards(summary);
  renderStatsPayoutChart(rows);
  renderStatsBreakdownChart(rows, summary);
  renderStatsTeachersTable(rows);
}

/**
 * Update the period label shown in the page header.
 * @param {string} fromInput - date string yyyy-mm-dd or ""
 * @param {string} toInput   - date string yyyy-mm-dd or ""
 */
function updateStatsPeriodLabel(fromInput, toInput) {
  const el = maybeEl("statsPeriodLabel");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  if (!fromInput && !toInput) {
    el.classList.add("admin-hide");
    return;
  }
  const parts = [];
  if (fromInput) parts.push(fmt.format(new Date(`${fromInput}T12:00:00`)));
  if (toInput)   parts.push(fmt.format(new Date(`${toInput}T12:00:00`)));
  el.textContent = parts.join(" — ");
  el.classList.remove("admin-hide");
}

/**
 * Return { from, to } date strings for a named quick period.
 * @param {string} quick
 * @returns {{ from: string, to: string } | null}
 */
function getQuickPeriod(quick) {
  const now = new Date();
  switch (quick) {
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateInputValue(start), to: toDateInputValue(now) };
    }
    case "prev-month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateInputValue(start), to: toDateInputValue(end) };
    }
    case "3months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: toDateInputValue(start), to: toDateInputValue(now) };
    }
    case "6months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { from: toDateInputValue(start), to: toDateInputValue(now) };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toDateInputValue(start), to: toDateInputValue(now) };
    }
    default:
      return null;
  }
}

function initStatsRangeControls() {
  ensureStatsTeacherJournalWired();
  const form    = maybeEl("statsRangeForm");
  const fromEl  = maybeEl("statsDateFrom");
  const toEl    = maybeEl("statsDateTo");
  const resetBtn = maybeEl("statsRangeReset");
  if (!form || !fromEl || !toEl) return;

  const setActivePeriod = (from, to) => {
    fromEl.value = from;
    toEl.value   = to;
  };

  if (!fromEl.value && !toEl.value) {
    const p = getQuickPeriod("month");
    if (p) setActivePeriod(p.from, p.to);
  }

  const syncQuickBtnHighlight = () => {
    const quickBtns = document.querySelectorAll(".admin-stats-quick__btn");
    quickBtns.forEach((btn) => {
      const q = /** @type {HTMLElement} */ (btn).dataset.quick || "";
      const p = getQuickPeriod(q);
      const matches = p && p.from === fromEl.value && p.to === toEl.value;
      btn.classList.toggle("is-active", !!matches);
    });
  };

  syncQuickBtnHighlight();

  const quickContainer = document.getElementById("statsQuickBtns");
  quickContainer?.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest(".admin-stats-quick__btn");
    if (!btn) return;
    const quick = btn.dataset.quick || "";
    const p = getQuickPeriod(quick);
    if (!p) return;
    setActivePeriod(p.from, p.to);
    syncQuickBtnHighlight();
    clearDashMessages();
    await renderStatsDashboard();
  });

  fromEl.addEventListener("change", syncQuickBtnHighlight);
  toEl.addEventListener("change", syncQuickBtnHighlight);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    syncQuickBtnHighlight();
    clearDashMessages();
    await renderStatsDashboard();
  });

  resetBtn?.addEventListener("click", async () => {
    const p = getQuickPeriod("month");
    if (p) setActivePeriod(p.from, p.to);
    syncQuickBtnHighlight();
    clearDashMessages();
    await renderStatsDashboard();
  });
}

const ADMIN_NAV_DESKTOP_MQ = window.matchMedia("(min-width: 721px)");

function isAdminNavDesktop() {
  return ADMIN_NAV_DESKTOP_MQ.matches;
}

function syncAdminNavDesktopState() {
  const toggle = maybeEl("adminNavToggle");
  const drawer = maybeEl("adminNavDrawer");
  if (!drawer) return;
  if (isAdminNavDesktop()) {
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    drawer.classList.remove("is-open");
    if (!drawer.classList.contains("admin-hide")) {
      drawer.setAttribute("aria-hidden", "false");
    }
  } else if (!drawer.classList.contains("is-open")) {
    drawer.setAttribute("aria-hidden", "true");
  }
}

function closeAdminNavDrawer() {
  if (isAdminNavDesktop()) return;
  const toggle = maybeEl("adminNavToggle");
  const drawer = maybeEl("adminNavDrawer");
  const backdrop = maybeEl("adminNavBackdrop");
  if (!toggle || !drawer) return;
  toggle.setAttribute("aria-expanded", "false");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  if (backdrop) {
    backdrop.classList.add("admin-hide");
    backdrop.setAttribute("aria-hidden", "true");
  }
}

function openAdminNavDrawer() {
  if (isAdminNavDesktop()) return;
  const toggle = maybeEl("adminNavToggle");
  const drawer = maybeEl("adminNavDrawer");
  const backdrop = maybeEl("adminNavBackdrop");
  if (!toggle || !drawer) return;
  toggle.setAttribute("aria-expanded", "true");
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  if (backdrop) {
    backdrop.classList.remove("admin-hide");
    backdrop.setAttribute("aria-hidden", "false");
  }
}

function initAdminNavDrawer() {
  const toggle = maybeEl("adminNavToggle");
  const drawer = maybeEl("adminNavDrawer");
  const backdrop = maybeEl("adminNavBackdrop");
  if (!toggle || !drawer) return;

  toggle.addEventListener("click", () => {
    if (isAdminNavDesktop()) return;
    const open = toggle.getAttribute("aria-expanded") === "true";
    if (open) closeAdminNavDrawer();
    else openAdminNavDrawer();
  });

  backdrop?.addEventListener("click", () => closeAdminNavDrawer());

  drawer.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", () => closeAdminNavDrawer());
  });

  // Close after JS-rendered links are clicked (event delegation)
  drawer.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest("a[href]") : null);
    if (t && drawer.contains(t)) closeAdminNavDrawer();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAdminNavDrawer();
  });

  document.addEventListener("click", (e) => {
    if (isAdminNavDesktop() || !drawer.classList.contains("is-open")) return;
    const target = /** @type {Node | null} */ (e.target);
    if (target && !drawer.contains(target) && !toggle.contains(target) && !(backdrop && backdrop.contains(target))) {
      closeAdminNavDrawer();
    }
  });

  ADMIN_NAV_DESKTOP_MQ.addEventListener("change", syncAdminNavDesktopState);
  syncAdminNavDesktopState();
}

function showView(view) {
  if (authSection) authSection.classList.toggle("admin-hide", view !== "auth");
  if (blockedSection) blockedSection.classList.toggle("admin-hide", view !== "blocked");
  if (dashSection) dashSection.classList.toggle("admin-hide", view !== "dash");
  const dash = view === "dash";
  const jumps = maybeEl("adminNavJumps");
  const toggle = maybeEl("adminNavToggle");
  const drawer = maybeEl("adminNavDrawer");
  const drawerFooter = maybeEl("adminNavDrawerFooter");
  if (dash) renderAdminNavLinks();
  if (jumps) jumps.classList.toggle("admin-hide", !dash);
  if (toggle) toggle.classList.toggle("admin-hide", !dash);
  if (drawer) drawer.classList.toggle("admin-hide", !dash);
  if (drawerFooter) drawerFooter.classList.toggle("admin-hide", !dash);
  if (!dash) closeAdminNavDrawer();
  else syncAdminNavDesktopState();
}

async function isAdminUser(userId) {
  const { data, error } = await supabase.from("admin_allowlist").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
}

/** @type {object | null} */
let editingPlaceRow = null;
let placeModalsWired = false;

function closePlaceEditModal() {
  const modal = maybeEl("placeEditModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  if (maybeEl("placeLessonModal")?.classList.contains("admin-hide")) {
    document.body.classList.remove("admin-modal-open");
  }
  editingPlaceRow = null;
}

function closePlaceLessonModal() {
  const modal = maybeEl("placeLessonModal");
  if (!modal) return;
  modal.classList.add("admin-hide");
  modal.setAttribute("aria-hidden", "true");
  if (maybeEl("placeEditModal")?.classList.contains("admin-hide")) {
    document.body.classList.remove("admin-modal-open");
  }
}

function populatePlaceLessonTypeSelect() {
  const sel = maybeEl("placeLessonType");
  if (!sel) return;
  sel.innerHTML = "";
  for (const lt of cachedLessonTypes) {
    const opt = document.createElement("option");
    opt.value = lt.id;
    opt.textContent = lt.name || lt.slug;
    sel.appendChild(opt);
  }
  syncCustomSelect(sel);
}

function populatePlaceLessonDaySelect() {
  const sel = maybeEl("placeLessonDay");
  if (!sel) return;
  sel.innerHTML = DAYS_UK.map((d, i) => `<option value="${i}">${d}</option>`).join("");
  syncCustomSelect(sel);
}

function openPlaceEditModal(place) {
  const modal = maybeEl("placeEditModal");
  const titleEl = maybeEl("placeEditModalTitle");
  const idInput = maybeEl("placeEditId");
  const nameInput = maybeEl("placeEditName");
  const addressInput = maybeEl("placeEditAddress");
  const notesInput = maybeEl("placeEditNotes");
  const riverSel = maybeEl("placeEditRiver");
  if (!modal || !idInput || !nameInput || !addressInput || !notesInput) return;

  editingPlaceRow = place;
  idInput.value = place.id;
  if (titleEl) titleEl.textContent = place.name || "Місце";
  nameInput.value = place.name || "";
  addressInput.value = place.address || "";
  notesInput.value = place.notes || "";
  if (riverSel) {
    riverSel.value = place.river_bank || "";
    syncCustomSelect(riverSel);
  }

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  nameInput.focus();
}

function openPlaceLessonModal(place, lessonTime = null) {
  const modal = maybeEl("placeLessonModal");
  const titleEl = maybeEl("placeLessonModalTitle");
  const subEl = maybeEl("placeLessonModalSub");
  const placeIdInput = maybeEl("placeLessonPlaceId");
  const timeIdInput = maybeEl("placeLessonTimeId");
  const typeSel = maybeEl("placeLessonType");
  const daySel = maybeEl("placeLessonDay");
  const timeInput = maybeEl("placeLessonTime");
  const saveBtn = maybeEl("placeLessonSaveBtn");
  if (!modal || !placeIdInput || !timeIdInput || !typeSel || !daySel || !timeInput) return;

  populatePlaceLessonTypeSelect();
  populatePlaceLessonDaySelect();

  const isEdit = Boolean(lessonTime?.id);
  placeIdInput.value = place.id;
  timeIdInput.value = isEdit ? lessonTime.id : "";

  if (titleEl) titleEl.textContent = isEdit ? "Редагування заняття" : "Нове заняття";
  if (subEl) {
    subEl.textContent = [place.name, place.address].filter(Boolean).join(" · ");
  }
  if (saveBtn) saveBtn.textContent = isEdit ? "Оновити" : "Додати";

  if (isEdit) {
    typeSel.value = lessonTime.lesson_type_id || "";
    daySel.value = String(lessonTime.day_of_week ?? 0);
    timeInput.value = fmtTime(lessonTime.start_time);
  } else {
    typeSel.selectedIndex = 0;
    daySel.value = "0";
    timeInput.value = "";
  }
  syncCustomSelect(typeSel);
  syncCustomSelect(daySel);

  modal.classList.remove("admin-hide");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-modal-open");
  (isEdit ? timeInput : typeSel).focus();
}

function initPlaceModals() {
  if (placeModalsWired) return;
  const editModal = maybeEl("placeEditModal");
  const lessonModal = maybeEl("placeLessonModal");
  const editForm = maybeEl("placeEditForm");
  const lessonForm = maybeEl("placeLessonForm");
  if (!editModal && !lessonModal) return;
  placeModalsWired = true;

  const wireClose = (modal, closeFn) => {
    if (!modal) return;
    modal.querySelectorAll("[data-admin-modal-close]").forEach((node) => {
      node.addEventListener("click", () => closeFn());
    });
  };

  wireClose(editModal, closePlaceEditModal);
  wireClose(lessonModal, closePlaceLessonModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (editModal && !editModal.classList.contains("admin-hide")) closePlaceEditModal();
    else if (lessonModal && !lessonModal.classList.contains("admin-hide")) closePlaceLessonModal();
  });

  populatePlaceLessonDaySelect();

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearDashMessages();
      const id = maybeEl("placeEditId")?.value ?? "";
      const name = maybeEl("placeEditName")?.value.trim() ?? "";
      const address = maybeEl("placeEditAddress")?.value.trim() ?? "";
      const notes = maybeEl("placeEditNotes")?.value.trim() ?? "";
      const river_bank = maybeEl("placeEditRiver")?.value.trim() || null;
      if (!id || !name) {
        showDashError("Вкажи назву місця.");
        return;
      }
      const sort_order = editingPlaceRow?.sort_order ?? 0;
      const { error } = await supabase
        .from("places")
        .update({
          name,
          sort_order,
          address: address || null,
          notes: notes || null,
          river_bank,
        })
        .eq("id", id);
      if (error) {
        showDashError(error.message);
        return;
      }
      closePlaceEditModal();
      await loadPlacesHtml();
      showDashOk("Місце оновлено.");
    });
  }

  if (lessonForm) {
    lessonForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearDashMessages();
      const placeId = maybeEl("placeLessonPlaceId")?.value ?? "";
      const timeId = maybeEl("placeLessonTimeId")?.value ?? "";
      const lesson_type_id = maybeEl("placeLessonType")?.value ?? "";
      const day_of_week = parseInt(maybeEl("placeLessonDay")?.value ?? "0", 10);
      const tm = String(maybeEl("placeLessonTime")?.value ?? "").trim();
      const saveBtn = maybeEl("placeLessonSaveBtn");

      if (!placeId) {
        showDashError("Не знайдено місце.");
        return;
      }
      if (!lesson_type_id) {
        showDashError("Обери тип заняття.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(tm)) {
        showDashError("Обери час заняття.");
        return;
      }

      if (saveBtn) saveBtn.disabled = true;
      let error;
      if (timeId) {
        ({ error } = await supabase
          .from("lesson_times")
          .update({
            lesson_type_id,
            day_of_week,
            start_time: `${tm}:00`,
          })
          .eq("id", timeId));
      } else {
        ({ error } = await supabase.from("lesson_times").insert({
          place_id: placeId,
          lesson_type_id,
          day_of_week,
          start_time: `${tm}:00`,
        }));
      }
      if (saveBtn) saveBtn.disabled = false;

      if (error) {
        showDashError(error.message);
        return;
      }
      closePlaceLessonModal();
      await loadPlacesHtml();
      showDashOk(timeId ? "Слот оновлено." : "Заняття додано.");
    });
  }
}

async function loadPlacesHtml() {
  const placesList = maybeEl("placesList");
  if (!placesList) return;
  placesList.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  const { data: places, error } = await supabase
    .from("places")
    .select("*, lesson_times(*, lesson_types(id, slug, name))")
    .order("sort_order", { ascending: true });

  if (error) {
    placesList.innerHTML = "";
    showDashError(error.message);
    return;
  }

  for (const p of places) {
    if (Array.isArray(p.lesson_times)) {
      p.lesson_times.sort((a, b) => {
        const d = a.day_of_week - b.day_of_week;
        if (d !== 0) return d;
        const t = String(a.start_time).localeCompare(String(b.start_time));
        if (t !== 0) return t;
        return String(a.lesson_types?.slug || "").localeCompare(String(b.lesson_types?.slug || ""));
      });
    }
  }

  if (!places.length) {
    placesList.innerHTML = '<p class="admin-muted">Поки немає місць — додай перше вище.</p>';
    return;
  }

  const grid = document.createElement("div");
  grid.className = "place-cards";
  for (const p of places) {
    grid.appendChild(renderPlaceCard(p));
  }
  placesList.innerHTML = "";
  placesList.appendChild(grid);
}

function renderPlaceSlotCard(lt, place) {
  const card = document.createElement("article");
  card.className = "place-slot-card";
  card.dataset.lessonTimeId = lt.id;

  const row = document.createElement("div");
  row.className = "place-slot-card__row";

  const info = document.createElement("div");
  info.className = "place-slot-card__info";

  const whenEl = document.createElement("div");
  whenEl.className = "place-slot-card__when";
  const dowEl = document.createElement("span");
  dowEl.className = "place-slot-card__dow";
  dowEl.textContent = DAYS_SHORT_UK[lt.day_of_week] || "—";
  const timeEl = document.createElement("span");
  timeEl.className = "place-slot-card__time";
  timeEl.textContent = fmtTime(lt.start_time) || "—";
  whenEl.append(dowEl, timeEl);

  const typeEl = document.createElement("span");
  typeEl.className = "place-slot-card__type";
  const typeFull = lt.lesson_types?.name || lt.lesson_types?.slug || "—";
  typeEl.textContent = lessonTypeShortLabel(lt);
  typeEl.title = typeFull;

  info.append(whenEl, typeEl);

  const actions = document.createElement("div");
  actions.className = "place-slot-card__actions";
  actions.append(
    makeAdminIconBtn(
      "✏️",
      "Редагувати",
      "btn btn--ghost btn--sm place-slot-card__btn",
      () => openPlaceLessonModal(place, lt),
    ),
    makeAdminIconBtn(
      "✕",
      "Видалити",
      "btn btn--danger btn--sm place-slot-card__btn place-slot-card__btn--del",
      () => deleteLesson(lt.id),
    ),
  );

  row.append(info, actions);
  card.append(row);
  return card;
}

function renderPlaceCard(place) {
  const lessons = Array.isArray(place.lesson_times) ? place.lesson_times : [];

  const card = document.createElement("article");
  card.className = "place-card";
  card.dataset.placeId = place.id;

  const head = document.createElement("div");
  head.className = "place-card__head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "place-card__title-wrap";
  const titleEl = document.createElement("h3");
  titleEl.className = "place-card__title";
  titleEl.textContent = place.name || "Без назви";
  titleWrap.appendChild(titleEl);
  if (place.river_bank) {
    const bankEl = document.createElement("span");
    bankEl.className = "place-card__bank";
    bankEl.textContent = place.river_bank;
    titleWrap.appendChild(bankEl);
  }

  const headActions = document.createElement("div");
  headActions.className = "place-card__head-actions";
  headActions.append(
    makeAdminIconBtn(
      "✏️",
      "Редагувати місце",
      "btn btn--ghost btn--sm place-card__icon-btn",
      () => openPlaceEditModal(place),
    ),
    makeAdminIconBtn(
      "✕",
      "Видалити місце",
      "btn btn--danger btn--sm place-card__icon-btn place-card__icon-btn--del",
      () => deletePlace(place.id),
    ),
  );

  head.append(titleWrap, headActions);
  card.appendChild(head);

  const meta = document.createElement("div");
  meta.className = "place-card__meta";
  if (place.address) {
    const addrEl = document.createElement("span");
    addrEl.className = "place-card__meta-item place-card__meta-item--address";
    addrEl.textContent = place.address;
    addrEl.title = place.address;
    meta.appendChild(addrEl);
  }
  if (meta.childElementCount) card.appendChild(meta);

  if (place.notes) {
    const notesEl = document.createElement("p");
    notesEl.className = "place-card__notes";
    notesEl.textContent = place.notes;
    card.appendChild(notesEl);
  }

  const schedule = document.createElement("div");
  schedule.className = "place-card__schedule";

  const scheduleHead = document.createElement("div");
  scheduleHead.className = "place-card__schedule-head";
  const scheduleLabel = document.createElement("span");
  scheduleLabel.className = "place-card__schedule-label";
  scheduleLabel.textContent = "Розклад";
  const addBtn = makeAdminIconBtn(
    "+",
    "Додати заняття",
    "btn btn--ghost btn--sm place-card__add-btn",
    () => openPlaceLessonModal(place),
  );
  scheduleHead.append(scheduleLabel, addBtn);

  const slots = document.createElement("div");
  slots.className = "place-slot-cards";
  if (lessons.length === 0) {
    const empty = document.createElement("p");
    empty.className = "place-card__empty";
    empty.textContent = "Ще немає слотів";
    slots.appendChild(empty);
  } else {
    for (const lt of lessons) {
      slots.appendChild(renderPlaceSlotCard(lt, place));
    }
  }

  schedule.append(scheduleHead, slots);
  card.appendChild(schedule);
  return card;
}

async function deletePlace(id) {
  if (!confirm("Видалити це місце та всі його часи занять?")) return;
  clearDashMessages();
  const { error } = await supabase.from("places").delete().eq("id", id);
  if (error) {
    showDashError(error.message);
    return;
  }
  await loadPlacesHtml();
  showDashOk("Місце видалено.");
}

async function deleteLesson(lessonId) {
  if (!confirm("Видалити цей слот?")) return;
  clearDashMessages();
  const { error } = await supabase.from("lesson_times").delete().eq("id", lessonId);
  if (error) {
    showDashError(error.message);
    return;
  }
  await loadPlacesHtml();
  showDashOk("Слот видалено.");
}

const signInForm = maybeEl("signInForm");
if (signInForm) {
  signInForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthMessages();
    const email = maybeEl("email")?.value.trim() ?? "";
    const password = maybeEl("password")?.value ?? "";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showAuthError(error.message);
      return;
    }
    await routeAfterAuth(data.user);
  });
}

async function signUpWithCredentials(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    showAuthError(error.message);
    return;
  }
  if (data.user && !data.session) {
    showAuthOk("Реєстрація успішна. Перевір пошту для підтвердження (якщо увімкнено), потім увійди.");
    return;
  }
  if (data.user) {
    showAuthOk("Реєстрація успішна.");
    await routeAfterAuth(data.user);
  }
}

const registerBtn = maybeEl("registerBtn");
if (registerBtn) {
  registerBtn.addEventListener("click", async () => {
    clearAuthMessages();
    const email = maybeEl("email")?.value.trim() ?? "";
    const password = maybeEl("password")?.value ?? "";
    await signUpWithCredentials(email, password);
  });
}

const signUpForm = maybeEl("signUpForm");
if (signUpForm) {
  signUpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthMessages();
    const email = maybeEl("signupEmail")?.value.trim() ?? "";
    const password = maybeEl("signupPassword")?.value ?? "";
    await signUpWithCredentials(email, password);
  });
}

async function routeAfterAuth(user) {
  if (!user) {
    lastSuccessfulDashBootstrapUserId = null;
    if (isLoginPage) showView("auth");
    else location.href = "./index.html";
    return;
  }
  const allowed = await isAdminUser(user.id);
  if (!allowed) {
    lastSuccessfulDashBootstrapUserId = null;
    if (allowlistSnippet) {
      allowlistSnippet.textContent =
        `insert into public.admin_allowlist (user_id) values ('${user.id}');\n` +
        `-- один раз; далі онови сторінку або вийди й увійди знову.`;
    }
    showView("blocked");
    return;
  }
  clearDashMessages();

  if (isLoginPage) {
    lastSuccessfulDashBootstrapUserId = null;
    location.href = "./places.html";
    return;
  }

  showView("dash");
  if (lastSuccessfulDashBootstrapUserId === user.id) {
    return;
  }
  lastSuccessfulDashBootstrapUserId = user.id;
  await refreshDashboard();
}

initPlaceModals();

const placeFormEl = maybeEl("placeForm");
if (placeFormEl) {
  const placeFormToggle = maybeEl("placeFormToggle");
  const placeFormCancel = maybeEl("placeFormCancel");
  const placeRiverBank = maybeEl("placeRiverBank");
  const riverQuickButtons = placeFormEl.querySelectorAll("[data-river-quick]");

  const setPlaceFormOpen = (isOpen) => {
    placeFormEl.classList.toggle("admin-hide", !isOpen);
    if (placeFormToggle) {
      placeFormToggle.textContent = isOpen ? "Закрити форму" : "+ Нове місце";
      placeFormToggle.setAttribute("aria-expanded", String(isOpen));
    }
    if (isOpen) {
      maybeEl("placeName")?.focus();
    }
  };

  placeFormToggle?.addEventListener("click", () => {
    const isOpen = placeFormEl.classList.contains("admin-hide");
    setPlaceFormOpen(isOpen);
  });

  placeFormCancel?.addEventListener("click", () => {
    placeFormEl.reset();
    if (placeRiverBank) {
      placeRiverBank.value = "";
      syncCustomSelect(placeRiverBank);
    }
    setPlaceFormOpen(false);
  });

  for (const btn of riverQuickButtons) {
    btn.addEventListener("click", () => {
      if (!placeRiverBank) return;
      placeRiverBank.value = btn.dataset.riverQuick || "";
      syncCustomSelect(placeRiverBank);
    });
  }

  placeFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    const name = maybeEl("placeName")?.value.trim();
    const sort_order = 0;
    const address = maybeEl("placeAddress")?.value.trim() ?? "";
    const notes = maybeEl("placeNotes")?.value.trim() ?? "";
    const river_bank = maybeEl("placeRiverBank")?.value.trim() || null;
    const { error } = await supabase.from("places").insert({
      name,
      sort_order,
      address: address || null,
      notes: notes || null,
      river_bank,
    });
    if (error) {
      showDashError(error.message);
      return;
    }
    placeFormEl.reset();
    const rb = maybeEl("placeRiverBank");
    if (rb) {
      rb.value = "";
      syncCustomSelect(rb);
    }
    setPlaceFormOpen(false);
    await loadPlacesHtml();
    showDashOk("Місце збережено.");
  });
}

initPriceForm();
initSmmPriceForm();
initPlacePriceForm();
initTeacherForm();
initStatsRangeControls();

function wireSignOut(btn) {
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    if (isLoginPage) showView("auth");
    else location.href = "./index.html";
  });
}

initAdminNavDrawer();

wireSignOut(maybeEl("signOutBlocked"));
wireSignOut(maybeEl("adminNavSignOut"));

/** Skip duplicate bootstrap when `getSession` and `onAuthStateChange` both report the same user. */
let lastSuccessfulDashBootstrapUserId = null;

async function applySession(session) {
  if (!session?.user) {
    lastSuccessfulDashBootstrapUserId = null;
    if (isLoginPage) {
      showView("auth");
      clearAuthMessages();
    } else {
      location.href = "./index.html";
    }
    return;
  }
  await routeAfterAuth(session.user);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION") return;
  if (event === "TOKEN_REFRESHED") return;
  if (event === "SIGNED_OUT") {
    lastSuccessfulDashBootstrapUserId = null;
    if (isLoginPage) showView("auth");
    else location.href = "./index.html";
    return;
  }
  if (session?.user) applySession(session);
});

const {
  data: { session: initialSession },
} = await supabase.auth.getSession();
if (!isLoginPage && !initialSession?.user) {
  location.href = "./index.html";
} else {
  await applySession(initialSession ?? null);
}
