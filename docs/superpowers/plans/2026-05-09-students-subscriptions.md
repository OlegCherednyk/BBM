# Students + Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматично створювати учнів і візити з finalized Telegram-голосувань, вести абонементи по типу заняття з pending-заповненням адміном, rollback «не був», щоденне exhausted за `valid_until`, і дати сторінку адмінки «Учні».

**Architecture:** Нові таблиці `students`, `subscriptions`, `visits` у Postgres з RLS «deny для anon/authenticated» (доступ лише через `SUPABASE_SERVICE_ROLE_KEY` у Express). Логіка `applyVisitsAfterFinalize` і CRUD — у новому модулі `students-api.js`; `server.js` лише імпортує, реєструє маршрути і викликає `applyVisitsAfterFinalize` після успішного `markLessonVoteOccurrenceFinalizedInDb`. Адмін-UI для цих даних ходить **тільки** в `/api/admin/...` (не через клієнтський `supabase.from`, бо RLS закриє прямий доступ).

**Tech Stack:** Node.js (ESM), Express 5, `@supabase/supabase-js`, Luxon (існуючий), статична адмінка (`admin/*.html`, `assets/js/admin.js` + новий `admin-students.js`).

**Spec:** `docs/superpowers/specs/2026-05-09-students-subscriptions-design.md`

**Важлива уточнення до спеку (псевдокод у спеку був двозначний):** колонка `subscriptions.total_visits` зберігає **куплений розмір пакета** (наприклад 8) і **не зменшується** при finalize. «Залишилось» = `total_visits - count(visits where subscription_id = sub.id and visit_status = 'attended')`. Статус перераховує лише `recomputeSubscriptionStatus`.

---

## File map (створити / змінити)

| Файл | Відповідальність |
|------|------------------|
| `supabase/add_students_table.sql` | Таблиця `students` + RLS deny |
| `supabase/add_subscriptions_table.sql` | Таблиця `subscriptions` + partial unique (active per type) + RLS deny |
| `supabase/add_visits_table.sql` | Таблиця `visits` + unique `(student_id, lesson_vote_occurrence_id)` + RLS deny |
| `supabase/add_lesson_vote_occurrences_post_finalize_errors.sql` | Колонка `post_finalize_errors jsonb` |
| `students-api.js` | `applyVisitsAfterFinalize`, `expireOverdueSubscriptions`, `recomputeSubscriptionStatus`, `registerStudentRoutes`, helpers |
| `server.js` | Імпорт модуля, `registerStudentRoutes`, виклик `applyVisitsAfterFinalize` у `finalizeLessonVoteOccurrence` після успішного finalize в БД; розширення `lesson_snapshot` при insert occurrence |
| `lesson-vote-cron.js` | Щоденний tick о 03:00 Europe/Kyiv для `expireOverdueSubscriptions` |
| `admin/students.html` | Нова сторінка (та сама обгортка що `admin/teachers.html`) |
| `assets/js/admin-students.js` | Логіка списку, деталей, форм |
| `assets/js/admin.js` | `data-admin-page="students"`, навігація, за потреби дрібні хелпери |
| `assets/css/admin.css` | Лише якщо не вистачає існуючих класів |
| Усі `admin/*.html` з `adminNavJumps` | Додати пункт «Учні» між «Викладачі» і «Заняття» |
| `docs/superpowers/specs/2026-05-09-students-subscriptions-design.md` | Опційно: одна правка — прибрати рядок `active_sub.total_visits -= 1` з псевдокоду (узгодити з реалізацією) |

---

### Task 1: SQL — `students`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\supabase\add_students_table.sql`

- [ ] **Step 1: Додати SQL-файл**

Вміст файлу (повний):

```sql
-- Учні: ідентифікація по Telegram user id; доступ лише через service role (RLS deny).
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  display_name text not null,
  telegram_username text,
  instagram text,
  phone text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_telegram_user_id_unique unique (telegram_user_id),
  constraint students_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create index if not exists students_telegram_user_id_idx on public.students(telegram_user_id);

alter table public.students enable row level security;

drop policy if exists "deny_all_students" on public.students;
create policy "deny_all_students"
on public.students
for all
to anon, authenticated
using (false)
with check (false);
```

- [ ] **Step 2: Застосувати в Supabase SQL Editor і перевірити**

Run: виконати весь скрипт у Supabase → SQL Editor.

Expected: `select * from public.students limit 1` — порожньо, без помилки.

- [ ] **Step 3: Commit**

```bash
git add supabase/add_students_table.sql
git commit -m "db: add students table with RLS deny for client roles"
```

---

### Task 2: SQL — `subscriptions`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\supabase\add_subscriptions_table.sql`

- [ ] **Step 1: Додати SQL-файл**

```sql
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types(id) on delete restrict,
  total_visits integer,
  amount_uah integer,
  purchased_at date,
  valid_until date,
  status text not null default 'pending'
    check (status in ('pending','active','exhausted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_total_visits_positive check (total_visits is null or total_visits > 0),
  constraint subscriptions_amount_non_negative check (amount_uah is null or amount_uah >= 0)
);

create unique index if not exists subscriptions_one_active_per_type_idx
  on public.subscriptions(student_id, lesson_type_id)
  where status = 'active';

create index if not exists subscriptions_student_id_idx on public.subscriptions(student_id);
create index if not exists subscriptions_lesson_type_id_idx on public.subscriptions(lesson_type_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.subscriptions enable row level security;

drop policy if exists "deny_all_subscriptions" on public.subscriptions;
create policy "deny_all_subscriptions"
on public.subscriptions
for all
to anon, authenticated
using (false)
with check (false);
```

- [ ] **Step 2: Застосувати в Supabase, перевірити**

`select column_name from information_schema.columns where table_name = 'subscriptions';`

- [ ] **Step 3: Commit**

```bash
git add supabase/add_subscriptions_table.sql
git commit -m "db: add subscriptions table with partial unique active per type"
```

---

### Task 3: SQL — `visits`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\supabase\add_visits_table.sql`

- [ ] **Step 1: Додати SQL-файл**

```sql
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_vote_occurrence_id uuid not null
    references public.lesson_vote_occurrences(id) on delete cascade,
  vote_choice text not null check (vote_choice in ('abon','single')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  visit_status text not null default 'attended'
    check (visit_status in ('attended','rolled_back')),
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  constraint visits_student_occurrence_unique unique (student_id, lesson_vote_occurrence_id)
);

create index if not exists visits_occurrence_id_idx on public.visits(lesson_vote_occurrence_id);
create index if not exists visits_student_id_idx on public.visits(student_id);
create index if not exists visits_subscription_id_idx on public.visits(subscription_id);

alter table public.visits enable row level security;

drop policy if exists "deny_all_visits" on public.visits;
create policy "deny_all_visits"
on public.visits
for all
to anon, authenticated
using (false)
with check (false);
```

- [ ] **Step 2: Застосувати в Supabase**

- [ ] **Step 3: Commit**

```bash
git add supabase/add_visits_table.sql
git commit -m "db: add visits table for per-occurrence attendance"
```

---

### Task 4: SQL — `post_finalize_errors`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\supabase\add_lesson_vote_occurrences_post_finalize_errors.sql`

- [ ] **Step 1: Додати SQL**

```sql
alter table public.lesson_vote_occurrences
  add column if not exists post_finalize_errors jsonb;
```

- [ ] **Step 2: Застосувати в Supabase**

- [ ] **Step 3: Commit**

```bash
git add supabase/add_lesson_vote_occurrences_post_finalize_errors.sql
git commit -m "db: add post_finalize_errors to lesson_vote_occurrences"
```

---

### Task 5: `students-api.js` — helpers і `recomputeSubscriptionStatus`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\students-api.js`

- [ ] **Step 1: Створити модуль з утилітами**

Мінімальний каркас (розширити в наступних тасках):

```js
import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function resolveLessonTypeIdForOccurrence(supabaseAdmin, row) {
  const snap = row?.lesson_snapshot;
  if (snap && typeof snap.lesson_type_id === "string" && snap.lesson_type_id.trim()) {
    return snap.lesson_type_id.trim();
  }
  const lessonTimeId = row?.lesson_time_id;
  if (!lessonTimeId) return null;
  const { data, error } = await supabaseAdmin
    .from("lesson_times")
    .select("lesson_type_id")
    .eq("id", lessonTimeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.lesson_type_id ? String(data.lesson_type_id) : null;
}

/**
 * total_visits = куплений пакет (8). Залишок = total_visits - attendedCount.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 */
export async function recomputeSubscriptionStatus(supabaseAdmin, subscriptionId) {
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("id, total_visits, valid_until, status")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!sub) return;

  const { count, error: cntErr } = await supabaseAdmin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .eq("visit_status", "attended");
  if (cntErr) throw new Error(cntErr.message);
  const attached = Number(count) || 0;

  let nextStatus = sub.status;
  if (sub.total_visits == null) {
    nextStatus = "pending";
  } else {
    const todayKyiv = DateTime.now().setZone(KYIV_TZ).toISODate();
    if (sub.valid_until && String(sub.valid_until) < String(todayKyiv)) {
      nextStatus = "exhausted";
    } else if (attached >= Number(sub.total_visits)) {
      nextStatus = "exhausted";
    } else {
      nextStatus = "active";
    }
  }

  if (nextStatus === sub.status) return;

  const { error: upErr } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (upErr) throw new Error(upErr.message);
}
```

- [ ] **Step 2: Перевірка синтаксису**

Run: `node --check students-api.js`  
Expected: без виводу (exit 0).

- [ ] **Step 3: Commit**

```bash
git add students-api.js
git commit -m "feat(students): add lesson_type resolver and subscription status recompute"
```

---

### Task 6: `students-api.js` — `applyVisitsAfterFinalize`

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\students-api.js`

- [ ] **Step 1: Імпортувати / скопіювати формат snapshot голосів**

У `server.js` уже є `votesByKind` як `{ abon: Map, single: Map, skip: Map }` з ключами `String(telegram_user_id)`. У `finalizeLessonVoteOccurrence` після `markResult` передай у `applyVisitsAfterFinalize` об’єкт `row` (з `id`, `lesson_time_id`, `lesson_snapshot`) і `votesByKind` **або** фінальний `votesByKindToSnapshot` — зручніше передати `votesByKind` з `finalizeLessonVoteOccurrence` щоб не парсити JSON двічі.

- [ ] **Step 2: Реалізувати `applyVisitsAfterFinalize(supabaseAdmin, { occurrenceRow, votesByKind })`**

Алгоритм:

1. `const lessonTypeId = await resolveLessonTypeIdForOccurrence(...)` — якщо `null`, записати в `post_finalize_errors` масив елемент `{ at, code: "missing_lesson_type_id" }` і `return` (finalize вже пройшов).
2. Для `votesByKind.abon`: для кожної пари `(uidStr, displayName)`:
   - `telegram_user_id = BigInt(uidStr)` у try/catch; при помилці — append до `post_finalize_errors`, continue.
   - `upsert` у `students` (`onConflict: "telegram_user_id"`).
   - Якщо вже є рядок у `visits` для `(student_id, occurrence_id)` — skip.
   - Знайти `subscriptions` де `student_id`, `lesson_type_id`, `status = 'active'`, order `created_at`, limit 1`.
   - Якщо є: `insert visit` з `subscription_id`, `vote_choice: 'abon'`, `visit_status: 'attended'`; потім `recomputeSubscriptionStatus(subscription.id)`.
   - Якщо немає: `insert subscription` pending (`total_visits: null`, `status: 'pending'`), потім `insert visit` з цим `subscription_id`.
3. Для `votesByKind.single`: так само upsert student, insert visit з `subscription_id: null`, `vote_choice: 'single'`.
4. Оновити `lesson_vote_occurrences.post_finalize_errors` — merge: якщо масив, append; якщо порожньо — set null або `[]` за домовленістю (рекомендовано: завжди jsonb **масив** подій).

- [ ] **Step 3: Перевірка синтаксису**

Run: `node --check students-api.js`

- [ ] **Step 4: Commit**

```bash
git add students-api.js
git commit -m "feat(students): apply visits after lesson vote finalize"
```

---

### Task 7: `server.js` — hook finalize + `lesson_type_id` у snapshot

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\server.js`

- [ ] **Step 1: Імпорт**

На початку файлу після інших import:

```js
import { applyVisitsAfterFinalize, registerStudentRoutes } from "./students-api.js";
```

- [ ] **Step 2: Розширити `loadLessonContext` у `server.js`**

Функція `loadLessonContext(lessonTimeId, placeId)` зараз будує лише підписи. Зміни:

1. У гілці `if (!supabaseAdmin)` повертати також `lessonTypeId: null`.
2. Оголосити `let lessonTypeId = null;` перед блоком `if (lessonTimeId)`.
3. У запиті до `lesson_times` замінити `.select("day_of_week, start_time, lesson_types(name)")` на `.select("day_of_week, start_time, lesson_types(name, id)")`.
4. Після `if (data) { ... }` встановити `lessonTypeId = data.lesson_types?.id ?? null`.
5. У `return { ... }` в кінці функції додати `lessonTypeId`.

У `executeLessonAttendanceVote` при збірці `lessonSnapshot` додати:

```js
const lessonSnapshot = {
  lessonTimeLabel: lessonContext.lessonTimeLabel,
  placeLabel: lessonContext.placeLabel,
  lessonTypeLabel: lessonContext.lessonTypeLabel,
  riverBank: lessonContext.riverBank,
  lesson_type_id: lessonContext.lessonTypeId ?? null,
};
```

Ключ у JSON: **`lesson_type_id`** (string UUID або null), узгоджено з `resolveLessonTypeIdForOccurrence` у `students-api.js`.

- [ ] **Step 3: Виклик `applyVisitsAfterFinalize` у `finalizeLessonVoteOccurrence`**

Одразу після:

```js
const markResult = await markLessonVoteOccurrenceFinalizedInDb(row.id, votesByKind, conductingDisplayName);
if (!markResult.ok) {
  console.error("Failed to finalize lesson_vote_occurrences row:", markResult.error);
  return;
}

try {
  await applyVisitsAfterFinalize(supabaseAdmin, { occurrenceRow: row, votesByKind });
} catch (e) {
  console.error("applyVisitsAfterFinalize:", e?.message || e);
}
```

Далі без змін: `persistFinalizedVotesToLessonRow`, `notifyConductingTeacherPayout`.

- [ ] **Step 4: Зареєструвати маршрути**

Після створення `app` і `supabaseAdmin`, перед `app.listen` (або поруч з іншими `app.get/post`):

```js
registerStudentRoutes(app, supabaseAdmin);
```

- [ ] **Step 5: Перевірка**

Run: `node --check server.js`

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(lesson-votes): persist lesson_type_id in snapshot and apply student visits after finalize"
```

---

### Task 8: `students-api.js` — HTTP routes (CRUD + visits + occurrence visits)

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\students-api.js`

- [ ] **Step 1: Реалізувати `registerStudentRoutes(app, supabaseAdmin)`**

Поведінка узгоджена з існуючими `/api/admin/*` у `server.js`: **без додаткового Bearer** (як `GET /api/admin/lesson-votes/open`). Якщо пізніше додасте auth — обгорнути один middleware.

Ендпоінти (тіло JSON, відповіді `{ ok: true, ... }` / `{ ok: false, error }`):

| Метод | Path | Поведінка |
|--------|------|-----------|
| GET | `/api/admin/students` | Query `search`, `filter` (`all` \| `pending` \| `active` \| `exhausted`). Повернути список з агрегатами (можна 2–3 запити або один RPC пізніше; MVP — кілька select + JS merge). |
| GET | `/api/admin/students/:id` | Student + subscriptions + останні N visits (наприклад 100) з join до `lesson_vote_occurrences` для дати/місця за потреби. |
| POST | `/api/admin/students` | Ручне створення (обов’язково `telegram_user_id` + `display_name`). |
| PATCH | `/api/admin/students/:id` | Оновлення полів контакту. |
| DELETE | `/api/admin/students/:id` | Cascade з БД; перед delete порахувати visits і повернути в JSON для `confirm` на клієнті. |
| POST | `/api/admin/subscriptions` | Upsert pending за `(student_id, lesson_type_id)` або створити новий; якщо передано `total_visits` — set поля + `recomputeSubscriptionStatus`. |
| PATCH | `/api/admin/subscriptions/:id` | Оновлення полів + `recomputeSubscriptionStatus`. |
| DELETE | `/api/admin/subscriptions/:id` | Delete row (visits → `subscription_id` null через FK). |
| POST | `/api/admin/visits/:id/rollback` | Toggle `visit_status`, `rolled_back_at`; якщо є `subscription_id` — `recomputeSubscriptionStatus`. |
| GET | `/api/admin/lessons/:occurrenceId/visits` | Список visits для occurrence (для UI в `lessons`). |

- [ ] **Step 2: Перевірка синтаксису**

Run: `node --check students-api.js` і `node --check server.js`

- [ ] **Step 3: Ручний smoke (сервер запущений)**

Run: `npm start` у одному терміналі; в іншому:

```bash
curl -s "http://localhost:8080/api/admin/students?filter=all"
```

Expected: `{ "ok": true, "rows": [] }` або порожній масив після міграцій.

- [ ] **Step 4: Commit**

```bash
git add students-api.js
git commit -m "feat(students): add admin HTTP API for students, subscriptions, visits"
```

---

### Task 9: `lesson-vote-cron.js` — expire subscriptions

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\lesson-vote-cron.js`
- Modify: `c:\Users\ochrdnk\Desktop\BBM\server.js` (передача `expireOverdueSubscriptions` у `startDailyLessonVoteCron`, якщо потрібно інжектити залежність)

- [ ] **Step 1: Експортувати `expireOverdueSubscriptions` з `students-api.js`** (якщо ще не зроблено в Task 8)

Логіка: вибрати `subscriptions` з `status = 'active'` і `valid_until is not null` і `valid_until < today_kyiv`; для кожного `await recomputeSubscriptionStatus(...)`. Лог одним рядком.

- [ ] **Step 2: Розширити `startDailyLessonVoteCron`**

Додати опційні параметри `expireSubscriptionsDailyTime` (string `HH:MM`) і `expireOverdueSubscriptions`. Якщо час валідний — так само як create/close, один раз на календарний день о 03:00 викликати `expireOverdueSubscriptions`.

Альтернатива (простіше): викликати `expireOverdueSubscriptions` **всередині існуючого** create-run одразу після `logOpenLessonVotes` (один раз на день уже є) — тоді не потрібна нова env-змінна. Узгодити з власником продукту; у плані зафіксовано **простий варіант**: викликати expire **разом з існуючим daily create tick** (той самий `dateKey` guard), щоб не множити cron-часи.

- [ ] **Step 3: У `server.js` при виклику `startDailyLessonVoteCron({...})` передати `expireOverdueSubscriptions`**

- [ ] **Step 4: Commit**

```bash
git add lesson-vote-cron.js server.js students-api.js
git commit -m "feat(students): expire overdue subscriptions on daily lesson-vote cron tick"
```

---

### Task 10: Адмін UI — `students.html` + `admin-students.js`

**Files:**
- Create: `c:\Users\ochrdnk\Desktop\BBM\admin\students.html`
- Create: `c:\Users\ochrdnk\Desktop\BBM\assets\js\admin-students.js`
- Modify: `c:\Users\ochrdnk\Desktop\BBM\assets\js\admin.js` — розгалуження за `document.body.dataset.adminPage === "students"` (імпорт динамічний `import("./admin-students.js")` або підключити script у HTML як інші сторінки)

- [ ] **Step 1: Скопіювати каркас з `admin/teachers.html`**

Замінити `data-admin-page`, заголовок, основний контент на контейнери: `#studentsList`, `#studentDetail`, `#studentsError`.

- [ ] **Step 2: Реалізувати `admin-students.js`**

- Завантаження `GET /api/admin/students?search=&filter=`
- Клік по картці → `GET /api/admin/students/:id`
- PATCH student, POST subscription, DELETE з `confirm`
- Відобразити pending/active/exhausted за полями API

- [ ] **Step 3: Перевірка в браузері**

Відкрити `http://localhost:8080/admin/students.html`, увійти як адмін, переконатися що список рендериться.

- [ ] **Step 4: Commit**

```bash
git add admin/students.html assets/js/admin-students.js assets/js/admin.js
git commit -m "feat(admin): add students page and client module"
```

---

### Task 11: Навігація у всіх admin HTML

**Files:**
- Modify: `admin/prices.html`, `admin/places.html`, `admin/teachers.html`, `admin/lessons.html`, `admin/stats.html`, `admin/lesson-types.html`, `admin/students.html` (`admin/index.html` — без `adminNavJumps`, не чіпати для навігації)

- [ ] **Step 1: У `<ol id="adminNavJumps">` вставити після «Викладачі»:**

```html
<li><a href="students.html">Учні</a></li>
```

На `students.html` — `aria-current="page"` на цьому пункті.

- [ ] **Step 2: Commit**

```bash
git add admin/*.html
git commit -m "chore(admin): add Students link to admin nav"
```

---

### Task 12: `lessons.html` / `admin.js` — rollback UI

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\assets\js\admin.js` (функції `renderLessonRowView` / детальний перегляд finalized заняття — знайти місце рендеру `vote_snapshot` або counts)

- [ ] **Step 1: Після завантаження рядка заняття з `lesson_vote_occurrence_id` викликати `GET /api/admin/lessons/:occurrenceId/visits`**

- [ ] **Step 2: Для кожного visit показати ім’я + кнопку «Не був(ла)»**

`POST /api/admin/visits/:id/rollback` по кліку, потім перерендер.

- [ ] **Step 3: Commit**

```bash
git add assets/js/admin.js
git commit -m "feat(admin): visit rollback controls on finalized lessons"
```

---

### Task 13 (опційно): Mini-dashboard на `admin/index.html`

**Files:**
- Modify: `c:\Users\ochrdnk\Desktop\BBM\admin\index.html`, `assets/js/admin.js`

- [ ] **Step 1: Після успішного входу — `fetch("/api/admin/students?filter=pending")` і показати лінк «N pending абонементів» → `students.html?filter=pending`**

- [ ] **Step 2: Commit** (або пропустити як YAGNI)

---

## Self-review (plan vs spec)

| Вимога спеку | Таск |
|----------------|------|
| Таблиці students / subscriptions / visits | 1–3 |
| post_finalize_errors | 4, 6 |
| applyVisits після finalize, ідемпотентність | 6–7 |
| Учень з single і abon | 6 |
| Pending sub без active | 6 |
| total_visits = пакет, не decrement | 5, 6 (узгоджено з планом) |
| recompute + valid_until | 5, 9 |
| Rollback UI | 12 |
| API CRUD | 8 |
| Сторінка Учні | 10–11 |
| lesson_type_id у snapshot / fallback | 7 |
| Не видаляти автоматично | поведінка recompute + без auto-delete у SQL |

**Placeholder scan:** немає TBD/TODO у критичних кроках.

**Type consistency:** `lesson_type_id` у JSON snapshot — string UUID; у БД uuid; Supabase приймає string.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-students-subscriptions.md`.**

**1. Subagent-Driven (recommended)** — окремий субагент на кожен Task, ревʼю між тасками, швидка ітерація. **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development.

**2. Inline Execution** — виконувати таски в цій сесії з checkpoints. **REQUIRED SUB-SKILL:** superpowers:executing-plans.

Який підхід обираєш?
