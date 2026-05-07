import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

/** 0 = Sunday … 6 = Saturday (Date.getDay) */
const DAYS_UK = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];

function maybeEl(id) {
  return document.getElementById(id);
}

function syncCustomSelect(selectEl) {
  if (!selectEl) return;
  if (window.CustomSelects?.refreshSelect) {
    window.CustomSelects.refreshSelect(selectEl);
  }
}

/** @type {"login"|"lesson-types"|"prices"|"places"|"teachers"|"lessons"|"stats"} */
const ADMIN_PAGE = /** @type {any} */ (document.body?.dataset.adminPage ?? "lesson-types");

const isLoginPage = ADMIN_PAGE === "login";

function fmtTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "";
  const part = timeStr.slice(0, 5);
  return part;
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
let lessonsBatchVoteWired = false;
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

function populateTeacherChatSelect(selectedChatId = "") {
  const sel = maybeEl("teacherChatTarget");
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

function setTeacherFormOpen(isOpen) {
  const form = maybeEl("teacherForm");
  const toggle = maybeEl("teacherFormToggle");
  if (!form) return;
  form.classList.toggle("admin-hide", !isOpen);
  if (toggle) {
    toggle.textContent = isOpen ? "Закрити форму" : "+ Новий викладач";
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function resetTeacherForm() {
  const form = maybeEl("teacherForm");
  const editingId = maybeEl("teacherEditingId");
  const submitBtn = maybeEl("teacherSubmitBtn");
  const cancelEdit = maybeEl("teacherCancelEdit");
  const descriptionWrap = maybeEl("teacherDescriptionWrap");
  const chatWrap = maybeEl("teacherChatWrap");
  const nameInput = maybeEl("teacherName");
  const descInput = maybeEl("teacherDescription");
  const chatSel = maybeEl("teacherChatTarget");
  if (!form || !editingId || !submitBtn || !nameInput || !descInput) return;
  editingTeacherId = null;
  editingId.value = "";
  nameInput.value = "";
  descInput.value = "";
  if (chatSel) chatSel.value = "";
  submitBtn.textContent = "Додати викладача";
  cancelEdit?.classList.add("admin-hide");
  descriptionWrap?.classList.add("admin-hide");
  chatWrap?.classList.add("admin-hide");
  setTeacherFormOpen(false);
}

async function beginEditTeacher(teacher) {
  const editingId = maybeEl("teacherEditingId");
  const submitBtn = maybeEl("teacherSubmitBtn");
  const cancelEdit = maybeEl("teacherCancelEdit");
  const descriptionWrap = maybeEl("teacherDescriptionWrap");
  const chatWrap = maybeEl("teacherChatWrap");
  const nameInput = maybeEl("teacherName");
  const descInput = maybeEl("teacherDescription");
  const chatSel = maybeEl("teacherChatTarget");
  if (!editingId || !submitBtn || !nameInput || !descInput) return;
  try {
    await loadPrivateTelegramTargets();
  } catch (error) {
    showDashError(error?.message || String(error));
    return;
  }
  editingTeacherId = teacher.id;
  editingId.value = teacher.id;
  nameInput.value = teacher.name || "";
  descInput.value = teacher.short_description || "";
  populateTeacherChatSelect(teacher.chat_id || "");
  if (chatSel && (!teacher.chat_id || chatSel.value !== teacher.chat_id)) chatSel.value = "";
  submitBtn.textContent = "Зберегти зміни";
  cancelEdit?.classList.remove("admin-hide");
  descriptionWrap?.classList.remove("admin-hide");
  chatWrap?.classList.remove("admin-hide");
  setTeacherFormOpen(true);
}

async function renderTeachersPanel() {
  const root = maybeEl("teachersList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  const { data: teachers, error } = await supabase
    .from("teachers")
    .select("id, name, short_description, sort_order, chat_id")
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
  tbl.innerHTML = `<thead><tr><th>Ім'я</th><th>Telegram</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const teacher of teachers) {
    const tr = document.createElement("tr");
    const tgUsername = teacher.chat_id ? tgByChatId.get(String(teacher.chat_id)) : null;
    const tgLabel = tgUsername ? `@${tgUsername}` : "—";
    tr.innerHTML = `<td>${escapeHtml(teacher.name || "—")}</td><td>${escapeHtml(tgLabel)}</td>`;
    const td = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost btn--sm";
    editBtn.style.padding = "6px 10px";
    editBtn.textContent = "Змінити";
    editBtn.addEventListener("click", () => beginEditTeacher(teacher));

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
      if (editingTeacherId === teacher.id) resetTeacherForm();
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

/** @type {{ id: string, name: string }[]} */
let cachedLessonTeachers = [];
/** @type {{ id: string, name: string }[]} */
let cachedLessonPlaces = [];

function makeNativeSelect() {
  const sel = document.createElement("select");
  sel.dataset.customSelectReady = "true";
  sel.style.cssText =
    "padding:6px 8px;border:1px solid var(--cream-mid);border-radius:6px;background:var(--cream-soft);font:inherit;color:inherit;max-width:100%;";
  return sel;
}

function makeNumberInput(value) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.value = String(Number.isFinite(value) ? value : 0);
  input.style.cssText =
    "width:64px;padding:6px 8px;border:1px solid var(--cream-mid);border-radius:6px;background:var(--cream-soft);font:inherit;color:inherit;";
  return input;
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

function renderLessonRowView(tr, row, onEdit, onDelete) {
  tr.innerHTML = "";
  const cells = [
    fmtKyivDateTime(row.starts_at),
    lessonTeacherLabel(row),
    lessonPlaceLabel(row),
    lessonTypeLabel(row),
    String(Number.isFinite(row.abon_count) ? row.abon_count : 0),
    String(Number.isFinite(row.single_visitors_count) ? row.single_visitors_count : 0),
    String(Number.isFinite(row.skip_visitors_count) ? row.skip_visitors_count : 0),
  ];
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  }

  const actionsTd = document.createElement("td");
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--ghost btn--sm";
  editBtn.style.padding = "6px 10px";
  editBtn.textContent = "Змінити";
  editBtn.addEventListener("click", () => onEdit());
  actionsTd.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn--danger btn--sm";
  delBtn.style.padding = "6px 10px";
  delBtn.style.marginLeft = "6px";
  delBtn.textContent = "✕";
  delBtn.title = "Видалити";
  delBtn.addEventListener("click", () => onDelete());
  actionsTd.appendChild(delBtn);
  tr.appendChild(actionsTd);
}

function renderLessonRowEdit(tr, row, onCancel, onSave) {
  tr.innerHTML = "";

  const timeTd = document.createElement("td");
  timeTd.textContent = fmtKyivDateTime(row.starts_at);
  tr.appendChild(timeTd);

  const teacherTd = document.createElement("td");
  const teacherSel = makeNativeSelect();
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "— не вибрано —";
  teacherSel.appendChild(noneOpt);
  for (const t of cachedLessonTeachers) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name || "—";
    teacherSel.appendChild(opt);
  }
  teacherSel.value = row.teachers?.id || "";
  teacherTd.appendChild(teacherSel);
  tr.appendChild(teacherTd);

  const placeTd = document.createElement("td");
  const placeSel = makeNativeSelect();
  const placeNone = document.createElement("option");
  placeNone.value = "";
  placeNone.textContent = "— не вибрано —";
  placeSel.appendChild(placeNone);
  for (const p of cachedLessonPlaces) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "—";
    placeSel.appendChild(opt);
  }
  placeSel.value = row.places?.id || "";
  placeTd.appendChild(placeSel);
  tr.appendChild(placeTd);

  const typeTd = document.createElement("td");
  typeTd.textContent = lessonTypeLabel(row);
  tr.appendChild(typeTd);

  const abonTd = document.createElement("td");
  const abonInput = makeNumberInput(row.abon_count);
  abonTd.appendChild(abonInput);
  tr.appendChild(abonTd);

  const singleTd = document.createElement("td");
  const singleInput = makeNumberInput(row.single_visitors_count);
  singleTd.appendChild(singleInput);
  tr.appendChild(singleTd);

  const skipTd = document.createElement("td");
  const skipInput = makeNumberInput(row.skip_visitors_count);
  skipTd.appendChild(skipInput);
  tr.appendChild(skipTd);

  const actionsTd = document.createElement("td");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary btn--sm";
  saveBtn.style.padding = "6px 10px";
  saveBtn.textContent = "Зберегти";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost btn--sm";
  cancelBtn.style.padding = "6px 10px";
  cancelBtn.style.marginLeft = "6px";
  cancelBtn.textContent = "Скасувати";
  cancelBtn.addEventListener("click", () => onCancel());

  saveBtn.addEventListener("click", async () => {
    const teacherId = teacherSel.value || null;
    const placeId = placeSel.value || null;
    const abon = parseInt(abonInput.value, 10);
    const single = parseInt(singleInput.value, 10);
    const skip = parseInt(skipInput.value, 10);
    if (!Number.isFinite(abon) || abon < 0 || !Number.isFinite(single) || single < 0 || !Number.isFinite(skip) || skip < 0) {
      showDashError("Кількості мають бути цілими ≥ 0.");
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    await onSave({
      teacher_id: teacherId,
      place_id: placeId,
      abon_count: abon,
      single_visitors_count: single,
      skip_visitors_count: skip,
    });
  });

  actionsTd.append(saveBtn, cancelBtn);
  tr.appendChild(actionsTd);
}

async function renderLessonsPanel() {
  const root = maybeEl("lessonsList");
  const paginationRoot = maybeEl("lessonsPagination");
  const openVotesRoot = maybeEl("openLessonVotesList");
  if (!root) return;
  ensureLessonsBatchVoteWired();
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  if (paginationRoot) paginationRoot.innerHTML = "";
  if (openVotesRoot) openVotesRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const [lessonsRes, teachersRes, placesRes, openVotesFetch] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        `id, starts_at, abon_count, single_visitors_count, skip_visitors_count,
         conducting_display_name, vote_finalized_at,
         teachers ( id, name ),
         places ( id, name, address ),
         lesson_times ( id, start_time, day_of_week, lesson_types ( id, name, slug ) )`,
      )
      .order("starts_at", { ascending: false, nullsFirst: false }),
    supabase.from("teachers").select("id, name").order("sort_order", { ascending: true }),
    supabase.from("places").select("id, name").order("sort_order", { ascending: true }),
    fetch("/api/admin/lesson-votes/open"),
  ]);

  if (lessonsRes.error) {
    root.innerHTML = `<p class="admin-muted">${escapeHtml(lessonsRes.error.message)}</p>`;
    return;
  }
  if (teachersRes.error) {
    root.innerHTML = `<p class="admin-muted">${escapeHtml(teachersRes.error.message)}</p>`;
    return;
  }
  if (placesRes.error) {
    root.innerHTML = `<p class="admin-muted">${escapeHtml(placesRes.error.message)}</p>`;
    return;
  }
  let openVotes = [];
  if (openVotesFetch.ok) {
    const body = await openVotesFetch.json().catch(() => ({}));
    if (body?.ok && Array.isArray(body.rows)) {
      openVotes = body.rows;
    } else if (openVotesRoot) {
      openVotesRoot.innerHTML = `<p class="admin-muted">${escapeHtml(body?.error || `Помилка ${openVotesFetch.status}`)}</p>`;
    }
  } else if (openVotesRoot) {
    openVotesRoot.innerHTML = `<p class="admin-muted">Помилка ${openVotesFetch.status}</p>`;
  }

  cachedLessonTeachers = teachersRes.data || [];
  cachedLessonPlaces = placesRes.data || [];
  const lessons = lessonsRes.data || [];
  const totalPages = Math.max(1, Math.ceil(lessons.length / LESSONS_PAGE_SIZE));
  lessonsPage = Math.min(Math.max(1, lessonsPage), totalPages);

  root.innerHTML = "";
  if (!lessons.length) {
    root.innerHTML = '<p class="admin-muted">Поки немає закритих голосувань.</p>';
  } else {
    const pageStart = (lessonsPage - 1) * LESSONS_PAGE_SIZE;
    const pageRows = lessons.slice(pageStart, pageStart + LESSONS_PAGE_SIZE);
    const tbl = document.createElement("table");
    tbl.className = "admin-prices-table";
    tbl.innerHTML = `<thead><tr>
        <th>Час</th>
        <th>Викладач</th>
        <th>Місце</th>
        <th>Напрям</th>
        <th>Абон</th>
        <th>Разове</th>
        <th>Пропуск</th>
        <th></th>
      </tr></thead><tbody></tbody>`;
    const tbody = tbl.querySelector("tbody");

    for (const row of pageRows) {
      const tr = document.createElement("tr");

      const enterView = () => {
        renderLessonRowView(
          tr,
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
            showDashOk("Запис заняття (і пов'язане голосування) видалено.");
          },
        );
      };

      const enterEdit = () => {
        renderLessonRowEdit(
          tr,
          row,
          () => enterView(),
          async (payload) => {
            clearDashMessages();
            const { data: updated, error: updErr } = await supabase
              .from("lessons")
              .update(payload)
              .eq("id", row.id)
              .select(
                `id, starts_at, abon_count, single_visitors_count, skip_visitors_count,
                 conducting_display_name, vote_finalized_at,
                 teachers ( id, name ),
                 places ( id, name, address ),
                 lesson_times ( id, start_time, day_of_week, lesson_types ( id, name, slug ) )`,
              )
              .single();
            if (updErr) {
              showDashError(updErr.message);
              enterEdit();
              return;
            }
            Object.assign(row, updated);
            enterView();
            showDashOk("Запис оновлено.");
          },
        );
      };

      enterView();
      tbody.appendChild(tr);
    }

    const wrap = document.createElement("div");
    wrap.className = "prices-table-wrap";
    wrap.appendChild(tbl);
    root.appendChild(wrap);
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

  if (openVotesRoot) {
    openVotesRoot.innerHTML = "";
    if (!openVotes.length) {
      openVotesRoot.innerHTML = '<p class="admin-muted">Немає відкритих голосувань.</p>';
    } else {
      const tbl = document.createElement("table");
      tbl.className = "admin-prices-table";
      tbl.innerHTML = `<thead><tr>
          <th>Час</th>
          <th>Викладач</th>
          <th>Місце</th>
          <th>Напрям</th>
          <th>Абон</th>
          <th>Разове</th>
          <th>Пропуск</th>
          <th></th>
        </tr></thead><tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      const voteCount = (snapshot, key) => {
        const group = snapshot && typeof snapshot === "object" ? snapshot[key] : null;
        if (!group || typeof group !== "object") return 0;
        return Object.keys(group).length;
      };

      for (const vote of openVotes) {
        const tr = document.createElement("tr");
        const snap = vote.lesson_snapshot && typeof vote.lesson_snapshot === "object" ? vote.lesson_snapshot : {};
        const cells = [
          fmtKyivDateTime(vote.occurrence_at),
          vote.conducting_display_name?.trim() || "—",
          snap.placeLabel || "—",
          snap.lessonTypeLabel || "—",
          String(voteCount(vote.votes_snapshot, "abon")),
          String(voteCount(vote.votes_snapshot, "single")),
          String(voteCount(vote.votes_snapshot, "skip")),
        ];
        for (const text of cells) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        }

        const actionsTd = document.createElement("td");
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn btn--danger btn--sm";
        closeBtn.style.padding = "6px 10px";
        closeBtn.textContent = "Закрити";
        closeBtn.addEventListener("click", async () => {
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
            await renderLessonsPanel();
          } catch (err) {
            showDashError(err?.message || String(err));
            closeBtn.disabled = false;
          }
        });
        actionsTd.appendChild(closeBtn);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      }

      const wrap = document.createElement("div");
      wrap.className = "prices-table-wrap";
      wrap.appendChild(tbl);
      openVotesRoot.appendChild(wrap);
    }
  }
}

function ensureLessonsBatchVoteWired() {
  if (lessonsBatchVoteWired) return;
  const btn = maybeEl("lessonsBatchVoteBtn");
  if (!btn) return;
  lessonsBatchVoteWired = true;

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
      await renderLessonsPanel();
    } catch (err) {
      showDashError(err?.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
}

function initTeacherForm() {
  const form = maybeEl("teacherForm");
  if (!form) return;
  const toggle = maybeEl("teacherFormToggle");
  const cancel = maybeEl("teacherFormCancel");
  const cancelEdit = maybeEl("teacherCancelEdit");
  form.noValidate = true;

  toggle?.addEventListener("click", () => setTeacherFormOpen(form.classList.contains("admin-hide")));
  cancel?.addEventListener("click", () => resetTeacherForm());
  cancelEdit?.addEventListener("click", () => resetTeacherForm());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    const name = maybeEl("teacherName")?.value.trim() ?? "";
    const short_description = maybeEl("teacherDescription")?.value.trim() ?? "";
    if (!name) {
      showDashError("Вкажи ім'я викладача.");
      return;
    }

    const id = maybeEl("teacherEditingId")?.value ?? "";
    const selectedChatId = maybeEl("teacherChatTarget")?.value?.trim() ?? "";
    const validSelectedChatId =
      selectedChatId && cachedPrivateTelegramTargets.some((row) => row.chat_id === selectedChatId && row.username?.trim())
        ? selectedChatId
        : null;
    const payload = id
      ? { name, short_description: short_description || null, chat_id: validSelectedChatId }
      : { name, short_description: null, chat_id: null };
    let dbError;
    if (id) {
      const { error } = await supabase.from("teachers").update(payload).eq("id", id);
      dbError = error;
    } else {
      const { error } = await supabase.from("teachers").insert(payload);
      dbError = error;
    }

    if (dbError) {
      showDashError(dbError.message);
      return;
    }
    resetTeacherForm();
    await renderTeachersPanel();
    showDashOk(id ? "Викладача оновлено." : "Викладача додано.");
  });
}

function setPriceFormOpen(isOpen) {
  const form = maybeEl("priceForm");
  const toggle = maybeEl("priceFormToggle");
  if (!form) return;
  form.classList.toggle("admin-hide", !isOpen);
  if (toggle) {
    toggle.textContent = isOpen ? "Закрити форму" : "+ Нова ціна";
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
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

function resetPriceForm() {
  if (!maybeEl("priceForm")) return;
  editingPriceId = null;
  const priceEditingId = maybeEl("priceEditingId");
  const priceSubmitBtn = maybeEl("priceSubmitBtn");
  const priceCancelEdit = maybeEl("priceCancelEdit");
  const priceKindSingle = maybeEl("priceKindSingle");
  const priceAmount = maybeEl("priceAmount");
  const priceVisits = maybeEl("priceVisits");
  if (!priceEditingId || !priceSubmitBtn || !priceKindSingle || !priceAmount || !priceVisits) return;
  priceEditingId.value = "";
  priceSubmitBtn.textContent = "Додати ціну";
  if (priceCancelEdit) priceCancelEdit.classList.add("admin-hide");
  priceKindSingle.checked = true;
  priceAmount.value = "";
  priceVisits.value = "8";
  populatePriceLessonTypeSelect();
  refreshPriceKindUI();
  setPriceFormOpen(false);
}

function beginEditPrice(p) {
  if (!maybeEl("priceForm")) return;
  editingPriceId = p.id;
  const priceEditingId = maybeEl("priceEditingId");
  const priceSubmitBtn = maybeEl("priceSubmitBtn");
  const priceCancelEdit = maybeEl("priceCancelEdit");
  const ltSel = maybeEl("priceLessonType");
  const kSingle = maybeEl("priceKindSingle");
  const kAbon = maybeEl("priceKindAbon");
  const priceVisits = maybeEl("priceVisits");
  const priceAmount = maybeEl("priceAmount");
  if (!priceEditingId || !priceSubmitBtn || !ltSel || !kSingle || !kAbon || !priceVisits || !priceAmount) return;
  setPriceFormOpen(true);
  priceEditingId.value = p.id;
  priceSubmitBtn.textContent = "Зберегти зміни";
  if (priceCancelEdit) priceCancelEdit.classList.remove("admin-hide");
  populatePriceLessonTypeSelect();
  ltSel.value = p.lesson_type_id;
  syncCustomSelect(ltSel);
  kSingle.checked = p.price_kind === "single";
  kAbon.checked = p.price_kind === "abon";
  priceVisits.value = String(p.visits_count || 8);
  priceAmount.value = String(p.amount_uah);
  refreshPriceKindUI();
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

  const tbl = document.createElement("table");
  tbl.className = "admin-prices-table";
  tbl.innerHTML = `<thead><tr>
    <th>Напрям</th><th>Тип</th><th>Занять</th><th>₴</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const row of sorted) {
    const tr = document.createElement("tr");
    const tn = row.lesson_types?.name || "—";
    const kindUk = row.price_kind === "single" ? "Разове" : "Абонемент";
    const visits = row.price_kind === "single" ? "1" : `${row.visits_count} у пакеті`;
    tr.innerHTML = `<td>${escapeHtml(tn)}</td><td>${kindUk}</td><td>${visits}</td><td>${row.amount_uah}</td>`;
    const td = document.createElement("td");

    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "btn btn--ghost btn--sm";
    ed.style.padding = "6px 10px";
    ed.textContent = "Змінити";
    ed.addEventListener("click", () => beginEditPrice(row));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger btn--sm";
    del.style.padding = "6px 10px";
    del.style.marginLeft = "6px";
    del.textContent = "✕";
    del.title = "Видалити";
    del.addEventListener("click", async () => {
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
    });

    td.append(ed, del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "prices-table-wrap";
  wrap.appendChild(tbl);
  root.innerHTML = "";
  root.appendChild(wrap);
}

function fmtSmmPeopleRange(minPeople, maxPeople) {
  const minVal = Number(minPeople) || 0;
  const maxVal = Number(maxPeople) || null;
  if (!maxVal) return `${minVal}+`;
  if (minVal === maxVal) return `${minVal}`;
  return `${minVal}-${maxVal}`;
}

function setSmmPriceFormOpen(isOpen) {
  const form = maybeEl("smmPriceForm");
  const toggle = maybeEl("smmPriceFormToggle");
  if (!form) return;
  form.classList.toggle("admin-hide", !isOpen);
  if (toggle) {
    toggle.textContent = isOpen ? "Закрити форму" : "+ Нова ціна";
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function resetSmmPriceForm() {
  if (!maybeEl("smmPriceForm")) return;
  editingSmmPriceId = null;
  const editingId = maybeEl("smmPriceEditingId");
  const submitBtn = maybeEl("smmPriceSubmitBtn");
  const cancelEdit = maybeEl("smmPriceCancelEdit");
  const peopleFrom = maybeEl("smmPricePeopleFrom");
  const peopleTo = maybeEl("smmPricePeopleTo");
  const amount = maybeEl("smmPriceAmount");
  if (!editingId || !submitBtn || !peopleFrom || !peopleTo || !amount) return;
  editingId.value = "";
  peopleFrom.value = "";
  peopleTo.value = "";
  amount.value = "";
  submitBtn.textContent = "Додати ціну";
  cancelEdit?.classList.add("admin-hide");
  setSmmPriceFormOpen(false);
}

function beginEditSmmPrice(row) {
  const editingId = maybeEl("smmPriceEditingId");
  const submitBtn = maybeEl("smmPriceSubmitBtn");
  const cancelEdit = maybeEl("smmPriceCancelEdit");
  const peopleFrom = maybeEl("smmPricePeopleFrom");
  const peopleTo = maybeEl("smmPricePeopleTo");
  const amount = maybeEl("smmPriceAmount");
  if (!editingId || !submitBtn || !peopleFrom || !peopleTo || !amount) return;
  editingSmmPriceId = row.id;
  editingId.value = row.id;
  peopleFrom.value = String(row.people_from ?? "");
  peopleTo.value = row.people_to == null ? "" : String(row.people_to);
  amount.value = String(row.amount_uah ?? 0);
  submitBtn.textContent = "Зберегти зміни";
  cancelEdit?.classList.remove("admin-hide");
  setSmmPriceFormOpen(true);
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

  const tbl = document.createElement("table");
  tbl.className = "admin-prices-table";
  tbl.innerHTML = `<thead><tr><th>К-сть людей</th><th>₴</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(fmtSmmPeopleRange(row.people_from, row.people_to))}</td><td>${row.amount_uah}</td>`;
    const td = document.createElement("td");

    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "btn btn--ghost btn--sm";
    ed.style.padding = "6px 10px";
    ed.textContent = "Змінити";
    ed.addEventListener("click", () => beginEditSmmPrice(row));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger btn--sm";
    del.style.padding = "6px 10px";
    del.style.marginLeft = "6px";
    del.textContent = "✕";
    del.title = "Видалити";
    del.addEventListener("click", async () => {
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
    });

    td.append(ed, del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "prices-table-wrap";
  wrap.appendChild(tbl);
  root.innerHTML = "";
  root.appendChild(wrap);
}

function fmtPlacePriceDuration(durationMinutes) {
  const d = Number(durationMinutes);
  if (d === 90) return "1.5 години";
  return "1 година";
}

function setPlacePriceFormOpen(isOpen) {
  const form = maybeEl("placePriceForm");
  const toggle = maybeEl("placePriceFormToggle");
  if (!form) return;
  form.classList.toggle("admin-hide", !isOpen);
  if (toggle) {
    toggle.textContent = isOpen ? "Закрити форму" : "+ Новий тариф";
    toggle.setAttribute("aria-expanded", String(isOpen));
  }
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

function resetPlacePriceForm() {
  if (!maybeEl("placePriceForm")) return;
  editingPlacePriceId = null;
  const editingId = maybeEl("placePriceEditingId");
  const submitBtn = maybeEl("placePriceSubmitBtn");
  const cancelEdit = maybeEl("placePriceCancelEdit");
  const duration = maybeEl("placePriceDuration");
  const amount = maybeEl("placePriceAmount");
  if (!editingId || !submitBtn || !duration || !amount) return;
  editingId.value = "";
  amount.value = "";
  duration.value = "60";
  submitBtn.textContent = "Додати тариф";
  cancelEdit?.classList.add("admin-hide");
  populatePlacePricePlaceSelect();
  setPlacePriceFormOpen(false);
}

function beginEditPlacePrice(row) {
  const editingId = maybeEl("placePriceEditingId");
  const submitBtn = maybeEl("placePriceSubmitBtn");
  const cancelEdit = maybeEl("placePriceCancelEdit");
  const placeSel = maybeEl("placePricePlaceId");
  const duration = maybeEl("placePriceDuration");
  const amount = maybeEl("placePriceAmount");
  if (!editingId || !submitBtn || !placeSel || !duration || !amount) return;

  editingPlacePriceId = row.id;
  editingId.value = row.id;
  submitBtn.textContent = "Зберегти зміни";
  cancelEdit?.classList.remove("admin-hide");
  populatePlacePricePlaceSelect(row.place_id);
  duration.value = String(row.duration_minutes || 60);
  amount.value = String(row.amount_uah ?? 0);
  setPlacePriceFormOpen(true);
}

async function renderPlacePricesPanel() {
  const root = maybeEl("placePricesList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const [{ data: places, error: placesError }, { data: rows, error: pricesError }] = await Promise.all([
    supabase.from("places").select("id, name").order("sort_order", { ascending: true }),
    supabase
      .from("places_prices")
      .select("id, place_id, duration_minutes, amount_uah, places(name)")
      .order("created_at", { ascending: true }),
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

  const sorted = [...(rows || [])].sort((a, b) => {
    const placeA = (a.places?.name || "").toLowerCase();
    const placeB = (b.places?.name || "").toLowerCase();
    if (placeA !== placeB) return placeA.localeCompare(placeB, "uk");
    return (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0);
  });

  if (!sorted.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає тарифів оренди.</p>';
    return;
  }

  const tbl = document.createElement("table");
  tbl.className = "admin-prices-table";
  tbl.innerHTML = `<thead><tr><th>Місце</th><th>Тривалість</th><th>₴</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const row of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(row.places?.name || "—")}</td><td>${fmtPlacePriceDuration(row.duration_minutes)}</td><td>${row.amount_uah}</td>`;
    const td = document.createElement("td");

    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "btn btn--ghost btn--sm";
    ed.style.padding = "6px 10px";
    ed.textContent = "Змінити";
    ed.addEventListener("click", () => beginEditPlacePrice(row));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger btn--sm";
    del.style.padding = "6px 10px";
    del.style.marginLeft = "6px";
    del.textContent = "✕";
    del.title = "Видалити";
    del.addEventListener("click", async () => {
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
    });

    td.append(ed, del);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const wrap = document.createElement("div");
  wrap.className = "prices-table-wrap";
  wrap.appendChild(tbl);
  root.innerHTML = "";
  root.appendChild(wrap);
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function initPriceForm() {
  const form = maybeEl("priceForm");
  if (!form) return;
  // We validate in JS to avoid native validation conflicts with custom-select UI.
  form.noValidate = true;
  const toggle = maybeEl("priceFormToggle");
  const cancel = maybeEl("priceFormCancel");
  document.querySelectorAll('input[name="priceKind"]').forEach((r) => r.addEventListener("change", refreshPriceKindUI));
  refreshPriceKindUI();

  const cancelEdit = maybeEl("priceCancelEdit");
  if (cancelEdit) cancelEdit.addEventListener("click", () => resetPriceForm());
  toggle?.addEventListener("click", () => setPriceFormOpen(form.classList.contains("admin-hide")));
  cancel?.addEventListener("click", () => resetPriceForm());

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
    setPriceFormOpen(false);
    await renderPricesPanel();
    showDashOk(id ? "Ціну оновлено." : "Ціну додано.");
  });
}

function initSmmPriceForm() {
  const form = maybeEl("smmPriceForm");
  if (!form) return;
  form.noValidate = true;
  const toggle = maybeEl("smmPriceFormToggle");
  const cancel = maybeEl("smmPriceFormCancel");
  const cancelEdit = maybeEl("smmPriceCancelEdit");
  toggle?.addEventListener("click", () => setSmmPriceFormOpen(form.classList.contains("admin-hide")));
  cancel?.addEventListener("click", () => resetSmmPriceForm());
  cancelEdit?.addEventListener("click", () => resetSmmPriceForm());

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
    await renderSmmPricesPanel();
    showDashOk(id ? "SMM прайс оновлено." : "SMM прайс додано.");
  });
}

function initPlacePriceForm() {
  const form = maybeEl("placePriceForm");
  if (!form) return;
  form.noValidate = true;
  const toggle = maybeEl("placePriceFormToggle");
  const cancel = maybeEl("placePriceFormCancel");
  const cancelEdit = maybeEl("placePriceCancelEdit");
  toggle?.addEventListener("click", () => setPlacePriceFormOpen(form.classList.contains("admin-hide")));
  cancel?.addEventListener("click", () => resetPlacePriceForm());
  cancelEdit?.addEventListener("click", () => resetPlacePriceForm());

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

    const payload = { place_id, duration_minutes, amount_uah };
    const id = maybeEl("placePriceEditingId")?.value ?? "";
    let errRow;
    if (id) {
      const { error } = await supabase.from("places_prices").update(payload).eq("id", id);
      errRow = error;
    } else {
      const { error } = await supabase.from("places_prices").insert(payload);
      errRow = error;
    }
    if (errRow) {
      showDashError(errRow.message);
      return;
    }

    resetPlacePriceForm();
    await renderPlacePricesPanel();
    showDashOk(id ? "Тариф оренди оновлено." : "Тариф оренди додано.");
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
        await loadPlacesHtml();
        break;
      case "teachers":
        resetTeacherForm();
        await renderTeachersPanel();
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

function pickSmmAmount(rows, peopleCount) {
  const people = Math.max(0, Number(peopleCount) || 0);
  for (const row of rows) {
    const from = Number(row.people_from) || 0;
    const to = row.people_to == null ? null : Number(row.people_to) || 0;
    if (people < from) continue;
    if (to != null && people > to) continue;
    return Number(row.amount_uah) || 0;
  }
  return 0;
}

function buildPriceByType(pricesRows) {
  /** @type {Map<string, {single: number, abonUnit: number}>} */
  const map = new Map();
  for (const row of pricesRows || []) {
    const lessonTypeId = String(row.lesson_type_id || "");
    if (!lessonTypeId) continue;
    const amount = Number(row.amount_uah) || 0;
    const visits = Math.max(1, Number(row.visits_count) || 1);
    const current = map.get(lessonTypeId) || { single: 0, abonUnit: 0 };
    if (row.price_kind === "single") {
      current.single = amount;
    } else if (row.price_kind === "abon") {
      const unit = amount / visits;
      if (!current.abonUnit || unit < current.abonUnit) current.abonUnit = unit;
    }
    map.set(lessonTypeId, current);
  }
  return map;
}

async function renderStatsDashboard() {
  const cardsRoot = maybeEl("statsSummaryCards");
  const chartRoot = maybeEl("statsChart");
  const tableRoot = maybeEl("statsTeachersTable");
  if (!cardsRoot || !chartRoot || !tableRoot) return;
  cardsRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  chartRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  tableRoot.innerHTML = '<p class="admin-muted">Завантаження…</p>';

  const fromInput = maybeEl("statsDateFrom")?.value?.trim() || "";
  const toInput = maybeEl("statsDateTo")?.value?.trim() || "";
  const fromIso = startOfDayIso(fromInput);
  const toIso = endOfDayIso(toInput);
  if (fromInput && !fromIso) {
    showDashError("Некоректна дата «від».");
    return;
  }
  if (toInput && !toIso) {
    showDashError("Некоректна дата «до».");
    return;
  }
  if (fromInput && toInput && fromInput > toInput) {
    showDashError("Дата «від» має бути не пізніше за «до».");
    return;
  }

  let lessonsQuery = supabase
    .from("lessons")
    .select(
      "id, starts_at, abon_count, single_visitors_count, conducting_display_name, place_id, teachers(id, name), lesson_times(lesson_types(id, name, slug))",
    );
  if (fromIso) lessonsQuery = lessonsQuery.gte("starts_at", fromIso);
  if (toIso) lessonsQuery = lessonsQuery.lte("starts_at", toIso);

  const [lessonsRes, pricesRes, smmRes, placePricesRes, lessonTypesRes] = await Promise.all([
    lessonsQuery,
    supabase.from("prices").select("lesson_type_id, price_kind, visits_count, amount_uah"),
    supabase.from("smm_prices").select("people_from, people_to, amount_uah").order("people_from", { ascending: true }),
    supabase.from("places_prices").select("place_id, duration_minutes, amount_uah"),
    supabase.from("lesson_types").select("id, duration_minutes, name, slug"),
  ]);

  if (lessonsRes.error || pricesRes.error || smmRes.error || placePricesRes.error || lessonTypesRes.error) {
    const msg =
      lessonsRes.error?.message ||
      pricesRes.error?.message ||
      smmRes.error?.message ||
      placePricesRes.error?.message ||
      lessonTypesRes.error?.message ||
      "Не вдалося завантажити статистику.";
    cardsRoot.innerHTML = `<p class="admin-muted">${escapeHtml(msg)}</p>`;
    chartRoot.innerHTML = "";
    tableRoot.innerHTML = "";
    return;
  }

  const priceByType = buildPriceByType(pricesRes.data || []);
  const smmRows = smmRes.data || [];
  const placePriceMap = new Map((placePricesRes.data || []).map((row) => [`${row.place_id}:${row.duration_minutes}`, Number(row.amount_uah) || 0]));
  const lessonTypeById = new Map((lessonTypesRes.data || []).map((row) => [String(row.id), row]));

  /** @type {Map<string, {name: string, lessonsCount: number, peopleCount: number, revenue: number, rent: number, smm: number, payout: number}>} */
  const byTeacher = new Map();

  for (const row of lessonsRes.data || []) {
    const lessonType = row.lesson_times?.lesson_types || null;
    const lessonTypeId = String(lessonType?.id || "");
    const singleCount = Math.max(0, Number(row.single_visitors_count) || 0);
    const abonCount = Math.max(0, Number(row.abon_count) || 0);
    const peopleCount = singleCount + abonCount;

    const prices = priceByType.get(lessonTypeId) || { single: 0, abonUnit: 0 };
    const revenue = singleCount * prices.single + abonCount * prices.abonUnit;

    const lessonTypeCfg = lessonTypeById.get(lessonTypeId);
    const duration = Number(lessonTypeCfg?.duration_minutes) || 60;
    const placeId = String(row.place_id || "");
    const rent = placePriceMap.get(`${placeId}:${duration}`) ?? placePriceMap.get(`${placeId}:60`) ?? 0;
    const smm = pickSmmAmount(smmRows, peopleCount);
    const payout = revenue - rent - smm;

    const teacherName =
      row.teachers?.name?.trim() ||
      String(row.conducting_display_name || "").trim() ||
      "Без викладача";
    const teacherKey = String(row.teachers?.id || teacherName);
    const agg = byTeacher.get(teacherKey) || {
      name: teacherName,
      lessonsCount: 0,
      peopleCount: 0,
      revenue: 0,
      rent: 0,
      smm: 0,
      payout: 0,
    };
    agg.lessonsCount += 1;
    agg.peopleCount += peopleCount;
    agg.revenue += revenue;
    agg.rent += rent;
    agg.smm += smm;
    agg.payout += payout;
    byTeacher.set(teacherKey, agg);
  }

  const rows = [...byTeacher.values()].sort((a, b) => b.payout - a.payout);
  const totalLessons = rows.reduce((sum, row) => sum + row.lessonsCount, 0);
  const totalPayout = rows.reduce((sum, row) => sum + row.payout, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalRent = rows.reduce((sum, row) => sum + row.rent, 0);
  const totalSmm = rows.reduce((sum, row) => sum + row.smm, 0);
  const totalPeople = rows.reduce((sum, row) => sum + row.peopleCount, 0);
  const totalNetAfterRent = totalRevenue - totalRent;

  cardsRoot.innerHTML = `
    <div class="admin-stats-card"><div class="admin-stats-card__label">Проведено занять</div><div class="admin-stats-card__value">${totalLessons}</div></div>
    <div class="admin-stats-card"><div class="admin-stats-card__label">Всього людей</div><div class="admin-stats-card__value">${totalPeople}</div></div>
    <div class="admin-stats-card"><div class="admin-stats-card__label">Чистий після оренди</div><div class="admin-stats-card__value">${fmtMoney(totalNetAfterRent)}</div></div>
    <div class="admin-stats-card"><div class="admin-stats-card__label">Загальні SMM витрати</div><div class="admin-stats-card__value">${fmtMoney(totalSmm)}</div></div>
  `;

  if (!rows.length) {
    chartRoot.innerHTML = '<p class="admin-muted">Ще немає проведених занять для розрахунку.</p>';
    tableRoot.innerHTML = '<p class="admin-muted">Немає даних.</p>';
    return;
  }

  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.payout)));
  chartRoot.innerHTML = "";
  for (const row of rows) {
    const bar = document.createElement("div");
    bar.className = "admin-stats-bar";
    const pct = Math.max(4, Math.round((Math.abs(row.payout) / maxAbs) * 100));
    const barColor = row.payout >= 0 ? "linear-gradient(90deg, #74862f 0%, #9db458 100%)" : "linear-gradient(90deg, #d97777 0%, #c04f4f 100%)";
    bar.innerHTML = `
      <div class="admin-stats-bar__name">${escapeHtml(row.name)}</div>
      <div class="admin-stats-bar__track"><div class="admin-stats-bar__fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="admin-stats-bar__value">${fmtMoney(row.payout)}</div>
    `;
    chartRoot.appendChild(bar);
  }

  const table = document.createElement("table");
  table.className = "admin-prices-table";
  table.innerHTML = `<thead><tr>
    <th>Викладач</th>
    <th>Уроків</th>
    <th>Людей</th>
    <th>Виручка</th>
    <th>Оренда</th>
    <th>SMM</th>
    <th>Виплата</th>
  </tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${row.lessonsCount}</td>
      <td>${row.peopleCount}</td>
      <td>${fmtMoney(row.revenue)}</td>
      <td>${fmtMoney(row.rent)}</td>
      <td>${fmtMoney(row.smm)}</td>
      <td>${fmtMoney(row.payout)}</td>
    `;
    tbody.appendChild(tr);
  }
  const wrap = document.createElement("div");
  wrap.className = "prices-table-wrap";
  wrap.appendChild(table);
  tableRoot.innerHTML = "";
  tableRoot.appendChild(wrap);
}

function initStatsRangeControls() {
  const form = maybeEl("statsRangeForm");
  const fromEl = maybeEl("statsDateFrom");
  const toEl = maybeEl("statsDateTo");
  const resetBtn = maybeEl("statsRangeReset");
  if (!form || !fromEl || !toEl) return;

  if (!fromEl.value && !toEl.value) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    fromEl.value = toDateInputValue(monthStart);
    toEl.value = toDateInputValue(now);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    await renderStatsDashboard();
  });

  resetBtn?.addEventListener("click", async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    fromEl.value = toDateInputValue(monthStart);
    toEl.value = toDateInputValue(now);
    clearDashMessages();
    await renderStatsDashboard();
  });
}

function showView(view) {
  if (authSection) authSection.classList.toggle("admin-hide", view !== "auth");
  if (blockedSection) blockedSection.classList.toggle("admin-hide", view !== "blocked");
  if (dashSection) dashSection.classList.toggle("admin-hide", view !== "dash");
  const dash = view === "dash";
  const jumps = maybeEl("adminNavJumps");
  const meta = maybeEl("adminNavMeta");
  if (jumps) jumps.classList.toggle("admin-hide", !dash);
  if (meta) meta.classList.toggle("admin-hide", !dash);
}

async function isAdminUser(userId) {
  const { data, error } = await supabase.from("admin_allowlist").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error(error);
    return false;
  }
  return !!data;
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

  placesList.innerHTML = "";
  for (const p of places) {
    placesList.appendChild(renderPlaceCard(p));
  }
}

function renderPlaceCard(place) {
  const lessons = Array.isArray(place.lesson_times) ? place.lesson_times : [];

  const wrap = document.createElement("div");
  wrap.className = "admin-place";
  wrap.dataset.placeId = place.id;

  const head = document.createElement("div");
  head.className = "admin-place__head";

  const left = document.createElement("div");
  left.innerHTML =
    `<div class="admin-place__title"></div>` +
    `<div class="admin-meta"></div>`;
  left.querySelector(".admin-place__title").textContent = place.name || "Без назви";
  const metaBits = [];
  if (place.river_bank) metaBits.unshift(place.river_bank);
  if (place.address) metaBits.push(place.address);
  left.querySelector(".admin-meta").textContent = metaBits.join(" · ");

  const headActions = document.createElement("div");
  headActions.className = "admin-actions";

  const delPlace = document.createElement("button");
  delPlace.type = "button";
  delPlace.className = "btn btn--danger btn--sm";
  delPlace.textContent = "Видалити місце";
  delPlace.addEventListener("click", () => deletePlace(place.id));

  headActions.append(delPlace);

  head.append(left, headActions);
  wrap.appendChild(head);

  if (place.notes) {
    const n = document.createElement("p");
    n.className = "admin-muted";
    n.style.marginBottom = "8px";
    n.textContent = place.notes;
    wrap.appendChild(n);
  }

  const lessonsHead = document.createElement("div");
  lessonsHead.className = "admin-place__lessons-head";

  const lessonsTitle = document.createElement("p");
  lessonsTitle.className = "admin-sub";
  lessonsTitle.textContent = "Час занять";

  const lessonFormToggle = document.createElement("button");
  lessonFormToggle.type = "button";
  lessonFormToggle.className = "btn btn--ghost btn--sm";
  lessonFormToggle.textContent = "+ Заняття";

  lessonsHead.append(lessonsTitle, lessonFormToggle);

  const rows = document.createElement("div");
  rows.className = "lesson-rows";

  if (lessons.length === 0) {
    rows.innerHTML = '<p class="admin-muted">Ще немає слотів — додай перший нижче.</p>';
  } else {
    for (const lt of lessons) {
      rows.appendChild(lessonRow(lt));
    }
  }

  wrap.appendChild(lessonsHead);
  wrap.appendChild(rows);

  const addForm = document.createElement("div");
  addForm.className = "admin-grid admin-grid--2 admin-hide";
  addForm.style.marginTop = "12px";

  addForm.innerHTML = `
    <div class="admin-field admin-grid-span-2">
      <label>Тип заняття</label>
      <select data-role="ltype"></select>
    </div>
    <div class="admin-field">
      <label>День тижня</label>
      <select data-role="day" aria-label="День тижня">${DAYS_UK.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
    </div>
    <div class="admin-field">
      <label>Початок</label>
      <input data-role="time" type="time" aria-label="Час заняття" />
    </div>
    <div class="admin-actions admin-grid-span-2">
      <button type="button" class="btn btn--primary btn--sm" data-role="add-lesson">Додати заняття</button>
      <button type="button" class="btn btn--ghost btn--sm" data-role="cancel-add-lesson">Скасувати</button>
    </div>
  `;

  const ltypeSel = addForm.querySelector('[data-role="ltype"]');
  ltypeSel.innerHTML = "";
  for (const lt of cachedLessonTypes) {
    const opt = document.createElement("option");
    opt.value = lt.id;
    opt.textContent = lt.name || lt.slug;
    ltypeSel.appendChild(opt);
  }

  wrap.appendChild(addForm);

  const daySel = addForm.querySelector('[data-role="day"]');
  const timeIn = addForm.querySelector('[data-role="time"]');
  const cancelAddLessonBtn = addForm.querySelector('[data-role="cancel-add-lesson"]');

  const setLessonFormOpen = (isOpen) => {
    addForm.classList.toggle("admin-hide", !isOpen);
    lessonFormToggle.textContent = isOpen ? "Закрити" : "+ Заняття";
    lessonFormToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) timeIn?.focus();
  };

  lessonFormToggle.addEventListener("click", () => {
    const isOpen = addForm.classList.contains("admin-hide");
    setLessonFormOpen(isOpen);
  });

  cancelAddLessonBtn?.addEventListener("click", () => {
    if (ltypeSel) ltypeSel.selectedIndex = 0;
    if (daySel) daySel.value = "0";
    if (timeIn) timeIn.value = "";
    setLessonFormOpen(false);
  });

  addForm.querySelector('[data-role="add-lesson"]').addEventListener("click", async () => {
    clearDashMessages();
    const lesson_type_id = ltypeSel.value;
    if (!lesson_type_id) {
      showDashError("Обери тип заняття.");
      return;
    }
    const dow = parseInt(daySel.value, 10);
    const tm = timeIn.value;
    if (!tm) {
      showDashError("Обери час заняття.");
      return;
    }
    const { error: insErr } = await supabase.from("lesson_times").insert({
      place_id: place.id,
      lesson_type_id,
      day_of_week: dow,
      start_time: tm + ":00",
    });
    if (insErr) {
      showDashError(insErr.message);
      return;
    }
    setLessonFormOpen(false);
    await loadPlacesHtml();
    showDashOk("Заняття додано.");
  });

  const editHead = document.createElement("div");
  editHead.className = "admin-place__edit-head";
  editHead.style.marginTop = "18px";

  const editTitle = document.createElement("div");
  editTitle.className = "admin-sub";
  editTitle.textContent = "Налаштування місця";

  const editToggle = document.createElement("button");
  editToggle.type = "button";
  editToggle.className = "btn btn--ghost btn--sm";
  editToggle.textContent = "Редагувати місце";

  editHead.append(editTitle, editToggle);
  wrap.appendChild(editHead);

  const editForm = document.createElement("form");
  editForm.className = "admin-grid admin-grid--2";
  editForm.innerHTML = `
    <div class="admin-field">
      <label>Назва</label>
      <input data-e="name" type="text" required />
    </div>
    <div class="admin-field">
      <label>Адреса</label>
      <input data-e="address" type="text" />
    </div>
    <div class="admin-field admin-grid-span-2">
      <label>Берег Дніпра</label>
      <select data-e="river">
        <option value="">— не вказано —</option>
        <option value="Правий берег">Правий берег</option>
        <option value="Лівий берег">Лівий берег</option>
      </select>
    </div>
    <div class="admin-field admin-grid-span-2">
      <label>Нотатки</label>
      <textarea data-e="notes"></textarea>
    </div>
    <div class="admin-actions admin-grid-span-2">
      <button type="submit" class="btn btn--primary btn--sm">Оновити місце</button>
      <button type="button" class="btn btn--ghost btn--sm" data-e="cancel">Скасувати</button>
    </div>
  `;
  editForm.classList.add("admin-hide");
  editForm.querySelector('[data-e="name"]').value = place.name || "";
  editForm.querySelector('[data-e="address"]').value = place.address || "";
  editForm.querySelector('[data-e="notes"]').value = place.notes || "";
  const riverSel = editForm.querySelector('[data-e="river"]');
  if (riverSel) riverSel.value = place.river_bank || "";

  const setEditFormOpen = (isOpen) => {
    editForm.classList.toggle("admin-hide", !isOpen);
    editToggle.textContent = isOpen ? "Закрити редагування" : "Редагувати місце";
    editToggle.setAttribute("aria-expanded", String(isOpen));
  };

  editToggle.addEventListener("click", () => {
    const isOpen = editForm.classList.contains("admin-hide");
    setEditFormOpen(isOpen);
  });

  editForm.querySelector('[data-e="cancel"]')?.addEventListener("click", () => {
    editForm.querySelector('[data-e="name"]').value = place.name || "";
    editForm.querySelector('[data-e="address"]').value = place.address || "";
    editForm.querySelector('[data-e="notes"]').value = place.notes || "";
    if (riverSel) riverSel.value = place.river_bank || "";
    setEditFormOpen(false);
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearDashMessages();
    const name = editForm.querySelector('[data-e="name"]').value.trim();
    const sort_order = place.sort_order ?? 0;
    const address = editForm.querySelector('[data-e="address"]').value.trim();
    const notes = editForm.querySelector('[data-e="notes"]').value.trim();
    const river_bank = riverSel ? riverSel.value.trim() || null : null;
    const { error } = await supabase
      .from("places")
      .update({
        name,
        sort_order,
        address: address || null,
        notes: notes || null,
        river_bank,
      })
      .eq("id", place.id);
    if (error) {
      showDashError(error.message);
      return;
    }
    setEditFormOpen(false);
    await loadPlacesHtml();
    showDashOk("Місце оновлено.");
  });

  wrap.appendChild(editForm);
  return wrap;
}

function lessonRow(lt) {
  const row = document.createElement("div");
  row.className = "lesson-row";
  row.innerHTML = `<span></span><div class="admin-actions"></div>`;
  const labelEl = row.querySelector("span");
  const actions = row.querySelector(".admin-actions");
  let isEditing = false;

  const renderView = () => {
    isEditing = false;
    const typeName = lt.lesson_types?.name || lt.lesson_types?.slug || "—";
    labelEl.textContent = `${typeName} · ${DAYS_UK[lt.day_of_week]}, ${fmtTime(lt.start_time)}`;
    actions.innerHTML = "";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--ghost btn--sm";
    editBtn.textContent = "Змінити";
    editBtn.addEventListener("click", () => renderEdit());

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--danger btn--sm";
    delBtn.textContent = "Видалити";
    delBtn.addEventListener("click", () => deleteLesson(lt.id));

    actions.append(editBtn, delBtn);
  };

  const renderEdit = () => {
    if (isEditing) return;
    isEditing = true;
    actions.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "lesson-row__editor";

    const typeSel = document.createElement("select");
    typeSel.className = "lesson-row__input";
    for (const t of cachedLessonTypes) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name || t.slug;
      typeSel.appendChild(opt);
    }
    typeSel.value = lt.lesson_type_id || "";

    const daySel = document.createElement("select");
    daySel.className = "lesson-row__input";
    for (let i = 0; i < DAYS_UK.length; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = DAYS_UK[i];
      daySel.appendChild(opt);
    }
    daySel.value = String(lt.day_of_week ?? 0);

    const timeIn = document.createElement("input");
    timeIn.className = "lesson-row__input lesson-row__time";
    timeIn.type = "time";
    timeIn.step = "60";
    timeIn.lang = "uk-UA";
    timeIn.setAttribute("aria-label", "Час заняття у форматі 24 години");
    timeIn.value = fmtTime(lt.start_time);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn--primary btn--sm";
    saveBtn.textContent = "Зберегти";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost btn--sm";
    cancelBtn.textContent = "Скасувати";
    cancelBtn.addEventListener("click", () => renderView());

    saveBtn.addEventListener("click", async () => {
      clearDashMessages();
      const lesson_type_id = typeSel.value;
      const day_of_week = parseInt(daySel.value, 10);
      const tm = String(timeIn.value || "").trim();
      if (!lesson_type_id) {
        showDashError("Обери тип заняття.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(tm)) {
        showDashError("Вкажи час у форматі 24 години (HH:mm).");
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      const { data, error } = await supabase
        .from("lesson_times")
        .update({
          lesson_type_id,
          day_of_week,
          start_time: `${tm}:00`,
        })
        .eq("id", lt.id)
        .select("id, lesson_type_id, day_of_week, start_time, lesson_types(id, slug, name)")
        .single();

      if (error) {
        showDashError(error.message);
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }

      lt.lesson_type_id = data.lesson_type_id;
      lt.day_of_week = data.day_of_week;
      lt.start_time = data.start_time;
      lt.lesson_types = data.lesson_types;
      renderView();
      showDashOk("Слот оновлено.");
    });

    wrap.append(typeSel, daySel, timeIn, saveBtn, cancelBtn);
    actions.appendChild(wrap);
  };

  renderView();
  return row;
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
    if (isLoginPage) showView("auth");
    else location.href = "./index.html";
    return;
  }
  const allowed = await isAdminUser(user.id);
  if (!allowed) {
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
    location.href = "./places.html";
    return;
  }

  showView("dash");
  await refreshDashboard();
}

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

wireSignOut(maybeEl("signOutBlocked"));
wireSignOut(maybeEl("signOutDash"));

async function applySession(session) {
  if (!session?.user) {
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
