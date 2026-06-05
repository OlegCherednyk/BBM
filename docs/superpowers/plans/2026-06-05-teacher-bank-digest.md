# Teacher Bank Scope + Daily Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати викладачам поля «берег» і «ранковий дайджest», фільтрувати conduct-голосування за берегом заняття, щодня о 9:00 надсилати персональний TG-дайджest (pending / закінчуються / прострочені) лише підписаним викладачам.

**Architecture:** SQL-колонки `teachers.river_bank_scope` + `teachers.digest_enabled`. Спільна функція `teacherMatchesBank` у новому `admin-notifications.js` (імпортується в `server.js` для conduct). Digest: cron tick → завантажити recipients → для кожного scope зібрати абонементи з bank з останнього візиту → `bot.telegram.sendMessage`. Заявки з сайту (`/api/signup`) без змін.

**Tech Stack:** Node.js (ESM), Express 5, Telegraf, Luxon, Supabase JS, статична адмінка.

**Spec:** `docs/superpowers/specs/2026-06-05-admin-daily-digest-design.md`

---

## File map

| Файл | Дія |
|------|-----|
| `supabase/add_teachers_bank_digest.sql` | Нові колонки |
| `admin-notifications.js` | Bank helpers, digest build/send |
| `lesson-vote-cron.js` | Digest daily tick |
| `server.js` | Conduct filter; cron wiring; signup лишає `loadTeacherTargetsWithChatId()` без filter |
| `admin/teachers.html` | Select берег + checkbox дайджest |
| `assets/js/admin.js` | CRUD полів, таблиця |

---

### Task 1: SQL — `river_bank_scope` + `digest_enabled`

**Files:**
- Create: `c:\Users\servi\Desktop\Projects\BBM\supabase\add_teachers_bank_digest.sql`

- [ ] **Step 1: Створити міграцію**

```sql
-- Берег для фільтра TG + opt-in ранкового дайджestу.
alter table public.teachers
  add column if not exists river_bank_scope text not null default 'any'
    check (river_bank_scope in ('any', 'left', 'right'));

alter table public.teachers
  add column if not exists digest_enabled boolean not null default false;

comment on column public.teachers.river_bank_scope is
  'Фільтр TG: any — усі береги; left/right — лише відповідний берег місця заняття';
comment on column public.teachers.digest_enabled is
  'Надсилати ранковий дайджest у chat_id';
```

- [ ] **Step 2: Застосувати в Supabase SQL Editor** (або через існуючий deploy-процес проєкту).

Expected: `\d teachers` показує обидві колонки; існуючі рядки — `any` / `false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/add_teachers_bank_digest.sql
git commit -m "db: add teachers river_bank_scope and digest_enabled"
```

---

### Task 2: `admin-notifications.js` — bank helpers + digest

**Files:**
- Create: `c:\Users\servi\Desktop\Projects\BBM\admin-notifications.js`

- [ ] **Step 1: Створити модуль з експортами**

```javascript
import { DateTime } from "luxon";
import { computeSubscriptionUsedVisits } from "./students-api.js";

const KYIV_TZ = "Europe/Kyiv";

/** @returns {"left"|"right"|null} */
export function parsePlaceRiverBank(riverBankRaw) {
  const s = String(riverBankRaw || "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("лів")) return "left";
  if (s.includes("прав")) return "right";
  return null;
}

/** @param {"any"|"left"|"right"} teacherScope @param {"left"|"right"|null} lessonBank */
export function teacherMatchesBank(teacherScope, lessonBank) {
  if (teacherScope === "any") return true;
  if (!lessonBank) return false;
  return teacherScope === lessonBank;
}

/** @param {"any"|"left"|"right"} scope */
export function digestScopeLabel(scope) {
  if (scope === "left") return "Лівий берег";
  if (scope === "right") return "Правий берег";
  return "Усі береги";
}

/** @param {unknown} snap */
function bankFromLessonSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  return parsePlaceRiverBank(/** @type {{ riverBank?: string }} */ (snap).riverBank);
}

function formatKyivDate(iso) {
  if (!iso) return "—";
  return DateTime.fromISO(String(iso), { zone: KYIV_TZ }).toFormat("dd.MM");
}

function studentLine(st) {
  const un = String(st?.telegram_username ?? "").trim().replace(/^@/, "");
  if (un) return `@${un}`;
  return String(st?.display_name ?? "—").trim() || "—";
}

function truncateSection(lines, limit) {
  if (lines.length <= limit) return { text: lines.join("\n"), extra: 0 };
  const shown = lines.slice(0, limit);
  return { text: shown.join("\n"), extra: lines.length - limit };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {"any"|"left"|"right"} scope
 */
export async function buildDigestTextForScope(supabaseAdmin, scope) {
  const todayKyiv = DateTime.now().setZone(KYIV_TZ).toISODate();
  const dateLabel = DateTime.now().setZone(KYIV_TZ).toFormat("dd.MM.yyyy");
  const scopeLabel = digestScopeLabel(scope);

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, status, total_visits, valid_until, used_visits_override, lesson_type_id, students ( display_name, telegram_username ), lesson_types ( name )",
    )
    .in("status", ["pending", "active", "exhausted"]);
  if (subsErr) throw new Error(subsErr.message);

  const subIds = (subs || []).map((s) => s.id);
  /** @type {Map<string, "left"|"right"|null>} */
  const bankBySubId = new Map();
  if (subIds.length) {
    const { data: visits, error: vErr } = await supabaseAdmin
      .from("visits")
      .select(
        "subscription_id, created_at, lesson_vote_occurrences ( lesson_snapshot, place_id, places ( river_bank ) )",
      )
      .in("subscription_id", subIds)
      .order("created_at", { ascending: false });
    if (vErr) throw new Error(vErr.message);
    for (const v of visits || []) {
      const sid = v.subscription_id;
      if (!sid || bankBySubId.has(sid)) continue;
      const occ = v.lesson_vote_occurrences;
      const bank =
        bankFromLessonSnapshot(occ?.lesson_snapshot) ??
        parsePlaceRiverBank(occ?.places?.river_bank) ??
        null;
      bankBySubId.set(sid, bank);
    }
  }

  /** @param {typeof subs[0]} sub */
  function includeSub(sub) {
    if (scope === "any") return true;
    const bank = bankBySubId.get(sub.id) ?? null;
    return teacherMatchesBank(scope, bank);
  }

  /** @type {string[]} */
  const pendingLines = [];
  /** @type {string[]} */
  const lowLines = [];
  /** @type {string[]} */
  const expiredLines = [];

  for (const sub of subs || []) {
    if (!includeSub(sub)) continue;
    const ltName = sub.lesson_types?.name || "—";
    const st = sub.students;

    if (sub.status === "pending") {
      pendingLines.push(`  • ${studentLine(st)} — ${ltName}`);
      continue;
    }

    const { count, error: cntErr } = await supabaseAdmin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("visit_status", "attended");
    if (cntErr) throw new Error(cntErr.message);
    const used = computeSubscriptionUsedVisits(Number(count) || 0, sub.used_visits_override, sub.total_visits);
    const total = sub.total_visits != null ? Number(sub.total_visits) : null;
    const remaining = total != null ? Math.max(0, total - used) : null;

    if (sub.status === "active" && total != null && remaining != null && remaining <= 2) {
      lowLines.push(`  • ${studentLine(st)} — ${used}/${total} ${ltName}`);
      continue;
    }

    if (
      sub.status === "exhausted" &&
      sub.valid_until &&
      String(sub.valid_until) < String(todayKyiv) &&
      total != null &&
      remaining != null &&
      remaining > 0
    ) {
      expiredLines.push(`  • ${studentLine(st)} — ${ltName} (до ${formatKyivDate(sub.valid_until)})`);
    }
  }

  const p = pendingLines.length;
  const l = lowLines.length;
  const e = expiredLines.length;

  if (p === 0 && l === 0 && e === 0) {
    return `✅ BBM — ${dateLabel} · ${scopeLabel}\nНічого термінового. Pending: 0 · Закінчуються: 0 · Прострочені: 0`;
  }

  const parts = [`📋 BBM — ранковий дайджest · ${dateLabel}`, scopeLabel, ""];

  if (p > 0) {
    const { text, extra } = truncateSection(pendingLines, 10);
    parts.push(`⚠️ Pending абонементи (${p})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
    parts.push("");
  }
  if (l > 0) {
    const { text, extra } = truncateSection(lowLines, 10);
    parts.push(`🔔 Закінчуються (≤2 заняття) (${l})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
    parts.push("");
  }
  if (e > 0) {
    const { text, extra } = truncateSection(expiredLines, 5);
    parts.push(`⏰ Прострочені абонементи (${e})`, text);
    if (extra) parts.push(`  … +${extra} ще`);
  }

  let text = parts.join("\n").trim();
  if (text.length > 4096) text = `${text.slice(0, 4090)}…`;
  return text;
}

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function loadDigestRecipients(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id, river_bank_scope")
    .eq("digest_enabled", true)
    .not("chat_id", "is", null);
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => String(row.chat_id || "").trim());
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ telegram: { sendMessage: (chatId: string, text: string) => Promise<unknown> } } | null} bot
 */
export async function runDailyTeacherDigests(supabaseAdmin, bot) {
  if (!supabaseAdmin || !bot?.telegram?.sendMessage) {
    console.log("[admin-digest] skipped: bot or supabase not configured");
    return { sent: 0, skipped: true };
  }

  const recipients = await loadDigestRecipients(supabaseAdmin);
  if (!recipients.length) {
    console.log("[admin-digest] no recipients with digest_enabled");
    return { sent: 0, skipped: false };
  }

  let sent = 0;
  for (const t of recipients) {
    const scope = /** @type {"any"|"left"|"right"} */ (t.river_bank_scope || "any");
    try {
      const text = await buildDigestTextForScope(supabaseAdmin, scope);
      await bot.telegram.sendMessage(String(t.chat_id).trim(), text);
      sent += 1;
    } catch (err) {
      console.error(`[admin-digest] send failed teacher=${t.id}:`, err?.description || err?.message || err);
    }
  }
  console.log(`[admin-digest] done sent=${sent} recipients=${recipients.length}`);
  return { sent, skipped: false };
}
```

- [ ] **Step 2: Перевірка синтаксису**

Run: `node --check admin-notifications.js`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add admin-notifications.js
git commit -m "feat(notifications): add teacher daily digest builder"
```

---

### Task 3: Conduct filter — `loadTeacherTargetsWithChatId`

**Files:**
- Modify: `c:\Users\servi\Desktop\Projects\BBM\server.js`

- [ ] **Step 1: Імпорт helper**

На початку `server.js` (поруч з іншими imports):

```javascript
import { teacherMatchesBank, parsePlaceRiverBank } from "./admin-notifications.js";
```

- [ ] **Step 2: Видалити локальну `parsePlaceRiverBank`** (рядки ~127–135) — використовувати імпорт.

- [ ] **Step 3: Розширити `loadTeacherTargetsWithChatId`**

Замінити функцію на:

```javascript
/**
 * @param {{ lessonBank?: "left"|"right"|null }} [opts]
 */
async function loadTeacherTargetsWithChatId(opts = {}) {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("id, name, chat_id, river_bank_scope")
    .not("chat_id", "is", null);

  if (error) {
    throw new Error(`Failed to load teachers with chat_id: ${error.message}`);
  }

  const lessonBank = opts.lessonBank ?? null;
  const seen = new Set();
  const result = [];
  for (const row of data || []) {
    const scope = row.river_bank_scope || "any";
    if (lessonBank != null && !teacherMatchesBank(scope, lessonBank)) continue;

    const chatId = String(row.chat_id || "").trim();
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    result.push({
      id: row.id,
      name: row.name || "Викладач",
      chatId,
      river_bank_scope: scope,
    });
  }
  return result;
}
```

- [ ] **Step 4: У `startLessonVoteFlow` перед `loadTeacherTargetsWithChatId`**

Після `resolveGroupVoteChatIdForLessonPlace`:

```javascript
const lessonBank = resolvedGroup.bank || parsePlaceRiverBank(lessonContext.riverBank);

const [teachers, ...] = await Promise.all([
  loadTeacherTargetsWithChatId({ lessonBank }),
  loadLessonContext(lessonTimeId, placeId),
]);
```

Увага: `lessonContext` потрібен **до** фільтра teachers — переставити на:

```javascript
const lessonContext = await loadLessonContext(lessonTimeId, placeId);
const resolvedGroup = resolveGroupVoteChatIdForLessonPlace(lessonContext.riverBank);
// ... error handling ...
const lessonBank = resolvedGroup.bank || parsePlaceRiverBank(lessonContext.riverBank);
const teachers = await loadTeacherTargetsWithChatId({ lessonBank });
```

- [ ] **Step 5: `/api/signup` — залишити `loadTeacherTargetsWithChatId()` без аргументів** (усі викладачі з chat_id).

- [ ] **Step 6: Перевірка**

Run: `node --check server.js`

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat(teachers): filter conduct votes by river_bank_scope"
```

---

### Task 4: Cron — digest о 9:00

**Files:**
- Modify: `c:\Users\servi\Desktop\Projects\BBM\lesson-vote-cron.js`
- Modify: `c:\Users\servi\Desktop\Projects\BBM\server.js`

- [ ] **Step 1: Розширити `startDailyLessonVoteCron`**

Додати параметри `digestDailyTimeEnv`, `runDailyTeacherDigests`:

```javascript
export function startDailyLessonVoteCron({
  createDailyTimeEnv,
  closeDailyTimeEnv,
  digestDailyTimeEnv,
  runBatchTeacherVotesInWindow,
  closeOpenVotesForToday,
  supabaseAdmin,
  expireOverdueSubscriptions,
  runDailyTeacherDigests,
}) {
  const createDailyTime = normalizeDailyTime(createDailyTimeEnv);
  const closeDailyTime = normalizeDailyTime(closeDailyTimeEnv);
  const digestDailyTime = normalizeDailyTime(digestDailyTimeEnv || "09:00");
  // ...
  let lastDigestRunDateKyiv = "";

  // у tick(), після close block:
  if (
    digestDailyTime &&
    isSameKyivMinute(nowKyiv, digestDailyTime) &&
    lastDigestRunDateKyiv !== dateKey
  ) {
    lastDigestRunDateKyiv = dateKey;
    console.log(`[lesson-vote-daily-cron] digest run started kyiv=${nowKyiv.toISO()}`);
    if (typeof runDailyTeacherDigests === "function") {
      try {
        await runDailyTeacherDigests();
      } catch (error) {
        console.error("[lesson-vote-daily-cron] digest exception:", error?.message || error);
      }
    }
  }
}
```

Оновити `console.log` enabled line — додати `digest_time=`.

- [ ] **Step 2: У `server.js`**

```javascript
import { runDailyTeacherDigests as runDailyTeacherDigestsImpl } from "./admin-notifications.js";

const adminDigestCronTime = process.env.ADMIN_DIGEST_CRON_TIME || "09:00";

// ...
startDailyLessonVoteCron({
  // ...existing...
  digestDailyTimeEnv: adminDigestCronTime,
  runDailyTeacherDigests: () => runDailyTeacherDigestsImpl(supabaseAdmin, bot),
});
```

- [ ] **Step 3: `node --check lesson-vote-cron.js server.js`**

- [ ] **Step 4: Commit**

```bash
git add lesson-vote-cron.js server.js
git commit -m "feat(cron): daily teacher digest at 09:00 Kyiv"
```

---

### Task 5: Admin UI — викладачі

**Files:**
- Modify: `c:\Users\servi\Desktop\Projects\BBM\admin\teachers.html`
- Modify: `c:\Users\servi\Desktop\Projects\BBM\assets\js\admin.js`

- [ ] **Step 1: HTML — після `teacherChatWrap` додати**

```html
<div id="teacherBankWrap" class="admin-field admin-grid-span-2 admin-hide">
  <label for="teacherRiverBankScope">Берег (Telegram)</label>
  <select id="teacherRiverBankScope">
    <option value="any">Будь-який</option>
    <option value="left">Лівий берег</option>
    <option value="right">Правий берег</option>
  </select>
  <p class="admin-muted" style="margin-top:6px">Conduct-голосування та дайджest — лише для обраного берега.</p>
</div>
<div id="teacherDigestWrap" class="admin-field admin-grid-span-2 admin-hide">
  <label class="admin-check">
    <input type="checkbox" id="teacherDigestEnabled" />
    Ранковий дайджest у Telegram (09:00)
  </label>
  <p class="admin-muted" style="margin-top:6px">Потрібен привʼязаний Telegram-чат.</p>
</div>
```

- [ ] **Step 2: `renderTeachersPanel` — select додаткові поля**

```javascript
.select("id, name, short_description, sort_order, chat_id, river_bank_scope, digest_enabled")
```

Таблиця: колонки «Берег» і «Дайджest» (напр. «Лівий» / «✓» або «—»).

- [ ] **Step 3: `beginEditTeacher` — показати `teacherBankWrap`, `teacherDigestWrap`; заповнити значення**

```javascript
maybeEl("teacherRiverBankScope").value = teacher.river_bank_scope || "any";
maybeEl("teacherDigestEnabled").checked = Boolean(teacher.digest_enabled);
```

- [ ] **Step 4: `resetTeacherForm` — сховати нові wrap, скинути select/checkbox**

- [ ] **Step 5: `initTeacherForm` submit — додати в payload (лише при edit)**

```javascript
const river_bank_scope = maybeEl("teacherRiverBankScope")?.value || "any";
const digest_enabled = Boolean(maybeEl("teacherDigestEnabled")?.checked);
// update payload when id:
{ name, short_description, chat_id, river_bank_scope, digest_enabled }
// insert (new teacher): river_bank_scope: "any", digest_enabled: false — defaults OK без полів
```

- [ ] **Step 6: Manual smoke**

1. Відкрити `admin/teachers.html`, редагувати викладача → зберегти берег + галочку.
2. Supabase: рядок має `river_bank_scope`, `digest_enabled`.

- [ ] **Step 7: Commit**

```bash
git add admin/teachers.html assets/js/admin.js
git commit -m "feat(admin): teacher bank scope and digest toggle"
```

---

### Task 6: Manual end-to-end smoke

- [ ] **Step 1: Digest**

1. У `.env`: `ADMIN_DIGEST_CRON_TIME=<поточна HH:MM+1 хв>` (Kyiv).
2. У teacher: `digest_enabled=true`, `chat_id` заданий, `/start` у боті.
3. Restart `npm start`.
4. Expected: одне TG-повідомлення; повтор у ту ж хвилину — ні (dateKey).

- [ ] **Step 2: Conduct filter**

1. Teacher A: `river_bank_scope=left`; Teacher B: `right`.
2. Запустити голосування для слота на лівому березі (test vote або cron).
3. Expected: conduct DM лише Teacher A (+ any-scope teachers).

- [ ] **Step 3: Signup regression**

POST `/api/signup` з `{ "name": "Test", "contact": "@test" }` — доставлено **усім** teachers з chat_id.

- [ ] **Step 4: Final commit** (якщо були дрібні фікси після smoke)

```bash
git commit -m "fix: digest/conduct smoke fixes"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| SQL `river_bank_scope`, `digest_enabled` | 1 |
| Conduct filter by bank | 3 |
| Digest 09:00, per-teacher, opt-in | 2, 4 |
| Digest sections pending/low/expired | 2 |
| Bank filter on digest content | 2 |
| Signup unchanged | 3 (explicit) |
| Admin UI select + checkbox | 5 |
| No TELEGRAM_ADMIN_CHAT_ID | — (not added) |
| Payout to conducting teacher unchanged | — (no change to notifyConductingTeacherPayout) |
