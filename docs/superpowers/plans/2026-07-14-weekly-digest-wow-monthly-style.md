# Weekly Digest WoW Monthly-Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the weekly Telegram PNG to match monthly look, with personal + BBM both comparing completed week vs prior week (no MTD month, no deep analytics), then preview PNG for Віка.

**Architecture:** Rewrite `buildWeeklyDigestSvg` in `weekly-digest-png.js` to two monthly-like blocks (5 KPIs + bars; BBM adds «X з Y» progress). Change `runWeeklyTeacherStatsDigests` + preview to fetch BBM for week ranges and pass `overallWeek` + `scheduledLessons`. Reuse existing `%`/bars helpers; copy progress-card SVG pattern from monthly (no shared extract; avoid circular import).

**Tech Stack:** Node.js ESM, Luxon, `@resvg/resvg-js`, Telegraf `sendPhoto`, existing journal/dashboard stats.

**Spec:** `docs/superpowers/specs/2026-07-14-weekly-digest-wow-monthly-style-design.md`  
**Mockup:** `.superpowers/brainstorm/.../content/weekly-mockup-v1.html`

---

## File map

| File | Role |
|------|------|
| `weekly-digest-png.js` | Add `formatWeekCompareSubtitle`; rewrite SVG (personal + BBM WoW); payload `overallWeek`; width 1200 |
| `weekly-digest-png.test.js` | Week subtitle + SVG/PNG smoke for new layout |
| `admin-notifications.js` | Week-only overall fetch; `scheduledLessons` in mapper; caption/fallback use week subtitle |
| `server.js` | Align `previewWeeklyDigestPngAndExit` with same ranges/payload |

Keep `getMonthToDateCompareRangesKyiv` / old subtitle helpers exported (tests may still cover them); weekly **pipeline must not call them**.

Do **not** import from `monthly-digest-png.js` (would cycle: monthly → weekly). Copy the small `conductedShare` + `lessonsProgressCard` logic into weekly.

---

### Task 1: Week compare subtitle helper

**Files:**
- Modify: `weekly-digest-png.js`
- Modify: `weekly-digest-png.test.js`

- [ ] **Step 1: Write failing tests for `formatWeekCompareSubtitle`**

Add to `weekly-digest-png.test.js` (keep existing helper tests; add this describe):

```js
import {
  // ...existing imports...
  formatWeekCompareSubtitle,
} from "./weekly-digest-png.js";

describe("formatWeekCompareSubtitle", () => {
  it("formats same-month weeks", () => {
    const s = formatWeekCompareSubtitle(
      { fromDate: "2026-07-06", toDate: "2026-07-12" },
      { fromDate: "2026-06-29", toDate: "2026-07-05" },
    );
    assert.equal(s, "6–12 лип vs 29 чер – 5 лип");
  });

  it("formats when current week stays in one month", () => {
    const s = formatWeekCompareSubtitle(
      { fromDate: "2026-07-13", toDate: "2026-07-19" },
      { fromDate: "2026-07-06", toDate: "2026-07-12" },
    );
    assert.equal(s, "13–19 лип vs 6–12 лип");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test weekly-digest-png.test.js`

Expected: FAIL (`formatWeekCompareSubtitle` not exported).

- [ ] **Step 3: Implement `formatWeekCompareSubtitle`**

In `weekly-digest-png.js`, next to existing date helpers:

```js
function formatWeekRangeShort(fromDate, toDate) {
  const from = DateTime.fromISO(fromDate, { zone: KYIV_TZ });
  const to = DateTime.fromISO(toDate, { zone: KYIV_TZ });
  if (from.month === to.month) {
    return `${from.day}–${to.day} ${UK_MONTHS_SHORT[to.month]}`;
  }
  return `${from.day} ${UK_MONTHS_SHORT[from.month]} – ${to.day} ${UK_MONTHS_SHORT[to.month]}`;
}

/** @param {{ fromDate: string, toDate: string }} current @param {{ fromDate: string, toDate: string }} previous */
export function formatWeekCompareSubtitle(current, previous) {
  return `${formatWeekRangeShort(current.fromDate, current.toDate)} vs ${formatWeekRangeShort(previous.fromDate, previous.toDate)}`;
}
```

Note: use en-dash `–` (U+2013) between day parts when months differ, matching the approved mockup (`29 чер – 5 лип`).

- [ ] **Step 4: Run tests — expect PASS for new describe**

Run: `node --test weekly-digest-png.test.js`

Expected: `formatWeekCompareSubtitle` tests PASS (other tests may still pass).

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: add week-vs-week digest subtitle helper"
```

---

### Task 2: Rewrite weekly SVG layout (WoW + monthly style)

**Files:**
- Modify: `weekly-digest-png.js` (`buildWeeklyDigestSvg`, helpers)
- Modify: `weekly-digest-png.test.js` (`buildWeeklyDigestSvg` / `renderWeeklyDigestPng` cases)

- [ ] **Step 1: Update failing SVG/PNG tests for new payload + labels**

Replace the `buildWeeklyDigestSvg` / `renderWeeklyDigestPng` describe bodies so they use `overallWeek` (not `overallMonth`), week subtitle, and assert new strings:

```js
const samplePayload = {
  teacherName: "Олена",
  dateSubtitle: "6–12 лип vs 29 чер – 5 лип",
  teacherWeek: {
    current: { lessonsCount: 14, uniquePeopleCount: 41, totalPeopleCount: 55, revenue: 13100, payout: 4000 },
    previous: { lessonsCount: 12, uniquePeopleCount: 48, totalPeopleCount: 52, revenue: 12400, payout: 3800 },
  },
  overallWeek: {
    current: {
      lessonsCount: 11,
      uniquePeopleCount: 30,
      totalPeopleCount: 42,
      revenue: 15200,
      payout: 5000,
      scheduledLessons: 18,
    },
    previous: {
      lessonsCount: 8,
      uniquePeopleCount: 25,
      totalPeopleCount: 29,
      revenue: 10400,
      payout: 4000,
      scheduledLessons: 16,
    },
  },
};

describe("buildWeeklyDigestSvg", () => {
  it("includes monthly-style week blocks and progress", () => {
    const svg = buildWeeklyDigestSvg(samplePayload);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes('width="1200"'));
    assert.ok(svg.includes("BBM · Тижневий дайджест"));
    assert.ok(svg.includes("Особисте · тиждень"));
    assert.ok(svg.includes("BBM загалом"));
    assert.ok(svg.includes("УРОКИ ПРОВЕДЕНО"));
    assert.ok(svg.includes("ПОРІВНЯННЯ З ПОПЕРЕДНІМ ТИЖНЕМ"));
    assert.ok(svg.includes("уроки"));
    assert.ok(svg.includes("виручка"));
    assert.ok(!svg.includes("BBM · місяць"));
    assert.ok(!svg.includes("MTD"));
    assert.ok(!svg.includes("сер. на урок") && !svg.includes("СЕР. НА УРОК"));
  });

  it("escapes teacher name and truncates long names", () => {
    const svg = buildWeeklyDigestSvg({
      ...samplePayload,
      teacherName: 'A&B<script>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    assert.ok(!svg.includes("<script>"));
    assert.ok(svg.includes("&amp;") || svg.includes("A&amp;B"));
    assert.ok(svg.includes("…"));
  });
});

describe("renderWeeklyDigestPng", () => {
  it("returns a PNG buffer", async () => {
    const buf = await renderWeeklyDigestPng(samplePayload);
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 1000);
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test weekly-digest-png.test.js`

Expected: FAIL on missing `BBM загалом` / `УРОКИ ПРОВЕДЕНО` (current SVG still has `BBM · місяць` and/or lacks progress).

- [ ] **Step 3: Implement layout in `buildWeeklyDigestSvg`**

Requirements (match spec + mockup):

1. Read `payload.overallWeek` (fallback: `payload.overallMonth` only if you need one release of compat — prefer **only** `overallWeek`).
2. Split `dateSubtitle` on `" vs "` for legend labels (`prevLabel` / `curLabel`).
3. **Block 1 — Особисте · тиждень:** 5 KPI row + full-width chart titled `ПОРІВНЯННЯ З ПОПЕРЕДНІМ ТИЖНЕМ`, purple `#a78bfa`. Height = `PAD + 28 + GAP + KPI_H + GAP + CHART_H + PAD` (no derived KPI row).
4. **Block 2 — BBM загалом:**
   - Local helpers (copy from monthly patterns):

```js
function conductedShare(conducted, scheduled) {
  const s = Number(scheduled) || 0;
  if (s <= 0) return null;
  return Math.round(((Number(conducted) || 0) / s) * 100);
}

function lessonsProgressCard({ x, y, w, h, conducted, scheduled, pct }) {
  const scheduledLabel = scheduled == null ? "—" : String(scheduled);
  const pctLabel = pct == null ? "—" : `${pct}%`;
  const barPct = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const barW = w - 40;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937" stroke="#38bdf8" stroke-opacity="0.25"/>
    <text x="${x + 20}" y="${y + 28}" fill="#9ca3af" font-size="11" font-weight="700">УРОКИ ПРОВЕДЕНО</text>
    <text x="${x + 20}" y="${y + 62}" fill="#f8fafc" font-size="26" font-weight="900">${escapeXml(String(conducted))}<tspan fill="#94a3b8" font-size="16" font-weight="600"> з ${escapeXml(scheduledLabel)}</tspan><tspan fill="#38bdf8" font-size="18" font-weight="800"> ${escapeXml(pctLabel)}</tspan></text>
    <rect x="${x + 20}" y="${y + h - 28}" width="${barW}" height="8" rx="4" fill="#334155"/>
    <rect x="${x + 20}" y="${y + h - 28}" width="${(barW * barPct) / 100}" height="8" rx="4" fill="#38bdf8"/>`;
}
```

   - Row 1: progress card (~380px) + 3 KPIs (`уроки`, `візити`, `виручка`) with blue accent `#38bdf8`.
   - Row 2: full-width 5-metric bars, `showLabel: false`.
5. Header unchanged style: title `#c4b5fd`, subtitle, teacher name end-anchored at x≈1168.
6. `renderWeeklyDigestPng`: keep `fitTo: { mode: "width", value: 1200 }`.

Reuse existing `kpiBox`, `legendTwoLine`, `categoryBarsChart`, `WEEKLY_METRICS` / `sectionBlock` — either adapt `sectionBlock` for personal-only, or inline block 2 separately (prefer: keep personal via `sectionBlock`, custom BBM block).

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test weekly-digest-png.test.js`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: restyle weekly digest PNG as week-vs-week monthly look"
```

---

### Task 3: Wire weekly digest pipeline (admin-notifications)

**Files:**
- Modify: `admin-notifications.js`

- [ ] **Step 1: Extend `dashboardToWeekSummary` with `scheduledLessons`**

```js
function dashboardToWeekSummary(dashboard) {
  const s = dashboard?.summary || {};
  const teachers = dashboard?.teachers || [];
  return {
    lessonsCount: Number(s.totalLessons) || 0,
    uniquePeopleCount: Number(s.totalPeople) || 0,
    totalPeopleCount:
      Number(s.totalPeopleAll) || teachers.reduce((sum, row) => sum + (Number(row.peopleCount) || 0), 0),
    revenue: teachers.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
    payout: teachers.reduce((sum, row) => sum + (Number(row.payout) || 0), 0),
    scheduledLessons:
      s.totalScheduledLessons == null ? null : Number(s.totalScheduledLessons) || 0,
  };
}
```

- [ ] **Step 2: Change imports + `runWeeklyTeacherStatsDigests` ranges/payload**

- Import `formatWeekCompareSubtitle` instead of (or in addition to) `formatDigestDateSubtitleFromRanges` / `getMonthToDateCompareRangesKyiv` — remove MTD usage from this function.
- Fetch overall with **week** isos/dates:

```js
const currentWeek = getCompletedWeekRangeKyiv(1);
const prevWeek = getCompletedWeekRangeKyiv(2);
const dateSubtitle = formatWeekCompareSubtitle(currentWeek, prevWeek);

const [overallCurrentRaw, overallPrevRaw] = await Promise.all([
  computeOverallStats(supabaseAdmin, {
    fromIso: currentWeek.fromIso,
    toIso: currentWeek.toIso,
    fromDate: currentWeek.fromDate,
    toDate: currentWeek.toDate,
  }),
  computeOverallStats(supabaseAdmin, {
    fromIso: prevWeek.fromIso,
    toIso: prevWeek.toIso,
    fromDate: prevWeek.fromDate,
    toDate: prevWeek.toDate,
  }),
]);
```

- PNG call:

```js
const png = await renderWeeklyDigestPng({
  teacherName,
  dateSubtitle,
  teacherWeek: { current: teacherCurrent, previous: teacherPrev },
  overallWeek: { current: overallCurrent, previous: overallPrev },
});
await bot.telegram.sendPhoto(
  chatId,
  { source: png },
  { caption: `📊 BBM — тижневий дайджест\n${teacherName}\n${dateSubtitle}` },
);
```

- Fallback: pass `dateSubtitle` (not only `currentWeek.label`) into `buildWeeklyStatsDigestText` as the label argument.

- [ ] **Step 3: Smoke-check text fallback still builds**

No separate test file required. Quick node assert optional:

```bash
node -e "import { buildWeeklyStatsDigestText } from './admin-notifications.js'; const t={lessonsCount:1,uniquePeopleCount:1,totalPeopleCount:1,revenue:100,payout:40}; console.log(buildWeeklyStatsDigestText('Віка','6–12 лип vs 29 чер – 5 лип',t,t,t,t).slice(0,80))"
```

Expected: prints caption header + label.

- [ ] **Step 4: Commit**

```bash
git add admin-notifications.js
git commit -m "feat: weekly digest uses week-vs-week BBM stats"
```

---

### Task 4: Align preview in `server.js` + generate Віка report

**Files:**
- Modify: `server.js` (`previewWeeklyDigestPngAndExit`)

- [ ] **Step 1: Update preview to week ranges + `overallWeek` + `scheduledLessons`**

In `previewWeeklyDigestPngAndExit`:

- Import/use `formatWeekCompareSubtitle` (drop MTD ranges from this preview).
- `toOverallSummary` must include:

```js
scheduledLessons:
  s.totalScheduledLessons == null ? null : Number(s.totalScheduledLessons) || 0,
```

- Fetch overall with `currentWeek` / `prevWeek` (same as Task 3), not `monthRanges`.
- Call:

```js
const dateSubtitle = formatWeekCompareSubtitle(currentWeek, prevWeek);
const png = await renderWeeklyDigestPng({
  teacherName,
  dateSubtitle,
  teacherWeek: { current: toTeacherSummary(current.summary), previous: toTeacherSummary(previous.summary) },
  overallWeek: { current: toOverallSummary(overallCurrentRaw), previous: toOverallSummary(overallPrevRaw) },
});
```

- [ ] **Step 2: Run unit tests**

Run: `node --test weekly-digest-png.test.js`

Expected: PASS.

- [ ] **Step 3: Generate TG-style report for Віка**

Run (needs `.env` / supabase like existing monthly preview):

```bash
$env:PREVIEW_WEEKLY_DIGEST_TEACHER="Віка"; node server.js
```

(or `PREVIEW_WEEKLY_DIGEST_TEACHER=Віка node server.js` in bash)

Expected: writes `weekly-digest-Віка.png` (or path from `PREVIEW_WEEKLY_DIGEST_OUT`), logs bytes + label; process exits via preview hook.

Also write Latin alias if useful for Windows: optional second run with `PREVIEW_WEEKLY_DIGEST_OUT=weekly-digest-Vika.png` — only if teacher lookup still matches Віка.

- [ ] **Step 4: Open PNG and sanity-check**

Confirm visually: header week-vs-week, personal 5 KPIs + bars, BBM progress + 3 KPIs + bars, no directions/banks/абони, no «BBM · місяць».

- [ ] **Step 5: Commit code (PNG optional)**

```bash
git add server.js
git commit -m "feat: align weekly digest preview to week-vs-week payload"
```

Do **not** commit PNG binaries unless the user asks.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Personal + BBM both WoW | 2, 3, 4 |
| Monthly-style KPI + bars; BBM X з Y | 2 |
| No derived KPI / directions / banks / single-abon | 2 (assertions) |
| Drop MTD from weekly pipeline | 3, 4 |
| `scheduledLessons` for progress | 3, 4 |
| Caption + text fallback week label | 3 |
| Preview PNG for Віка | 4 |
| Width 1200 / resvg | 2 |
| Cron unchanged | (no task — intentional) |

No TBD placeholders. Payload name consistently `overallWeek`. No import from `monthly-digest-png.js`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-weekly-digest-wow-monthly-style.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
