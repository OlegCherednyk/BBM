# Weekly Digest PNG Analytics Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weekly teacher Telegram digest text with a PNG KPI card (personal week + BBM month), with text fallback on render failure.

**Architecture:** Add pure helpers + SVG template in `weekly-digest-png.js`, rasterize with `@resvg/resvg-js`, and extend `runWeeklyTeacherStatsDigests` to fetch month ranges, send `sendPhoto`, and fall back to `buildWeeklyStatsDigestText`.

**Tech Stack:** Node.js (ESM), Luxon (Kyiv ranges), `@resvg/resvg-js`, Telegraf `sendPhoto`, existing `computeTeacherLessonsJournal` / `computeAdminStatsDashboard`.

**Spec:** `docs/superpowers/specs/2026-07-12-weekly-digest-png-design.md`

---

## File map

| File | Role |
|------|------|
| `weekly-digest-png.js` | Date/month ranges labels helpers, `%` / bars / money format, SVG build, PNG render |
| `weekly-digest-png.test.js` | Node built-in test runner for pure helpers |
| `admin-notifications.js` | Month range helper (or import from png module), wire PNG + fallback into `runWeeklyTeacherStatsDigests` |
| `package.json` | Add `@resvg/resvg-js` dependency |

---

### Task 1: Install `@resvg/resvg-js`

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install @resvg/resvg-js
```

Expected: package appears in `dependencies`; install succeeds on current OS (Windows locally; Linux on deploy).

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @resvg/resvg-js for weekly digest PNG"
```

---

### Task 2: Pure helpers — % change, bar heights, money format

**Files:**
- Create: `weekly-digest-png.js`
- Create: `weekly-digest-png.test.js`

- [ ] **Step 1: Write failing tests**

Create `weekly-digest-png.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  percentChange,
  formatPercentLabel,
  formatCompactNumber,
  barHeights,
} from "./weekly-digest-png.js";

describe("percentChange", () => {
  it("computes rounded percent", () => {
    assert.equal(percentChange(14, 12), 17);
  });
  it("returns 100 when prev is 0 and cur > 0", () => {
    assert.equal(percentChange(5, 0), 100);
  });
  it("returns 0 when both are 0", () => {
    assert.equal(percentChange(0, 0), 0);
  });
  it("handles negative deltas", () => {
    assert.equal(percentChange(41, 48), -15);
  });
});

describe("formatPercentLabel", () => {
  it("uses + and typographic minus", () => {
    assert.equal(formatPercentLabel(17), "+17%");
    assert.equal(formatPercentLabel(-15), "−15%");
    assert.equal(formatPercentLabel(0), "0%");
  });
});

describe("formatCompactNumber", () => {
  it("formats money thousands with к", () => {
    assert.equal(formatCompactNumber(12400, { money: true }), "12.4к");
  });
  it("formats small integers as-is", () => {
    assert.equal(formatCompactNumber(14), "14");
  });
});

describe("barHeights", () => {
  it("normalizes pair heights to maxBar", () => {
    const h = barHeights(10, 20, 50);
    assert.equal(h.prev, 25);
    assert.equal(h.cur, 50);
  });
  it("returns min height when both zero", () => {
    const h = barHeights(0, 0, 50);
    assert.equal(h.prev, 2);
    assert.equal(h.cur, 2);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test weekly-digest-png.test.js`

Expected: FAIL (module / exports missing).

- [ ] **Step 3: Implement helpers in `weekly-digest-png.js`**

```js
/** @param {number} cur @param {number} prev */
export function percentChange(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p === 0 && c === 0) return 0;
  if (p === 0) return 100;
  return Math.round(((c - p) / p) * 100);
}

/** @param {number} pct */
export function formatPercentLabel(pct) {
  const n = Math.round(Number(pct) || 0);
  if (n === 0) return "0%";
  if (n > 0) return `+${n}%`;
  return `−${Math.abs(n)}%`;
}

/**
 * @param {number} value
 * @param {{ money?: boolean }} [opts]
 */
export function formatCompactNumber(value, { money = false } = {}) {
  const n = Number(value) || 0;
  if (money) {
    if (Math.abs(n) >= 1000) {
      const k = n / 1000;
      const s = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, "");
      return `${s}к`;
    }
    return String(Math.round(n));
  }
  return String(Math.round(n));
}

/**
 * @param {number} prev
 * @param {number} cur
 * @param {number} maxBar
 * @returns {{ prev: number, cur: number }}
 */
export function barHeights(prev, cur, maxBar) {
  const p = Math.max(0, Number(prev) || 0);
  const c = Math.max(0, Number(cur) || 0);
  const max = Math.max(p, c);
  const minH = 2;
  if (max === 0) return { prev: minH, cur: minH };
  return {
    prev: Math.max(minH, Math.round((p / max) * maxBar)),
    cur: Math.max(minH, Math.round((c / max) * maxBar)),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test weekly-digest-png.test.js`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: add weekly digest PNG number helpers"
```

---

### Task 3: Month range (Kyiv) + date subtitle label

**Files:**
- Modify: `weekly-digest-png.js`
- Modify: `weekly-digest-png.test.js`
- (Optional export used by `admin-notifications.js`)

- [ ] **Step 1: Add failing tests for month range + labels**

Append to `weekly-digest-png.test.js`:

```js
import { DateTime } from "luxon";
import {
  getMonthToDateCompareRangesKyiv,
  formatDigestDateSubtitle,
} from "./weekly-digest-png.js";

describe("getMonthToDateCompareRangesKyiv", () => {
  it("clips prev month day when current day exceeds prev month length", () => {
    // Fixed "now" = 2026-03-31 Kyiv → yesterday = Mar 30 → prev Feb 1–28 (2026 not leap for Mar 30? 2026 Feb has 28)
    const ranges = getMonthToDateCompareRangesKyiv(
      DateTime.fromISO("2026-03-31T12:00:00", { zone: "Europe/Kyiv" }),
    );
    assert.equal(ranges.current.fromDate, "2026-03-01");
    assert.equal(ranges.current.toDate, "2026-03-30");
    assert.equal(ranges.previous.fromDate, "2026-02-01");
    assert.equal(ranges.previous.toDate, "2026-02-28");
  });

  it("uses same day-of-month when both months have that day", () => {
    const ranges = getMonthToDateCompareRangesKyiv(
      DateTime.fromISO("2026-07-12T09:00:00", { zone: "Europe/Kyiv" }),
    );
    assert.equal(ranges.current.fromDate, "2026-07-01");
    assert.equal(ranges.current.toDate, "2026-07-11");
    assert.equal(ranges.previous.fromDate, "2026-06-01");
    assert.equal(ranges.previous.toDate, "2026-06-11");
  });
});

describe("formatDigestDateSubtitle", () => {
  it("formats week and month compare without MTD or міс", () => {
    const s = formatDigestDateSubtitle({
      weekFrom: DateTime.fromISO("2026-07-06", { zone: "Europe/Kyiv" }),
      weekTo: DateTime.fromISO("2026-07-12", { zone: "Europe/Kyiv" }),
      monthFrom: DateTime.fromISO("2026-07-01", { zone: "Europe/Kyiv" }),
      monthTo: DateTime.fromISO("2026-07-11", { zone: "Europe/Kyiv" }),
      prevMonthFrom: DateTime.fromISO("2026-06-01", { zone: "Europe/Kyiv" }),
      prevMonthTo: DateTime.fromISO("2026-06-11", { zone: "Europe/Kyiv" }),
    });
    assert.equal(s, "6–12 лип · 1–11 лип vs 1–11 чер");
    assert.ok(!s.includes("MTD"));
    assert.ok(!s.toLowerCase().includes("міс"));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test weekly-digest-png.test.js`

Expected: FAIL on missing exports.

- [ ] **Step 3: Implement range + subtitle helpers**

Add to `weekly-digest-png.js` (import Luxon at top):

```js
import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";
const UK_MONTHS_SHORT = [
  "", "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

/**
 * @param {import("luxon").DateTime} [now]
 * @returns {{
 *   current: { fromDate: string, toDate: string, fromIso: string, toIso: string },
 *   previous: { fromDate: string, toDate: string, fromIso: string, toIso: string },
 * }}
 */
export function getMonthToDateCompareRangesKyiv(now = DateTime.now().setZone(KYIV_TZ)) {
  const kyiv = now.setZone(KYIV_TZ);
  const yesterday = kyiv.startOf("day").minus({ days: 1 });
  const curStart = yesterday.startOf("month");
  const curEnd = yesterday;
  const dayN = yesterday.day;
  const prevMonthRef = curStart.minus({ months: 1 });
  const prevLastDay = prevMonthRef.endOf("month").day;
  const prevEndDay = Math.min(dayN, prevLastDay);
  const prevStart = prevMonthRef.startOf("month");
  const prevEnd = prevStart.set({ day: prevEndDay });

  const pack = (from, to) => ({
    fromDate: from.toISODate(),
    toDate: to.toISODate(),
    fromIso: from.startOf("day").toUTC().toISO(),
    toIso: to.endOf("day").toUTC().toISO(),
  });

  return { current: pack(curStart, curEnd), previous: pack(prevStart, prevEnd) };
}

/** @param {import("luxon").DateTime} dt */
function dayMonth(dt) {
  return `${dt.day} ${UK_MONTHS_SHORT[dt.month]}`;
}

/**
 * @param {{
 *   weekFrom: import("luxon").DateTime,
 *   weekTo: import("luxon").DateTime,
 *   monthFrom: import("luxon").DateTime,
 *   monthTo: import("luxon").DateTime,
 *   prevMonthFrom: import("luxon").DateTime,
 *   prevMonthTo: import("luxon").DateTime,
 * }} parts
 */
export function formatDigestDateSubtitle(parts) {
  const weekSameMonth = parts.weekFrom.month === parts.weekTo.month;
  const weekPart = weekSameMonth
    ? `${parts.weekFrom.day}–${parts.weekTo.day} ${UK_MONTHS_SHORT[parts.weekTo.month]}`
    : `${dayMonth(parts.weekFrom)}–${dayMonth(parts.weekTo)}`;

  const monthPart = `${parts.monthFrom.day}–${parts.monthTo.day} ${UK_MONTHS_SHORT[parts.monthTo.month]}`;
  const prevPart = `${parts.prevMonthFrom.day}–${parts.prevMonthTo.day} ${UK_MONTHS_SHORT[parts.prevMonthTo.month]}`;
  return `${weekPart} · ${monthPart} vs ${prevPart}`;
}
```

Also export a thin wrapper that turns week range objects (`fromDate`/`toDate` strings) into subtitle:

```js
/**
 * @param {{ fromDate: string, toDate: string }} week
 * @param {{ fromDate: string, toDate: string }} monthCurrent
 * @param {{ fromDate: string, toDate: string }} monthPrev
 */
export function formatDigestDateSubtitleFromRanges(week, monthCurrent, monthPrev) {
  const z = (isoDate) => DateTime.fromISO(isoDate, { zone: KYIV_TZ });
  return formatDigestDateSubtitle({
    weekFrom: z(week.fromDate),
    weekTo: z(week.toDate),
    monthFrom: z(monthCurrent.fromDate),
    monthTo: z(monthCurrent.toDate),
    prevMonthFrom: z(monthPrev.fromDate),
    prevMonthTo: z(monthPrev.toDate),
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test weekly-digest-png.test.js`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: add Kyiv month-to-date ranges for weekly digest PNG"
```

---

### Task 4: SVG template builder

**Files:**
- Modify: `weekly-digest-png.js`
- Modify: `weekly-digest-png.test.js`

- [ ] **Step 1: Write failing smoke test for SVG**

```js
import { buildWeeklyDigestSvg } from "./weekly-digest-png.js";

describe("buildWeeklyDigestSvg", () => {
  it("includes title, labels, and no forbidden words", () => {
    const svg = buildWeeklyDigestSvg({
      teacherName: "Олена",
      dateSubtitle: "6–12 лип · 1–11 лип vs 1–11 чер",
      teacherWeek: {
        current: { lessonsCount: 14, uniquePeopleCount: 41, totalPeopleCount: 55, revenue: 13100, payout: 4000 },
        previous: { lessonsCount: 12, uniquePeopleCount: 48, totalPeopleCount: 52, revenue: 12400, payout: 3800 },
      },
      overallMonth: {
        current: { lessonsCount: 80, uniquePeopleCount: 200, totalPeopleCount: 260, revenue: 90000, payout: 30000 },
        previous: { lessonsCount: 70, uniquePeopleCount: 210, totalPeopleCount: 250, revenue: 83000, payout: 28000 },
      },
    });
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("BBM · Тижневий дайджест"));
    assert.ok(svg.includes("уроки"));
    assert.ok(svg.includes("учні"));
    assert.ok(svg.includes("візити"));
    assert.ok(svg.includes("виручка"));
    assert.ok(svg.includes("виплата"));
    assert.ok(svg.includes("Особисте · тиждень"));
    assert.ok(svg.includes("BBM · місяць"));
    assert.ok(!svg.includes("MTD"));
    assert.ok(!/міс\./i.test(svg));
  });

  it("escapes teacher name and truncates long names", () => {
    const svg = buildWeeklyDigestSvg({
      teacherName: 'A&B<script>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      dateSubtitle: "x",
      teacherWeek: {
        current: { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 },
        previous: { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 },
      },
      overallMonth: {
        current: { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 },
        previous: { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 },
      },
    });
    assert.ok(!svg.includes("<script>"));
    assert.ok(svg.includes("&amp;") || svg.includes("A&amp;B"));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test weekly-digest-png.test.js`

- [ ] **Step 3: Implement `buildWeeklyDigestSvg`**

Layout constants (match approved mockup):

- Canvas: width `840`, height `920`, background `#111827`
- Colors: prev bar `#64748b`, personal cur `#a78bfa`, BBM cur `#38bdf8`, up `#34d399`, down `#f87171`, title `#c4b5fd`
- Header title + `dateSubtitle` + truncated `teacherName` (max ~18 chars + `…`)
- Section «Особисте · тиждень»: 3 KPI rects (уроки, учні, виручка) with `formatPercentLabel(percentChange(...))` and `prev → cur` using `formatCompactNumber`
- 5 paired bars via `barHeights` for all metrics; labels single-line
- Section «BBM · місяць»: large revenue % + 5 paired bars
- Escape XML: `&`, `<`, `>`, `"` in all text nodes

Keep implementation in one function + small local helpers (`escapeXml`, `kpiCard`, `pairBarsRow`) inside the same file. Do not pull Chart.js.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test weekly-digest-png.test.js`

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: build weekly digest SVG template"
```

---

### Task 5: Rasterize SVG → PNG

**Files:**
- Modify: `weekly-digest-png.js`
- Modify: `weekly-digest-png.test.js`

- [ ] **Step 1: Add PNG render test**

```js
import { renderWeeklyDigestPng } from "./weekly-digest-png.js";

describe("renderWeeklyDigestPng", () => {
  it("returns a PNG buffer", async () => {
    const buf = await renderWeeklyDigestPng({
      teacherName: "Олена",
      dateSubtitle: "6–12 лип · 1–11 лип vs 1–11 чер",
      teacherWeek: {
        current: { lessonsCount: 14, uniquePeopleCount: 41, totalPeopleCount: 55, revenue: 13100, payout: 4000 },
        previous: { lessonsCount: 12, uniquePeopleCount: 48, totalPeopleCount: 52, revenue: 12400, payout: 3800 },
      },
      overallMonth: {
        current: { lessonsCount: 80, uniquePeopleCount: 200, totalPeopleCount: 260, revenue: 90000, payout: 30000 },
        previous: { lessonsCount: 70, uniquePeopleCount: 210, totalPeopleCount: 250, revenue: 83000, payout: 28000 },
      },
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 1000);
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50); // P
    assert.equal(buf[2], 0x4e); // N
    assert.equal(buf[3], 0x47); // G
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `renderWeeklyDigestPng`**

```js
import { Resvg } from "@resvg/resvg-js";

/**
 * @param {Parameters<typeof buildWeeklyDigestSvg>[0]} payload
 * @returns {Promise<Buffer>}
 */
export async function renderWeeklyDigestPng(payload) {
  const svg = buildWeeklyDigestSvg(payload);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 840 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}
```

If Ukrainian glyphs missing on CI/server, embed a note in code comment: prefer system fonts; if boxes appear, later add a bundled font path — out of scope unless broken in manual check.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test weekly-digest-png.test.js`

Optional visual check:

```bash
node -e "import { renderWeeklyDigestPng } from './weekly-digest-png.js'; import fs from 'fs'; const b=await renderWeeklyDigestPng({ teacherName:'Олена', dateSubtitle:'6–12 лип · 1–11 лип vs 1–11 чер', teacherWeek:{ current:{ lessonsCount:14, uniquePeopleCount:41, totalPeopleCount:55, revenue:13100, payout:4000 }, previous:{ lessonsCount:12, uniquePeopleCount:48, totalPeopleCount:52, revenue:12400, payout:3800 } }, overallMonth:{ current:{ lessonsCount:80, uniquePeopleCount:200, totalPeopleCount:260, revenue:90000, payout:30000 }, previous:{ lessonsCount:70, uniquePeopleCount:210, totalPeopleCount:250, revenue:83000, payout:28000 } } }); fs.writeFileSync('tmp-weekly-digest.png', b); console.log('wrote', b.length);"
```

Open `tmp-weekly-digest.png`, then delete it (do not commit).

- [ ] **Step 5: Commit**

```bash
git add weekly-digest-png.js weekly-digest-png.test.js
git commit -m "feat: rasterize weekly digest SVG to PNG"
```

---

### Task 6: Wire into `runWeeklyTeacherStatsDigests`

**Files:**
- Modify: `admin-notifications.js` (imports + `runWeeklyTeacherStatsDigests` ~347–424)

- [ ] **Step 1: Import PNG helpers**

At top of `admin-notifications.js`:

```js
import {
  formatDigestDateSubtitleFromRanges,
  getMonthToDateCompareRangesKyiv,
  renderWeeklyDigestPng,
} from "./weekly-digest-png.js";
```

- [ ] **Step 2: Replace weekly run body to fetch month overall + send photo**

Keep existing week ranges and teacher week fetches. Change overall stats to **month** ranges (not week). Pseudocode to implement:

```js
export async function runWeeklyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherStats, computeOverallStats) {
  // … existing early returns for bot/supabase/fns/recipients …

  const currentWeek = getCompletedWeekRangeKyiv(1);
  const prevWeek = getCompletedWeekRangeKyiv(2);
  const monthRanges = getMonthToDateCompareRangesKyiv();
  const dateSubtitle = formatDigestDateSubtitleFromRanges(
    currentWeek,
    monthRanges.current,
    monthRanges.previous,
  );

  const [overallCurrentRaw, overallPrevRaw] = await Promise.all([
    computeOverallStats(supabaseAdmin, {
      fromIso: monthRanges.current.fromIso,
      toIso: monthRanges.current.toIso,
      fromDate: monthRanges.current.fromDate,
      toDate: monthRanges.current.toDate,
    }),
    computeOverallStats(supabaseAdmin, {
      fromIso: monthRanges.previous.fromIso,
      toIso: monthRanges.previous.toIso,
      fromDate: monthRanges.previous.fromDate,
      toDate: monthRanges.previous.toDate,
    }),
  ]);
  const overallCurrent = dashboardToWeekSummary(overallCurrentRaw);
  const overallPrev = dashboardToWeekSummary(overallPrevRaw);

  let sent = 0;
  for (const t of recipients) {
    const chatId = String(t.chat_id).trim();
    try {
      const [current, previous] = await Promise.all([
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: currentWeek.fromIso,
          toIso: currentWeek.toIso,
        }),
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: prevWeek.fromIso,
          toIso: prevWeek.toIso,
        }),
      ]);

      const teacherName = current.teacherName || t.name || "Викладач";
      const teacherCurrent = teacherSummaryToWeekSummary(current.summary);
      const teacherPrev = teacherSummaryToWeekSummary(previous.summary);
      const caption = `📊 BBM — тижневий дайджест\n${teacherName}\n${currentWeek.label}`;

      try {
        const png = await renderWeeklyDigestPng({
          teacherName,
          dateSubtitle,
          teacherWeek: { current: teacherCurrent, previous: teacherPrev },
          overallMonth: { current: overallCurrent, previous: overallPrev },
        });
        await bot.telegram.sendPhoto(chatId, { source: png }, { caption });
      } catch (renderOrPhotoErr) {
        console.error(
          `[admin-weekly-digest] png failed teacher=${t.id}, falling back to text:`,
          renderOrPhotoErr?.message || renderOrPhotoErr,
        );
        const text = buildWeeklyStatsDigestText(
          teacherName,
          currentWeek.label,
          teacherCurrent,
          teacherPrev,
          overallCurrent,
          overallPrev,
        );
        await bot.telegram.sendMessage(chatId, text);
      }
      sent += 1;
    } catch (err) {
      console.error(
        `[admin-weekly-digest] send failed teacher=${t.id}:`,
        err?.description || err?.message || err,
      );
    }
  }
  console.log(`[admin-weekly-digest] done sent=${sent} recipients=${recipients.length} week=${currentWeek.label}`);
  return { sent, skipped: false };
}
```

Notes:

- Fallback text still uses month overall numbers in the “BBM загалом” block (acceptable; caption/PNG is primary). Optionally change fallback to still compute week overall — **do not**; keep one overall fetch (month) to match PNG and avoid extra queries.
- Update JSDoc on `buildWeeklyStatsDigestText` callers only if needed; leave the text builder itself unchanged.
- Ensure `bot.telegram.sendPhoto` exists in early-guard: change guard from only `sendMessage` to require `sendPhoto` **or** keep `sendMessage` guard and treat missing `sendPhoto` as PNG failure → text fallback. Prefer: early return only if `!bot?.telegram?.sendMessage` (unchanged); if `sendPhoto` missing, PNG path throws → fallback.

- [ ] **Step 3: Syntax check**

Run: `node --check admin-notifications.js`

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add admin-notifications.js
git commit -m "feat: send weekly digest as PNG with text fallback"
```

---

### Task 7: Manual verification

**Files:** none (runtime)

- [ ] **Step 1: Unit suite green**

Run: `node --test weekly-digest-png.test.js`

Expected: all PASS.

- [ ] **Step 2: Trigger digest against real bot (optional if env available)**

From project root with `.env` loaded as the app does:

```bash
node -e "import 'dotenv/config'; import { createClient } from '@supabase/supabase-js'; import { Telegraf } from 'telegraf'; import { runWeeklyTeacherStatsDigests } from './admin-notifications.js'; /* import or inline the same compute* wiring as server.js — prefer a small script that imports from a test hook if available */"
```

If wiring `computeTeacherLessonsJournal` / `computeAdminStatsDashboard` from `server.js` is awkward (not exported), instead:

1. Temporarily add a one-shot admin route or call `runWeeklyTeacherStatsDigests` from an existing server boot log behind `process.env.RUN_WEEKLY_DIGEST_ONCE=1` — **only if needed**; remove after check.
2. Or wait for cron Monday 09:00 Kyiv.

Minimum acceptable manual check without live Telegram:

- PNG file written in Task 5 looks like mockup v5 (KPI + bars, short labels).
- Code path review: month ranges passed to `computeOverallStats`; week ranges to teacher stats; `sendPhoto` then fallback.

- [ ] **Step 3: Final commit if any fixups**

Only if fixes were needed during verification.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| PNG KPI + paired bars template | 4, 5 |
| Personal week + BBM month on one image | 4, 6 |
| All 5 metrics | 4 |
| `sendPhoto` to digest recipients | 6 |
| Text fallback on render failure | 6 |
| Month 1…yesterday vs same days prev month + clip | 3 |
| No MTD / «міс.» in subtitle | 3, 4 |
| `@resvg/resvg-js`, no Puppeteer | 1, 5 |
| `%` edge cases prev=0 | 2 |
| Daily digest untouched | (no task touches it) |

## Self-review notes

- No placeholders left in steps.
- Fallback overall block uses **month** stats (same as PNG), not week — intentional, documented in Task 6.
- `buildWeeklyStatsDigestText` kept for fallback; week-vs-week overall text comparison is retired for the fallback path when PNG fails (month numbers appear under “BBM загалом”). Acceptable per YAGNI; if product later wants week overall in fallback, add a second overall week fetch then.
