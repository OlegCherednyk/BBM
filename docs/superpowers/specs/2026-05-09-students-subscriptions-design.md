# Учні + Абонементи — Design Spec

Дата: 2026-05-09
Статус: затверджено для writing-plans

## Контекст

В адмінці `mozok.tilo.ruh` уже є: ціни, місця, викладачі, типи занять, голосування у Telegram (з cron-автозапуском і дворежимним фіналайзом по «лівий/правий берег»), статистика виплат викладачам. Відсутня сутність «учень». Через це:

- Невідомо, у кого скільки занять залишилось у абонементі.
- Не можна порахувати retention, активних учнів, конверсію з заявки.
- Фінансова статистика обмежується виплатами викладачам, без обліку проданих абонементів.

Цей спек описує мінімальну (MVP) інтеграцію учнів і абонементів, яка автоматично заповнюється з існуючого Telegram-голосування.

## Цілі

1. Кожна людина, що проголосувала «Абонемент» або «Разове», з'являється в системі як учень.
2. Адмін бачить активні / pending / вичерпані абонементи кожного учня та повну історію відвідувань.
3. Списання заняття з абонементу відбувається автоматично при finalize голосування з можливістю «відкоту» (rollback) якщо людина фактично не прийшла.
4. Жодне видалення (учня, абонементу) не виконується системою — тільки адміном вручну.

## Не-цілі (явно YAGNI на MVP)

- Експорт даних (CSV, JSON).
- Графіки відвідуваності в картці учня.
- Авто-merge дублікатів-учнів.
- Багаті фільтри по тегам / даті першого візиту.
- Backfill історичних даних з минулих finalized голосувань (старт «з нуля»).
- Інтеграція з заявками з форми сайту (`/api/signup`) — це окремий проект (#2 з brainstorm).

---

## Модель даних

Три нові таблиці + одна додаткова колонка в `lesson_vote_occurrences`. Усе як окремі SQL-файли в `supabase/`, ідемпотентні (`if not exists`), за прийнятим у проекті патерном.

### `students`

```sql
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  display_name text not null,
  telegram_username text,
  instagram text,
  phone text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `telegram_user_id` — основний ідентифікатор. Якщо людина голосує з другого tg-акаунту, це окремий учень. Об'єднання — ручна задача адміна.
- `display_name` — оновлюється з кожного `upsert_student` за свіжим значенням з `votes_snapshot`.

### `subscriptions`

```sql
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types(id) on delete restrict,
  total_visits integer,                  -- NULL = pending, чекає адміна
  amount_uah integer,                    -- сума оплати (для фін.статистики)
  purchased_at date,                     -- адмін вибирає
  valid_until date,                      -- "дійсний до", адмін вибирає
  status text not null default 'pending'
    check (status in ('pending','active','exhausted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_one_active_per_type
  on public.subscriptions(student_id, lesson_type_id)
  where status = 'active';
```

- Один **active** абонемент на пару `(student, lesson_type)`. Pending — будь-яка кількість (теоретично; на практиці максимум 1 на тип).
- `total_visits IS NULL` ⇒ `status = 'pending'` (інваріант підтримується додатком).
- При заповненні `total_visits` додатком: `status` стає `active` (або одразу `exhausted` якщо total ≤ visits-attached).
- При списанні останнього заняття або minute past `valid_until` ⇒ `exhausted`. Видалення тільки вручну.

### `visits`

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
  unique(student_id, lesson_vote_occurrence_id)
);
```

- `subscription_id ON DELETE SET NULL` — якщо адмін видалив абонемент, історія візиту лишається (з NULL — позначається в UI як «sub видалено»).
- Унікальність `(student_id, occurrence_id)` гарантує ідемпотентність `applyVisitsAfterFinalize`.

### Колонка для журналу помилок

```sql
alter table public.lesson_vote_occurrences
  add column if not exists post_finalize_errors jsonb;
```

`applyVisitsAfterFinalize` пише сюди структуровані помилки (наприклад, `{"telegram_user_id":..., "error":"..."}`), щоб не зривати finalize і дати можливість донарахувати наступним проходом.

---

## Логіка під час finalize

Нова функція `applyVisitsAfterFinalize(supabaseAdmin, occurrence)`. Викликається в `server.js` одразу після того, як `lesson_vote_occurrences.status` стало `finalized` (і в API `POST /api/telegram/lesson-votes/close`, і в cron `closeOpenVotesForToday`). Ідемпотентна.

### Псевдокод

`lesson_type_id` для пошуку абонемента береться з `occurrence.lesson_snapshot.lesson_type_id` (snapshot формується при створенні голосування з `lesson_times`). Якщо snapshot його не містить — fallback `select lt.lesson_type_id from lesson_times lt where lt.id = occurrence.lesson_time_id`.

```
для кожного запису у votes_snapshot.abon (telegram_user_id → display_name):
  if visit вже існує (student×occurrence) → skip
  student = upsert_student(telegram_user_id, display_name)
  active_sub = find_active_subscription(student.id, lesson_type_id)
  if active_sub:
    insert visit(..., subscription_id=active_sub.id, vote_choice='abon', attended)
    active_sub.total_visits -= 1
    recompute_subscription_status(active_sub)
  else:
    pending_sub = insert subscription(student_id, lesson_type_id,
                                       total_visits=NULL, status='pending')
    insert visit(..., subscription_id=pending_sub.id, vote_choice='abon', attended)

для кожного запису у votes_snapshot.single:
  if visit вже існує (student×occurrence) → skip
  student = upsert_student(telegram_user_id, display_name)
  insert visit(..., subscription_id=NULL, vote_choice='single', attended)

для skip → нічого
```

### Ключові інваріанти

- **`upsert_student`** = `INSERT ... ON CONFLICT (telegram_user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`.
- **Pending-«заглушка»** при відсутності active sub фіксує факт відвідування і дає адміну зрозумілий next-step «оформи абонемент». Заповнюючи pending, адмін вказує `total_visits` — додаток віднімає вже attached visits і виставляє правильний статус (active/exhausted).
- **Помилки** не зривають finalize — пишуться в `post_finalize_errors`.

### `recompute_subscription_status(sub)`

Центральна функція переходів. Викликається після будь-якої зміни `total_visits`, `valid_until`, або attached visits.

```
attached = count visits where subscription_id = sub.id and visit_status='attended'
remaining = (sub.total_visits ?? 0) - attached  -- "залишилось"

if sub.total_visits is null:
  sub.status = 'pending'
elif sub.valid_until is not null and sub.valid_until < today:
  sub.status = 'exhausted'
elif sub.total_visits - attached <= 0:
  sub.status = 'exhausted'
else:
  sub.status = 'active'
```

Зауваження про відображення: «8/8» в UI = `total_visits` (доступно з купівлі) і `total_visits - attached` (залишилось). Список UI показує обидва.

### Rollback (учень не прийшов)

```
toggle visit.visit_status:
  if attended → rolled_back, rolled_back_at = now()
  if rolled_back → attended, rolled_back_at = null

в обох випадках:
  if visit.subscription_id is not null:
    recompute_subscription_status(sub)
    -- attached count перерахується автоматично, sub може ожити з exhausted в active
```

### Daily expiration tick

Додатковий tick у `lesson-vote-cron.js` (раз на добу о 03:00 за Києвом):

```
для кожного active sub з valid_until < today:
  recompute_subscription_status(sub)  -- виставить exhausted
  лог: [subscriptions-expire] checked=N expired=K
```

---

## API

Усі під префіксом `/api/admin/students*` і `/api/admin/subscriptions*`. Auth через існуючий механізм (bearer-токен сесії Supabase + перевірка `admin_allowlist` на сервері, як уже зроблено для інших admin-ендпоінтів).

| Метод | Шлях | Тіло / Параметри | Опис |
|---|---|---|---|
| GET | `/api/admin/students` | `?search=&filter=pending\|active\|exhausted\|all` | Список з summary по абонементам і last_visit_at |
| GET | `/api/admin/students/:id` | — | Повна картка: дані + всі subscriptions + visits |
| POST | `/api/admin/students` | `{ display_name, telegram_user_id?, telegram_username?, instagram?, phone?, admin_note? }` | Ручне створення (рідко) |
| PATCH | `/api/admin/students/:id` | будь-яке з полів | Редагування |
| DELETE | `/api/admin/students/:id` | — | Cascade на subs+visits, з підтвердженням «N візитів буде видалено» |
| POST | `/api/admin/subscriptions` | `{ student_id, lesson_type_id, total_visits, amount_uah, purchased_at, valid_until }` | Створити АБО заповнити існуючий pending (`(student, lesson_type)` — оновлюється pending, якщо є) |
| PATCH | `/api/admin/subscriptions/:id` | будь-яке з: `total_visits, valid_until, amount_uah, purchased_at` | Редагування |
| DELETE | `/api/admin/subscriptions/:id` | — | Видаляє sub, visits лишаються з NULL subscription_id |
| POST | `/api/admin/visits/:id/rollback` | — | Toggle attended ↔ rolled_back, recompute sub status |
| GET | `/api/admin/lessons/:occurrence_id/visits` | — | Для рендеру кнопок rollback у `lessons.html` (теж у `students-api.js`, тематично належить) |

Усі змінювальні ендпоінти повертають оновлений запис, щоб клієнт міг перерендерити без додаткових запитів.

---

## Структура файлів

### Нові

- `supabase/add_students_table.sql`
- `supabase/add_subscriptions_table.sql`
- `supabase/add_visits_table.sql`
- `supabase/add_lesson_vote_occurrences_post_finalize_errors.sql`
- `students-api.js` — модуль рівня кореня (по аналогії з `lesson-vote-cron.js`). Експортує:
  - `registerStudentRoutes(app, supabaseAdmin)` — реєструє всі CRUD-ендпоінти.
  - `applyVisitsAfterFinalize(supabaseAdmin, occurrence)` — виклик з finalize-flow.
  - `recomputeSubscriptionStatus(supabaseAdmin, subscriptionId)` — внутрішній helper, експорт для тестування.
  - `expireOverdueSubscriptions(supabaseAdmin)` — для daily cron.
- `admin/students.html` — структура аналогічна іншим (login + nav + main).
- `assets/js/admin-students.js` — модуль логіки сторінки (список, search, модал деталей, форми sub-ів).

### Модифікувати

- `server.js`:
  - `import { registerStudentRoutes, applyVisitsAfterFinalize } from "./students-api.js"`
  - Виклик `registerStudentRoutes(app, supabaseAdmin)` після інших routes.
  - У місці finalize (як у `POST /api/telegram/lesson-votes/close`, так і всередині `closeOpenVotesForToday`) — після успішного `update status='finalized'` викликати `await applyVisitsAfterFinalize(supabaseAdmin, occurrence)` (і логувати помилки, але не пробрасувати).
- `lesson-vote-cron.js`:
  - Новий tick раз на добу о 03:00 (Київ): `await expireOverdueSubscriptions(supabaseAdmin)`.
- `assets/js/admin.js` (або у відповідному модулі рендеру):
  - Додати пункт «Учні» в `adminNavJumps` (є в усіх 7 admin-html, треба оновити масив + всі html).
  - У рендері finalized заняття на `lessons.html` — нова секція «Учні» з кнопками rollback (підтягує `GET /api/admin/lessons/:occurrence_id/visits`).
- Усі 7 файлів `admin/*.html` (і новий `students.html`) — оновити навігаційний `<ol id="adminNavJumps">` додавши `<li><a href="students.html">Учні</a></li>` у правильне місце (між «Викладачі» і «Заняття»).

CSS — переважно reuse: `admin-panel`, `admin-grid`, `admin-field`, `btn`, `admin-alert`. Якщо потрібні мінімальні нові класи (наприклад, прогрес-бар «3/8») — у `assets/css/admin.css`.

---

## UI

### `admin/students.html` — список

- Шапка: «Учні» + кнопка `+ Новий учень`.
- Поле пошуку: ім'я / @username / instagram.
- Фільтр: всі / pending / active / exhausted.
- Картки учнів:
  - Ім'я + бейдж статусу (🟢 active / ⚠ pending / ⚫ exhausted / ⚫ немає sub).
  - Контакти (telegram, instagram, якщо є).
  - Список абонементів: «Тренаж 8/8 до 10.07», «Сучасний 3/8 до 15.06».
  - «Останній візит: вчора · Всього: 14».
  - Кнопка «Відкрити →» — розгортає панель деталей.

### Панель/модал деталей

- Секція «Контактні дані» — редаговані поля + «Зберегти».
- Секція «Абонементи» — картка кожного sub з `[Редагувати]` `[🗑]`. Pending sub показується першим зі стилем «потребує заповнення».
- Форма «+ Новий абонемент» / «Заповнити pending»:
  - Тип (з `lesson_types`).
  - Кількість (auto-fill з `prices` якщо є match).
  - Сума (теж auto-fill з `prices`).
  - Куплено (date-picker, дефолт = сьогодні).
  - Дійсний до (date-picker, дефолт = +2 місяці).
- Секція «Історія візитів» — хронологічний список (з пагінацією або «показати ще»).

### Інтеграція в `admin/lessons.html`

В картці finalized заняття після списку голосів — секція «Учні»:

```
✓ Настя К.   абон    Тренаж     [↻ Не була]
✓ Олег П.   разове               [↻ Не був]
```

Натискання `↻` — toggle. Після rollback:

```
✗ Настя К.   абон    [перекреслено]   [↻ Повернути]
```

### `admin/index.html` (login → mini-dashboard)

Опціонально на MVP: після успішного входу з'являється короткий блок «що чекає твоєї уваги» з кількістю pending абонементів і посиланням на `students.html?filter=pending`. Якщо часу нема — просто посилання на «Учні» в навігації, без dashboard.

---

## Помилки та edge-cases

- **Подвійний finalize** (cron + manual в одну хвилину) → `unique(student, occurrence)` на visits + skip-перевірка → одне з двох викликів просто нічого не зробить.
- **Список голосів змінився після finalize** (admin перефінілайзив через delete+create) → `applyVisitsAfterFinalize` викликається повторно, нові visits додадуться, старі не дублюються (unique). Видалених учасників ми НЕ rollback-аємо автоматично — це задача адміна вручну.
- **`telegram_user_id` відсутній у votes_snapshot** (стара схема) → запис у `post_finalize_errors`, лог, не зриває finalize.
- **Помилка в applyVisitsAfterFinalize** → логується, finalize вважається успішним. Адмін бачить запис у `post_finalize_errors` (на майбутнє — окрема UI-секція; на MVP — тільки в БД).
- **Видалення учня з активним абонементом** → cascade видаляє sub і visits. UI просить підтвердження «N візитів буде видалено».
- **Конкурентне списання** (двоє адмінів одночасно rollback) → остання операція виграє; transactional update ставить status явно, без increment-race.

---

## Фази реалізації (для writing-plans)

| Фаза | Скоп | Тестування |
|---|---|---|
| 1 | SQL міграції (4 файли). | Ручний `select` після `INSERT`. |
| 2 | `students-api.js`: CRUD students+subscriptions + endpoints. Auth-захист. | curl/Postman, smoke-тест. |
| 3 | `admin/students.html` + `admin-students.js`: список, пошук, картка, форми (без rollback). | Створити учня вручну, додати/редагувати/видалити sub. |
| 4 | `applyVisitsAfterFinalize` + інтеграція у finalize-flow. | Тестове голосування (`is_test=true`), перевірити появу visits. |
| 5 | Rollback UI + endpoint + інтеграція у `lessons.html`. | Toggle через UI. |
| 6 | Daily expiration tick у `lesson-vote-cron.js`. | Виставити sub з `valid_until=вчора`, дочекатись/тригернути tick, перевірити exhausted. |
| 7 | (Опц.) Mini-dashboard на `admin/index.html`. | Smoke. |

---

## Підсумок змін

- **DB**: 3 нові таблиці + 1 нова колонка.
- **Backend**: 1 новий модуль `students-api.js`, 1 новий tick у cron, 9 нових ендпоінтів, 2 точки інтеграції в `server.js`.
- **Frontend**: 1 нова сторінка `students.html`, 1 новий JS-модуль, оновлення навігації в усіх admin-html, 1 точка інтеграції в `lessons.html`.
- **Документація**: цей файл + оновити підказки з `.env` якщо знадобиться нова змінна (на MVP не передбачається).
