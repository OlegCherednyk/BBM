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

/** @type {string | null} */
let selectedId = null;

export async function setupStudentsAdmin() {
  const listEl = el("studentsList");
  const searchEl = el("studentsSearch");
  const filterEl = el("studentsFilter");
  const reloadBtn = el("studentsReload");
  const detailWrap = el("studentDetail");
  const subFormToggle = el("subscriptionFormToggle");
  const subForm = el("subscriptionAddForm");

  const params = new URLSearchParams(window.location.search);
  const qFilter = params.get("filter");
  if (filterEl && qFilter && ["all", "pending", "active", "exhausted"].includes(qFilter)) {
    filterEl.value = qFilter;
  }

  const { url, anonKey } = await getSupabaseConfig();
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
    showStudentsLocalError("");
    listEl.innerHTML = `<p class="admin-muted">Завантаження…</p>`;
    const search = searchEl?.value.trim() || "";
    const filter = filterEl?.value || "all";
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (filter !== "all") q.set("filter", filter);
    const query = q.toString();
    try {
      const json = await fetchJson(`/api/admin/students${query ? `?${query}` : ""}`);
      const rows = json.rows || [];
      if (!rows.length) {
        listEl.innerHTML = `<p class="admin-muted">Нікого не знайдено.</p>`;
        return;
      }
      const frag = document.createDocumentFragment();
      for (const s of rows) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "admin-panel";
        card.style.cssText = "text-align:left;width:100%;cursor:pointer;margin-bottom:8px;padding:12px 16px;border-radius:var(--radius-sm);border:1px solid var(--cream-mid);background:var(--cream-pale);";
        const sum = s.subscription_summary || {};
        card.innerHTML = `
          <div style="font-weight:600">${escapeHtml(s.display_name || "")}</div>
          <div class="admin-muted" style="font-size:0.88rem;margin-top:4px">TG id: ${escapeHtml(String(s.telegram_user_id))}</div>
          <div class="admin-muted" style="font-size:0.82rem;margin-top:4px">
            pending ${sum.pending || 0} · active ${sum.active || 0} · exhausted ${sum.exhausted || 0}
          </div>
        `;
        card.addEventListener("click", () => {
          void openDetail(String(s.id));
        });
        frag.appendChild(card);
      }
      listEl.innerHTML = "";
      listEl.appendChild(frag);
    } catch (e) {
      listEl.innerHTML = "";
      showStudentsLocalError(e?.message || String(e));
    }
  }

  async function openDetail(id) {
    selectedId = id;
    showStudentsLocalError("");
    if (!detailWrap) return;
    detailWrap.classList.remove("admin-hide");
    const title = el("studentDetailTitle");
    if (title) title.textContent = "Завантаження…";
    try {
      const json = await fetchJson(`/api/admin/students/${encodeURIComponent(id)}`);
      const st = json.student;
      if (title) title.textContent = st.display_name || "Учень";
      el("studentDetailId").value = st.id;
      el("studentDisplayName").value = st.display_name || "";
      el("studentTelegramUsername").value = st.telegram_username || "";
      el("studentPhone").value = st.phone || "";
      el("studentInstagram").value = st.instagram || "";
      el("studentAdminNote").value = st.admin_note || "";

      const subsEl = el("studentSubscriptions");
      if (subsEl) {
        const subs = json.subscriptions || [];
        if (!subs.length) subsEl.innerHTML = `<p class="admin-muted">Немає абонементів.</p>`;
        else {
          subsEl.innerHTML = subs
            .map((sub) => {
              const lt = sub.lesson_types;
              const ltName = (lt && lt.name) || sub.lesson_type_id;
              return `<div class="admin-panel" style="margin-bottom:8px;padding:10px 14px;">
                <div><strong>${escapeHtml(String(ltName))}</strong> — <span class="admin-muted">${escapeHtml(
                  String(sub.status),
                )}</span></div>
                <div class="admin-muted" style="font-size:0.86rem;margin-top:4px">
                  візитів у пакеті: ${sub.total_visits == null ? "—" : escapeHtml(String(sub.total_visits))}
                  · діє до: ${sub.valid_until ? escapeHtml(String(sub.valid_until)) : "—"}
                </div>
              </div>`;
            })
            .join("");
        }
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

  searchEl?.addEventListener(
    "input",
    debounce(() => {
      void refreshList();
    }, 320),
  );
  filterEl?.addEventListener("change", () => void refreshList());
  reloadBtn?.addEventListener("click", () => void refreshList());

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
      selectedId = null;
      detailWrap?.classList.add("admin-hide");
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

  await refreshList();
  if (selectedId) await openDetail(selectedId);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t = 0;
  return () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(), ms);
  };
}
