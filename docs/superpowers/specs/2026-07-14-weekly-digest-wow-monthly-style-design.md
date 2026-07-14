# Weekly digest PNG restyle (WoW, monthly look) — Design Spec

Дата: 2026-07-14  
Статус: approved for writing-plans

## Контекст

Тижневий PNG (`weekly-digest-png.js` + `runWeeklyTeacherStatsDigests`) зараз: **особисте·тиждень** (KPI + bars) + **BBM·місяць MTD** (горизонтальні рядки). Місячний дайджест уже має узгоджений dark layout (KPI-картки `%` / значення / `було N`, grouped bars, progress «X з Y»).

Потрібно переробити weekly під той самий візуальний стиль, але з порівнянням **завершений тиждень vs тиждень до нього** для обох блоків, без глибокої аналітики місячного (напрями / береги / разові·абони / похідні KPI).

## Цілі

1. Обидва блоки на картці: **тиждень vs попередній тиждень** (Kyiv, `getCompletedWeekRangeKyiv(1)` / `(2)`).
2. Візуал як monthly (кольори, KPI-картки, bars, progress), без блоків глибокої розбивки.
3. Переписати `weekly-digest-png.js` на місці; оновити wiring у `admin-notifications.js` і preview у `server.js`.
4. `sendPhoto` + text fallback; cron понеділок 09:00 — без змін розкладу.
5. Після імплементації згенерувати `weekly-digest-Віка.png` через preview (як звіт у TG).

## Нецілі

- Не змінювати monthly / daily дайджести (окрім спільного reuse хелперів, які weekly уже експортує).
- Не витягати `digest-png-shared.js` / не робити «slim mode» monthly-рендера.
- Не додавати напрями, береги, разові vs абонемент, `сер. на урок`, `₴/урок`.
- Не залишати BBM·місяць MTD на тижневій картці.
- Не будувати адмін-UI; не зберігати PNG у Storage / БД.

## Підхід

**Перепис `weekly-digest-png.js` на місці** (затверджено). Скопіювати/адаптувати SVG-віджети з monthly (`kpiBox`, `legendTwoLine`, `categoryBarsChart`, `lessonsProgressCard`) у weekly-модуль; не рефакторити monthly в цій ітерації.

## Візуальний шаблон (затверджено)

Референс-макет: `.superpowers/brainstorm/.../content/weekly-mockup-v1.html`  
Розмір: **1200px** ширини (`Resvg` `fitTo.width = 1200`), висота за контентом (~2 блоки).

Темний фон `#111827`, блоки `#172033` / KPI `#1f2937`, шрифт як monthly (`Inter, Arial, sans-serif`).

**Шапка**

- Заголовок: `BBM · Тижневий дайджест` (колір `#c4b5fd`, як monthly title accent)
- Підзаголовок: week-compare label, напр. `6–12 лип vs 29 чер – 5 лип`
- Ім’я викладача справа (truncate/ellipsis)

**Блок 1 — Особисте · тиждень** (accent `#a78bfa`)

- Легенда дворядкова: сірий = попередній тиждень, фіолетовий = цей (підписи з date subtitle split по ` vs `)
- Ряд **5 KPI**: уроки, учні, візити, виручка, виплата — формат `%` / значення / `було N`
- Нижче full-width grouped bar chart у KPI-рамці; підпис `ПОРІВНЯННЯ З ПОПЕРЕДНІМ ТИЖНЕМ`
- Без другого ряду похідних KPI

**Блок 2 — BBM загалом** (accent `#38bdf8`)

- Легенда як у блоці 1, колір current = блакитний
- Ряд: `УРОКИ ПРОВЕДЕНО: X з Y` + progress bar + `%` (картка як monthly) | 3 KPI: **уроки / візити / виручка**
- Нижче full-width bars усіх 5 метрик (без підпису «порівняння…» або з коротким — як monthly BBM `showLabel: false`)

Нюанси PNG (як monthly): `escapeXml`, truncate імені, `percentChange` / `formatPercentLabel` / `formatCompactNumber` / `barHeights`, min bar height, `rx` без clipPath (resvg-friendly), `prev===0 && cur>0` → `+100%`, обидва 0 → `0%`.

## Періоди (Kyiv)

| Блок | Поточний | Порівняння |
|------|----------|------------|
| Особисте · тиждень | `getCompletedWeekRangeKyiv(1)` | `getCompletedWeekRangeKyiv(2)` |
| BBM · тиждень | ті самі ranges | ті самі ranges |

MTD (`getMonthToDateCompareRangesKyiv`) **не** використовується в weekly pipeline (функцію можна залишити експортом для зворотної сумісності тестів або прибрати, якщо ніде більше не імпортується).

Формат підпису: `formatWeekCompareSubtitle(currentWeek, prevWeek)` — скорочені uk-місяці, явні місяці якщо тиждень перетинає межу місяця.

Caption / fallback також використовують цей week-compare label (не лише `currentWeek.label`).

## Дані

Reuse:

- Особисте: `computeTeacherLessonsJournal` ×2 за week ranges → `teacherSummaryToWeekSummary`
- BBM: `computeAdminStatsDashboard` ×2 за **week** ranges → mapper summary

Метрики summary (без змін семантики):

- `lessonsCount`, `uniquePeopleCount`, `totalPeopleCount`, `revenue`, `payout`
- **Додати** `scheduledLessons` з `dashboard.summary.totalScheduledLessons` (null якщо немає) — для progress «X з Y» / `conductedShare`

Payload PNG:

```
{
  teacherName,
  dateSubtitle,
  teacherWeek: { current, previous },
  overallWeek: { current, previous }   // замість overallMonth
}
```

`%` зміни — існуючий `percentChange` / `formatPercentLabel`.

## Архітектура

```
runWeeklyTeacherStatsDigests
  → currentWeek / prevWeek (Kyiv)
  → dateSubtitle = formatWeekCompareSubtitle(...)
  → overall BBM stats ×2 за week ranges (+ scheduledLessons у summary)
  → per recipient: teacher week stats ×2
  → renderWeeklyDigestPng({ teacherWeek, overallWeek, ... })
  → sendPhoto; on fail → sendMessage(buildWeeklyStatsDigestText(...))
```

**Файли**

| Файл | Зміни |
|------|--------|
| `weekly-digest-png.js` | Новий SVG layout (monthly-like 2 blocks); week subtitle helper; `renderWeeklyDigestPng` width 1200 |
| `weekly-digest-png.test.js` | Subtitle, SVG smoke, % edge cases; прибрати/замінити MTD-only expectations |
| `admin-notifications.js` | Прибрати month MTD з weekly run; overall за weeks; payload `overallWeek`; scheduledLessons у mapper; оновити fallback text labels |
| `server.js` | `previewWeeklyDigestPngAndExit` — ті самі week ranges / payload |

Cron / `lesson-vote-cron.js` — без змін логіки часу.

## Telegram

- `sendPhoto` + caption: `📊 BBM — тижневий дайджест\n{ім’я}\n{dateSubtitle}`
- Fallback text: особисте + BBM, обидва WoW (без month MTD рядків)
- Отримувачі: `loadDigestRecipients` (як зараз)

## Помилки / стійкість

- Немає bot / supabase / recipients / compute fns → skip (як зараз)
- Помилка stats одного recipient → лог, continue
- Помилка PNG / sendPhoto → text fallback цьому chat_id
- Довге ім’я — truncate в SVG

## Тест-план

1. Unit: `formatWeekCompareSubtitle`, SVG містить `Особисте · тиждень`, `BBM загалом`, `УРОКИ ПРОВЕДЕНО`; немає MTD-місячного блоку старого layout.
2. `prev=0` / обидва 0 — без `NaN` на картинці.
3. Ручний preview: `PREVIEW_WEEKLY_DIGEST_TEACHER=Віка node server.js` → `weekly-digest-Віка.png` (звіт як у TG).
4. Симуляція збою render → текстовий fallback.
5. Особисті цифри = teacher journal за week(1)/week(2); BBM = dashboard за ті самі ranges; `X з Y` = lessons vs scheduled за поточний тиждень.

## Ризики

- `dashboardToWeekSummary` зараз відкидає `scheduledLessons` — треба розширити mapper (і preview mapper у `server.js`).
- Ширший PNG (1200 vs ~840): Telegram стискає; тримати паритет з monthly.
- Дублювання SVG-віджетів з monthly — прийнятний борг до окремого extract (поза scope).
