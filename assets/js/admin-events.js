import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getSupabaseConfig } from "./runtime-supabase-config.js";

const PASSES = {
  full: { title: "Full pass", when: "03.10 + 04.10", price: "1800 грн" },
  grunt: { title: "Ґрунт", when: "03.10, субота", price: "600 грн" },
  sprouts: { title: "Паростки", when: "04.10, неділя", price: "1400 грн" },
  one: { title: "Одна практика", when: "один слот", price: "400 грн" },
};

const PRACTICES = {
  trenazh: "03.10, 14:00–15:00 · Тренаж",
  dance: "03.10, 15:15–17:45 · Сучасний танець",
  game: "04.10, 12:00–13:00 · Рух як гра",
  contact: "04.10, 13:10–14:10 · Контактна практика",
  health: "04.10, 15:00–16:00 · Dance and health",
  stretch: "04.10, 16:10–17:10 · Стретчинг",
};

const SOURCES = {
  ig: "Instagram",
  tg: "Telegram",
  friend: "Порадили подруга чи друг",
  other: "Інше",
};

function el(id) {
  return document.getElementById(id);
}

function passLabel(pass) {
  return PASSES[pass]?.title || pass || "—";
}

function recordsWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "запис";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "записи";
  return "записів";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function telegramHref(nick) {
  const handle = String(nick || "").replace(/^@/, "");
  return handle ? "https://t.me/" + handle : "";
}

export async function setupEventsAdmin() {
  const listEl = el("eventList");
  const heroEl = el("eventHero");
  const filtersEl = el("eventFilters");
  const modal = el("eventModal");
  const modalBody = el("eventModalBody");
  const modalTitle = el("eventModalTitle");
  let rows = [];
  let filter = "all";
  let supabase = null;

  function showError(message) {
    const box = el("dashError");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("admin-hide", !message);
  }

  async function removeSignup(row, button) {
    const name = row.name || "цю заявку";
    if (!confirm("Видалити заявку «" + name + "»?")) return;
    if (!supabase) return;
    button.disabled = true;
    const { error } = await supabase.from("open_day_signups").delete().eq("id", row.id);
    if (error) {
      button.disabled = false;
      showError(error.message);
      return;
    }
    rows = rows.filter((item) => item.id !== row.id);
    showError("");
    closeModal();
    renderHero();
    renderFilters();
    renderList();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("admin-hide");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-modal-open");
  }

  function addField(parent, label, value, href) {
    const row = document.createElement("div");
    row.className = "event-detail";
    const dt = document.createElement("div");
    dt.className = "event-detail__label";
    dt.textContent = label;
    const dd = document.createElement("div");
    dd.className = "event-detail__value";
    if (href && value) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = value;
      dd.appendChild(a);
    } else {
      dd.textContent = value || "—";
    }
    row.append(dt, dd);
    parent.appendChild(row);
  }

  function openModal(row) {
    if (!modal || !modalBody || !modalTitle) return;
    modalTitle.textContent = row.name || "Учасник";
    modalBody.replaceChildren();
    const pass = PASSES[row.pass];
    const pill = document.createElement("p");
    pill.className = "event-pill event-pill--" + (row.pass || "one");
    pill.textContent = pass ? pass.title + " · " + pass.price : passLabel(row.pass);
    modalBody.appendChild(pill);
    addField(modalBody, "Оплата", row.paid_at ? "оплачено · " + formatWhen(row.paid_at) : "ще ні");
    addField(modalBody, "Коли записався", formatWhen(row.created_at));
    addField(modalBody, "Telegram", row.telegram, telegramHref(row.telegram));
    addField(modalBody, "Телефон", row.phone, row.phone ? "tel:" + row.phone.replace(/\s/g, "") : "");
    addField(modalBody, "Формат", pass ? pass.title + " · " + pass.when + " · " + pass.price : passLabel(row.pass));
    if (row.pass === "one") {
      const picked = Array.isArray(row.practices) && row.practices.length ? row.practices : row.practice ? [row.practice] : [];
      addField(modalBody, "Практики", picked.map((item) => PRACTICES[item] || item).join("\n"));
    }
    const source = SOURCES[row.source] || "";
    addField(modalBody, "Звідки дізнався_лась", row.source === "other" && row.source_other ? source + ": " + row.source_other : source);
    addField(modalBody, "Чого чекає", row.hope);
    const actions = document.createElement("div");
    actions.className = "event-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--danger btn--sm";
    del.textContent = "Видалити заявку";
    del.addEventListener("click", () => removeSignup(row, del));
    actions.appendChild(del);
    modalBody.appendChild(actions);
    modal.classList.remove("admin-hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
  }

  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.replaceChildren();
    const options = [{ id: "all", label: "Усі" }, ...Object.entries(PASSES).map(([id, item]) => ({ id, label: item.title }))];
    for (const option of options) {
      const count = option.id === "all" ? rows.length : rows.filter((row) => row.pass === option.id).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "event-filter" + (filter === option.id ? " is-on" : "");
      btn.textContent = option.label + " · " + count;
      btn.setAttribute("aria-pressed", filter === option.id ? "true" : "false");
      btn.addEventListener("click", () => {
        filter = option.id;
        renderFilters();
        renderList();
      });
      filtersEl.appendChild(btn);
    }
  }

  function renderHero() {
    if (!heroEl) return;
    heroEl.replaceChildren();
    const copy = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "event-hero__kicker";
    kicker.textContent = "3–4 жовтня · Позняки";
    const title = document.createElement("h2");
    title.className = "event-hero__title";
    title.textContent = "Open Day";
    copy.append(kicker, title);
    const count = document.createElement("p");
    count.className = "event-hero__count";
    const num = document.createElement("span");
    num.textContent = String(rows.length);
    const cap = document.createElement("small");
    cap.textContent = recordsWord(rows.length);
    count.append(num, cap);
    heroEl.append(copy, count);
  }

  function renderList() {
    if (!listEl) return;
    const visible = filter === "all" ? rows : rows.filter((row) => row.pass === filter);
    listEl.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "admin-muted";
      empty.textContent = rows.length ? "У цьому форматі ще нікого немає." : "Поки ніхто не записався.";
      listEl.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "event-list";
    for (const row of visible) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "event-row";
      const main = document.createElement("span");
      main.className = "event-row__main";
      const name = document.createElement("span");
      name.className = "event-row__name";
      name.textContent = row.name;
      const meta = document.createElement("span");
      meta.className = "event-row__meta";
      meta.textContent = [row.telegram, row.paid_at ? "оплачено" : "", formatWhen(row.created_at)].filter(Boolean).join(" · ");
      main.append(name, meta);
      const pill = document.createElement("span");
      pill.className = "event-pill event-pill--" + (row.pass || "one");
      pill.textContent = passLabel(row.pass);
      btn.append(main, pill);
      btn.addEventListener("click", () => openModal(row));
      list.appendChild(btn);
    }
    listEl.appendChild(list);
  }

  modal?.querySelectorAll("[data-event-close]").forEach((node) => {
    node.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.classList.contains("admin-hide")) closeModal();
  });

  const { url, anonKey } = await getSupabaseConfig();
  if (!url || !anonKey) {
    showError("Немає підключення до бази. Перезапустіть сервер.");
    return;
  }
  supabase = createClient(url, anonKey);
  const { data, error } = await supabase
    .from("open_day_signups")
    .select("id, name, telegram, phone, pass, practice, practices, source, source_other, hope, created_at, paid_at")
    .order("created_at", { ascending: false });
  if (error) {
    showError(error.message);
    if (listEl) listEl.replaceChildren();
    return;
  }
  rows = data || [];
  renderHero();
  renderFilters();
  renderList();

  const logEl = el("wayforpayLog");
  const { data: callbacks, error: callbackError } = await supabase
    .from("wayforpay_callbacks")
    .select("id, received_at, order_reference, transaction_status, signature_ok, http_status, body")
    .order("received_at", { ascending: false })
    .limit(20);
  if (!logEl) return;
  logEl.replaceChildren();
  if (callbackError) {
    const note = document.createElement("p");
    note.className = "admin-muted";
    note.textContent = callbackError.message;
    logEl.appendChild(note);
    return;
  }
  if (!callbacks?.length) {
    const note = document.createElement("p");
    note.className = "admin-muted";
    note.textContent = "Ще жодної відповіді від WayForPay не було.";
    logEl.appendChild(note);
    return;
  }
  for (const item of callbacks) {
    const row = document.createElement("details");
    row.className = "event-log__item";
    const summary = document.createElement("summary");
    const when = formatWhen(item.received_at);
    const status = item.transaction_status || "без статусу";
    const sign = item.signature_ok ? "підпис ок" : "підпис не зійшовся";
    summary.textContent = [when, status, sign, item.order_reference].filter(Boolean).join(" · ");
    const pre = document.createElement("pre");
    pre.className = "event-log__json";
    pre.textContent = JSON.stringify(item.body, null, 2);
    row.append(summary, pre);
    logEl.appendChild(row);
  }
}
