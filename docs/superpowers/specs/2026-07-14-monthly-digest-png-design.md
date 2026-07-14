# Monthly digest PNG — Design Spec

Дата: 2026-07-14  
Статус: approved for writing-plans

## Контекст

Уже є **тижневий** PNG-дайджест (`runWeeklyTeacherStatsDigests` + `weekly-digest-png.js`): особисте·тиждень + BBM·місяць MTD, `sendPhoto`, fallback на текст, cron у понеділок 09:00 Kyiv.

Потрібен окремий **місячний** дайджест 1-го числа місяця: PNG-картка за повний попередній календарний місяць vs місяць до нього.

## Цілі

1. 1-го числа о **09:00 Europe/Kyiv** надсилати PNG місячного дайджесту отримувачам з `digest_enabled` + `chat_id`.
2. Період: **повний попередній місяць** vs **повний місяць перед ним** (1 липня → червень vs травень).
3. Окремий пайплайн (не рефакторити weekly у «period digest»).
4. Візуал за затвердженим макетом (див. нижче): особисте — найбільший блок зверху; далі BBM, напрями, береги, разові/абон.
5. Рендер SVG → PNG через існуючий `@resvg/resvg-js`; при збої — текстовий fallback.

## Нецілі

- Не змінювати тижневий і щоденний дайджести (крім спільного wiring cron/server, якщо треба лише додати monthly hook).
- Не будувати адмін-UI прев’ю.
- Не зберігати PNG у Storage / БД.
- Не фільтрувати отримувачів за `river_bank_scope` (як weekly: усі з `digest_enabled` бачать особисте + загальне BBM).
- Не узагальнювати weekly+monthly в один абстрактний рендерер у цій ітерації.

## Архітектура

```
cron: day === 1 && 09:00 Kyiv
  → runMonthlyTeacherStatsDigests
      → getCompletedMonthCompareRangesKyiv()  // prev month, month before
      → overall BBM stats ×2 (+ scheduled для «X з Y»)
      → breakdown: by lesson_type, by river_bank, single vs abon ×2
      → per recipient: teacher month stats ×2
      → renderMonthlyDigestPng(payload)
      → bot.telegram.sendPhoto(...); on fail → sendMessage(text fallback)
```

**Файли**

| Файл | Роль |
|------|------|
| `monthly-digest-png.js` | SVG layout + `renderMonthlyDigestPng` + хелпери `%`, bars, compact numbers (можна імпортувати спільні з `weekly-digest-png.js` якщо вже експортовані) |
| `monthly-digest-png.test.js` | чисті хелпери / smoke SVG |
| `admin-notifications.js` | `runMonthlyTeacherStatsDigests`, text fallback, ranges |
| `lesson-vote-cron.js` | тригер: `nowKyiv.day === 1` + час (reuse `weeklyDigestTime` або окремий env з тим самим дефолтом `09:00`) |
| `server.js` | wiring `runMonthlyTeacherStatsDigests` у cron deps |

Підхід: **окремий місячний пайплайн** (затверджено), не рефактор weekly.

## Періоди (Kyiv)

| | Поточний (на картці) | Порівняння |
|--|----------------------|------------|
| Особисте / BBM / розбивки | повний попередній календарний місяць | повний місяць до нього |

Хелпер орієнтир: `getCompletedMonthCompareRangesKyiv(now)` → `{ current, previous }` з `fromDate/toDate/fromIso/toIso` + label на кшталт `червень vs травень`.

Якщо 1-ше число випадає на понеділок 09:00 — і weekly, і monthly можуть піти в ту саму хвилину: допустимо (два окремі повідомлення).

## Дані

Reuse:

- Особисте: `computeTeacherLessonsJournal` (current/prev month ranges).
- BBM summary: `computeAdminStatsDashboard` → існуючі mapper’и summary (`lessonsCount`, `uniquePeopleCount`, `totalPeopleCount`, `revenue`, `payout`) + `summary.totalScheduledLessons` для «проведено X з Y».

**Похідні (з summary, без нових важких запитів):**

- `сер. на урок` = `totalPeopleCount / lessonsCount` (1 знак; 0 уроків → `—`)
- `₴ / урок` = `revenue / lessonsCount` (compact money; 0 уроків → `—`)
- `%` зміни: як weekly (`percentChange`); підпис KPI як у макеті: великий `%`, значення, рядок `було N`.

**BBM «уроки проведено»:** `проведено {totalLessons} з {totalScheduledLessons}` + `%` = conducted/scheduled×100 (scheduled 0 → `—` / не показувати bar).

**За напрямами (BBM, поточний місяць; % vs prev):** агрегати по `lesson_types` (назви з БД; типово Сучасний / Тренаж): уроки, візити, виручка, сер. на урок; share bar за уроками або візитами (зафіксувати: **за кількістю уроків**).

**За берегами (BBM):** агрегати по `places.river_bank` → Лівий / Правий (через існуючий `parsePlaceRiverBank`); ті самі метрики + share bar за уроками.

**Разові vs абонемент (BBM, візити):** підрахунок відвідувань з `vote_choice` / visit kind `single` vs `abon` за місяць (не унікальні учні). Показати counts, %, дельту abs vs prev, stacked bar.

Агрегації напрямів/берегів/single-abon: один прохід по lesson context за діапазон (розширити dashboard/journal context або окремий lightweight aggregator у `admin-notifications.js` / поруч із stats у `server.js` — мінімально; без зайвого API).

## Візуальний шаблон (затверджено)

Референс: `.superpowers/brainstorm/.../content/monthly-final.html`  
Розмір орієнтир: **~1200×1280** (ширше за weekly 840).

Темний фон `#111827`, блоки `#172033` / KPI `#1f2937`.

Порядок блоків:

1. **Шапка** — `BBM · Місячний дайджест`, підпис `червень vs травень`, ім’я викладача справа.
2. **Особисте · місяць** (найбільший, full width) — 5 KPI (уроки, учні, візити, виручка, виплата) у форматі `%` / значення / `було N`; нижче 2 KPI тих самих форматів (сер. на урок, ₴/урок) + grouped bar chart (сірий=prev, фіолетовий=current).
3. **BBM загалом** — «Уроки проведено: X з Y» + progress bar + %; KPI виручка / сер. / ₴; bar chart (блакитний=current).
4. **За напрямами | За берегами** — два колонки: share bar + картки сегментів.
5. **Разові vs абонемент** — два великих числа візитів + stacked bar.

Без лейбла «план→факт» — лише **X з Y**.

## Telegram

- `sendPhoto` + короткий caption: `📊 BBM — місячний дайджест` + ім’я + label місяця.
- Fallback text: стислий текст з ключовими числами особисте + BBM (без обов’язкового дублювання всіх інфографік).
- Отримувачі: `loadDigestRecipients` (як weekly).

## Помилки / стійкість

- Немає bot / supabase / recipients → skip (як weekly).
- Помилка stats одного recipient → лог, continue.
- Помилка PNG → text fallback цьому chat_id.
- 1 січня / різна довжина місяців: повні календарні місяці Luxon `startOf/endOf('month')` — без MTD-кліпу.

## Тест-план

1. Ручний виклик `runMonthlyTeacherStatsDigests` → фото з 5 блоками.
2. Підпис дат = prev vs prev-1 місяць; особисті цифри = teacher journal за ці ranges.
3. «X з Y» = dashboard lessons vs `totalScheduledLessons`.
4. Напрями / береги / single-abon суми узгоджуються з загальними візитами/уроками в межах округлення.
5. Симуляція збою render → текстовий fallback.
6. Cron: при `day===1` і потрібній хвилині викликається monthly (окремий `lastMonthlyDigestRunDateKyiv`).
7. KPI похідних: формат як у основних (`%`, значення, `було N`).

## Ризики

- Додаткові агрегації (тип / берег / single-abon) можуть вимагати легкого розширення stats context — тримати в одному місці, без N+1 по викладачах для BBM-блоків (BBM рахується раз на розсилку).
- Широкий PNG: Telegram стискає; тримати ~1200px ширини.
- Нативні бінарники `@resvg/resvg-js` уже в проєкті — нових залежностей не додавати.
