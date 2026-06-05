# Teacher Bank Scope + Daily Digest — Design Spec

Дата: 2026-06-05  
Статус: затверджено для writing-plans

## Контекст

В адмінці BBM є учні, абонементи, Telegram-голосування по берегах (групи left/right) і приватні повідомлення викладачам «Я провожу». Зараз **усім** викладачам з `chat_id` приходить кожне голосування conduct, незалежно від берега заняття.

Окремо планувався ранковий дайджest для адміна. Після ревізії: **дайджest — не окремий admin chat**, а персонально викладачам з галочкою в картці викладача; зміст дайджestу **фільтрується за берегом** викладача (як і conduct-голосування).

## Цілі

1. У налаштуваннях викладача: **берег** (`будь-який` / `лівий` / `правий`) і **галочка «Ранковий дайджest»**.
2. Conduct-голосування («Я провожу») в приватний TG — **лише** викладачам, у яких берег заняття входить у їхній scope.
3. Ранковий дайджest (09:00 Kyiv) — **лише** викладачам з `digest_enabled = true`, `chat_id` заданий; зміст **по їхньому берегу** (або повний, якщо scope = any).
4. Без миттєвих алертів, без DM учням.

## Не-цілі (YAGNI)

- `TELEGRAM_ADMIN_CHAT_ID` — не використовуємо; отримувачі = рядки `teachers`.
- Секції «Помилки finalize», «Підсумок вчора».
- Dashboard в адмінці.
- Заявки з сайту (`POST /api/signup`) — **без змін**, усі викладачі з `chat_id` (берег у заявці не вказується).

---

## Модель даних

Новий SQL-файл `supabase/add_teachers_bank_digest.sql`:

```sql
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

**Мапінг UI ↔ БД:**

| UI (select) | `river_bank_scope` |
|---|---|
| Будь-який | `any` |
| Лівий берег | `left` |
| Правий берег | `right` |

**Default для існуючих рядків:** `river_bank_scope = 'any'`, `digest_enabled = false` (поведінка conduct як зараз; дайджest вимкнений).

---

## Фільтр берега (спільна логіка)

Reuse `parsePlaceRiverBank()` з `server.js` (`«Лівий берег»` → `left`, `«Правий берег»` → `right`).

```js
function teacherMatchesBank(teacherScope, lessonBank) {
  if (teacherScope === 'any') return true;
  if (!lessonBank) return teacherScope === 'any'; // legacy / невизначено → лише any
  return teacherScope === lessonBank;
}
```

`lessonBank` для заняття: з `lesson_snapshot.riverBank` occurrence або `places.river_bank` через `lesson_times.place_id`.

---

## Conduct-голосування («Я провожу»)

**Зараз:** `loadTeacherTargetsWithChatId()` → усі з `chat_id` → `sendMessage` у `startLessonVoteFlow`.

**Стане:**

```js
loadTeacherTargetsWithChatId({ bankFilter: lessonBank })
// SELECT id, name, chat_id, river_bank_scope
// WHERE chat_id IS NOT NULL
//   AND (river_bank_scope = 'any' OR river_bank_scope = :lessonBank)
```

- Групове голосування учасників — **без змін** (як і зараз, у групу left/right за місцем).
- **Payout-повідомлення** (`notifyConductingTeacherPayout`) — **завжди** тому, хто провів (conducting teacher), незалежно від scope.
- Sync «Я провожу» між private chats — лише among teachers who received that vote (already filtered).

---

## Ранковий дайджest

### Розклад

- **09:00** Europe/Kyiv, один раз на день (`dateKey` guard).
- Env: `ADMIN_DIGEST_CRON_TIME=09:00` (default `09:00`).
- Якщо немає жодного teacher з `digest_enabled AND chat_id` — tick пропускається.

### Отримувачі

```sql
SELECT id, name, chat_id, river_bank_scope
FROM teachers
WHERE digest_enabled = true AND chat_id IS NOT NULL
```

Для кожного — **окреме** повідомлення з даними, відфільтрованими під `river_bank_scope`.

### Зміст (без змін секцій, з фільтром берега)

```
📋 BBM — ранковий дайджest · 06.06.2026
Лівий берег

⚠️ Pending абонементи (2)
  ...
🔔 Закінчуються (≤2 заняття) (1)
  ...
⏰ Прострочені абонементи (0)
```

Заголовок берега:
- `any` → «Усі береги»
- `left` → «Лівий берег»
- `right` → «Правий берег»

**Empty state:**

```
✅ BBM — 06.06.2026 · Лівий берег
Нічого термінового. Pending: 0 · Закінчуються: 0 · Прострочені: 0
```

### Фільтр абонементів по берегу

Абонемент = `(student_id, lesson_type_id)`. Берег визначається по **останньому візиту** абонемента:

1. Join `visits` → `lesson_vote_occurrences` → bank з `lesson_snapshot.riverBank` або place.
2. Якщо візитів ще нема (рідкий pending одразу після створення) — bank з occurrence першого/єдиного visit row для цього `subscription_id`; якщо bank невизначений — рядок потрапляє **лише** в дайджest `any`.

Для `river_bank_scope = 'any'` — усі рядки без фільтра bank.

| Секція | Логіка (як раніше) + bank filter |
|---|---|
| Pending | `status = 'pending'` |
| Закінчуються | `active`, remaining ≤ 2 |
| Прострочені | `exhausted` по `valid_until`, remaining > 0 |

Ліміти TG: 10 / 10 / 5 рядків, truncate до 4096.

---

## UI — `admin/teachers.html` + `admin.js`

У формі редагування викладача (разом з Telegram select):

1. **Select «Берег»** — Будь-який / Лівий берег / Правий берег (`river_bank_scope`).
2. **Checkbox «Ранковий дайджest у Telegram»** (`digest_enabled`) — disabled або hint, якщо `chat_id` порожній.

У таблиці викладачів — колонки або бейджі: `@username`, берег, ✓ дайджest.

Insert/update через існуючий Supabase client (RLS для authenticated admin — як для інших полів teachers).

---

## Архітектура

```
lesson-vote-cron.js (09:00 tick)
  └─ admin-notifications.js
       ├─ loadDigestRecipients()
       ├─ buildDigestForScope(supabaseAdmin, scope) → text
       └─ для кожного recipient: sendMessage(chat_id, text)

server.js — startLessonVoteFlow
  └─ loadTeacherTargetsWithChatId({ bankFilter: resolvedGroup.bank })
```

### Файли

| Файл | Дія |
|---|---|
| `supabase/add_teachers_bank_digest.sql` | Нові колонки |
| `admin-notifications.js` | Digest build + send |
| `lesson-vote-cron.js` | Digest tick |
| `server.js` | Фільтр conduct; cron wiring |
| `admin/teachers.html` | Select + checkbox |
| `assets/js/admin.js` | CRUD полів, таблиця |

---

## Env

| Змінна | Опис |
|---|---|
| `ADMIN_DIGEST_CRON_TIME` | `HH:MM`, default `09:00` |
| `TELEGRAM_BOT_TOKEN` | вже є |

`TELEGRAM_ADMIN_CHAT_ID` — **не потрібен**.

---

## Тестування

1. Teacher `left` + заняття на лівому березі → conduct DM так; на правому — ні.
2. Teacher `any` → conduct для обох.
3. `digest_enabled` → одне повідомлення о 9:00; `false` → нічого.
4. Два teachers (left + right) з digest → різний зміст pending.
5. Regression: payout conduct-teacher завжди отримує повідомлення.

---

## Порядок впровадження

1. SQL міграція + deploy.
2. UI викладачів.
3. Фільтр conduct у `server.js`.
4. `admin-notifications.js` + cron.
5. Manual smoke.
