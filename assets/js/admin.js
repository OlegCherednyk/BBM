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

/** @type {"login"|"lesson-types"|"prices"|"places"|"teachers"} */
const ADMIN_PAGE = /** @type {any} */ (document.body?.dataset.adminPage ?? "lesson-types");

const isLoginPage = ADMIN_PAGE === "login";

function fmtTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "";
  const part = timeStr.slice(0, 5);
  return part;
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
const userLine = maybeEl("userLine");
const allowlistSnippet = maybeEl("allowlistSnippet");

/** @type {{ id: string, slug: string, name: string, duration_minutes: number }[]} */
let cachedLessonTypes = [];

let editingPriceId = null;
let editingTeacherId = null;

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
  const nameInput = maybeEl("teacherName");
  const descInput = maybeEl("teacherDescription");
  if (!form || !editingId || !submitBtn || !nameInput || !descInput) return;
  editingTeacherId = null;
  editingId.value = "";
  nameInput.value = "";
  descInput.value = "";
  submitBtn.textContent = "Додати викладача";
  cancelEdit?.classList.add("admin-hide");
  descriptionWrap?.classList.add("admin-hide");
  setTeacherFormOpen(false);
}

function beginEditTeacher(teacher) {
  const editingId = maybeEl("teacherEditingId");
  const submitBtn = maybeEl("teacherSubmitBtn");
  const cancelEdit = maybeEl("teacherCancelEdit");
  const descriptionWrap = maybeEl("teacherDescriptionWrap");
  const nameInput = maybeEl("teacherName");
  const descInput = maybeEl("teacherDescription");
  if (!editingId || !submitBtn || !nameInput || !descInput) return;
  editingTeacherId = teacher.id;
  editingId.value = teacher.id;
  nameInput.value = teacher.name || "";
  descInput.value = teacher.short_description || "";
  submitBtn.textContent = "Зберегти зміни";
  cancelEdit?.classList.remove("admin-hide");
  descriptionWrap?.classList.remove("admin-hide");
  setTeacherFormOpen(true);
}

async function renderTeachersPanel() {
  const root = maybeEl("teachersList");
  if (!root) return;
  root.innerHTML = '<p class="admin-muted">Завантаження…</p>';
  const { data: teachers, error } = await supabase.from("teachers").select("*").order("sort_order", { ascending: true });
  if (error) {
    root.innerHTML = `<p class="admin-muted">${error.message}</p>`;
    return;
  }
  if (!teachers?.length) {
    root.innerHTML = '<p class="admin-muted">Ще немає викладачів.</p>';
    return;
  }

  const tbl = document.createElement("table");
  tbl.className = "admin-prices-table";
  tbl.innerHTML = `<thead><tr><th>Ім'я</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = tbl.querySelector("tbody");

  for (const teacher of teachers) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(teacher.name || "—")}</td>`;
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
    const payload = id ? { name, short_description: short_description || null } : { name, short_description: null };
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

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function parseRentPerHourUah(rawValue) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) return { value: null, error: null };
  const parsed = parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return { value: null, error: "Вкажи коректну ціну оренди за годину (грн)." };
  }
  return { value: parsed, error: null };
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
        await renderPricesPanel();
        break;
      case "places":
        await loadLessonTypesIntoCache();
        await loadPlacesHtml();
        break;
      case "teachers":
        resetTeacherForm();
        await renderTeachersPanel();
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

  if (Number.isFinite(place.rent_per_hour_uah)) {
    const rent = document.createElement("p");
    rent.className = "admin-muted";
    rent.style.margin = "6px 0 8px";
    rent.textContent = `Оренда: ${new Intl.NumberFormat("uk-UA").format(place.rent_per_hour_uah)} ₴/год`;
    wrap.appendChild(rent);
  }

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
    <div class="admin-field">
      <label>Оренда за годину (₴)</label>
      <input data-e="rent" type="number" min="0" step="1" />
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
  editForm.querySelector('[data-e="rent"]').value =
    Number.isFinite(place.rent_per_hour_uah) ? String(place.rent_per_hour_uah) : "";
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
    editForm.querySelector('[data-e="rent"]').value =
      Number.isFinite(place.rent_per_hour_uah) ? String(place.rent_per_hour_uah) : "";
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
    const rentRaw = editForm.querySelector('[data-e="rent"]').value;
    const { value: rent_per_hour_uah, error: rentError } = parseRentPerHourUah(rentRaw);
    if (rentError) {
      showDashError(rentError);
      return;
    }
    const { error } = await supabase
      .from("places")
      .update({
        name,
        sort_order,
        address: address || null,
        notes: notes || null,
        river_bank,
        rent_per_hour_uah,
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
  const typeName = lt.lesson_types?.name || lt.lesson_types?.slug || "—";
  const label = `${typeName} · ${DAYS_UK[lt.day_of_week]}, ${fmtTime(lt.start_time)}
  `;
  row.querySelector("span").textContent = label;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn--danger btn--sm";
  del.textContent = "Видалити";
  del.addEventListener("click", () => deleteLesson(lt.id));
  row.querySelector(".admin-actions").appendChild(del);
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
  if (userLine) userLine.textContent = user.email || user.id;
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
    const rentRaw = maybeEl("placeRentPerHour")?.value ?? "";
    const { value: rent_per_hour_uah, error: rentError } = parseRentPerHourUah(rentRaw);
    if (rentError) {
      showDashError(rentError);
      return;
    }
    const { error } = await supabase.from("places").insert({
      name,
      sort_order,
      address: address || null,
      notes: notes || null,
      river_bank,
      rent_per_hour_uah,
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
initTeacherForm();

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
