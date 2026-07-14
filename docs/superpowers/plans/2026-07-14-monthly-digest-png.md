# Monthly Digest PNG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a monthly Telegram PNG digest on the 1st at 09:00 Kyiv (personal full prev month + BBM breakdowns), with text fallback.

**Architecture:** Separate pipeline parallel to weekly: `getCompletedMonthCompareRangesKyiv` + `computeMonthlyDigestOverall` (one stats pass with direction/bank/single-abon) + `monthly-digest-png.js` (SVG→PNG via existing `@resvg/resvg-js`) + `runMonthlyTeacherStatsDigests` + cron `day===1`.

**Tech Stack:** Node.js ESM, Luxon, `@resvg/resvg-js`, Telegraf `sendPhoto`, existing journal/dashboard stats helpers.

**Spec:** `docs/superpowers/specs/2026-07-14-monthly-digest-png-design.md`  
**Mockup:** `.superpowers/brainstorm/.../content/monthly-final.html`

---

## File map

| File | Role |
|------|------|
| `monthly-digest-png.js` | Month ranges/labels, derived metrics, SVG layout (~1200×1280), `renderMonthlyDigestPng` |
| `monthly-digest-png.test.js` | Pure helpers + SVG smoke |
| `server.js` | Extend `places` select with `river_bank`; add `computeMonthlyDigestOverall` |
| `admin-notifications.js` | `runMonthlyTeacherStatsDigests`, text fallback, wire PNG |
| `lesson-vote-cron.js` | Fire monthly on day 1 at digest time |
| `server.js` (cron wiring) | Pass `runMonthlyTeacherStatsDigests` into cron |

Reuse from `weekly-digest-png.js` (import, do not copy): `percentChange`, `formatPercentLabel`, `formatCompactNumber`, `barHeights`.

---

### Task 1: Month ranges + derived metric helpers

**Files:**
- Create: `monthly-digest-png.js`
- Create: `monthly-digest-png.test.js`

- [ ] **Step 1: Write failing tests**

Create `monthly-digest-png.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  getCompletedMonthCompareRangesKyiv,
  formatMonthCompareLabel,
  avgPerLesson,
  revenuePerLesson,
  conductedShare,
} from "./monthly-digest-png.js";

describe("getCompletedMonthCompareRangesKyiv", () => {
  it("on 1 Jul uses June vs May full months", () => {
    const r = getCompletedMonthCompareRangesKyiv(
      DateTime.fromISO("2026-07-01T09:00:00", { zone: "Europe/Kyiv" }),
    );
    assert.equal(r.current.fromDate, "2026-06-01");
    assert.equal(r.current.toDate, "2026-06-30");
    assert.equal(r.previous.fromDate, "2026-05-01");
    assert.equal(r.previous.toDate, "2026-05-31");
  });

  it("handles January → December vs November", () => {
    const r = getCompletedMonthCompareRangesKyiv(
      DateTime.fromISO("2026-01-01T09:00:00", { zone: "Europe/Kyiv" }),
    );
    assert.equal(r.current.fromDate, "2025-12-01");
    assert.equal(r.current.toDate, "2025-12-31");
    assert.equal(r.previous.fromDate, "2025-11-01");
    assert.equal(r.previous.toDate, "2025-11-30");
  });
});

describe("formatMonthCompareLabel", () => {
  it("formats uk short months", () => {
    assert.equal(
      formatMonthCompareLabel(
        { fromDate: "2026-06-01", toDate: "2026-06-30" },
        { fromDate: "2026-05-01", toDate: "2026-05-31" },
      ),
      "червень vs травень",
    );
  });
});

describe("avgPerLesson / revenuePerLesson / conductedShare", () => {
  it("avgPerLesson one decimal", () => {
    assert.equal(avgPerLesson(130, 31), 4.2);
  });
  it("avgPerLesson zero lessons → null", () => {
    assert.equal(avgPerLesson(10, 0), null);
  });
  it("revenuePerLesson", () => {
    assert.equal(revenuePerLesson(55800, 31), 1800);
  });
  it("conductedShare percent", () => {
    assert.equal(conductedShare(124, 144), 86);
  });
  it("conductedShare scheduled 0 → null", () => {
    assert.equal(conductedShare(10, 0), null);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test monthly-digest-png.test.js`

Expected: FAIL (module missing).

- [ ] **Step 3: Implement helpers in `monthly-digest-png.js`**

```js
import { DateTime } from "luxon";
import { Resvg } from "@resvg/resvg-js";
import {
  percentChange,
  formatPercentLabel,
  formatCompactNumber,
  barHeights,
} from "./weekly-digest-png.js";

const KYIV_TZ = "Europe/Kyiv";
const UK_MONTHS = [
  "", "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

function packMonth(from, to) {
  return {
    fromDate: from.toISODate(),
    toDate: to.toISODate(),
    fromIso: from.startOf("day").toUTC().toISO(),
    toIso: to.endOf("day").toUTC().toISO(),
  };
}

/** Full previous calendar month vs month before that (Kyiv). */
export function getCompletedMonthCompareRangesKyiv(now = DateTime.now().setZone(KYIV_TZ)) {
  const kyiv = now.setZone(KYIV_TZ);
  const currentStart = kyiv.startOf("month").minus({ months: 1 });
  const currentEnd = currentStart.endOf("month").startOf("day");
  const previousStart = currentStart.minus({ months: 1 });
  const previousEnd = previousStart.endOf("month").startOf("day");
  return {
    current: packMonth(currentStart, currentEnd),
    previous: packMonth(previousStart, previousEnd),
  };
}

export function formatMonthCompareLabel(current, previous) {
  const c = DateTime.fromISO(current.fromDate, { zone: KYIV_TZ });
  const p = DateTime.fromISO(previous.fromDate, { zone: KYIV_TZ });
  return `${UK_MONTHS[c.month]} vs ${UK_MONTHS[p.month]}`;
}

export function avgPerLesson(visits, lessons) {
  const l = Number(lessons) || 0;
  if (l <= 0) return null;
  return Math.round(((Number(visits) || 0) / l) * 10) / 10;
}

export function revenuePerLesson(revenue, lessons) {
  const l = Number(lessons) || 0;
  if (l <= 0) return null;
  return Math.round((Number(revenue) || 0) / l);
}

export function conductedShare(conducted, scheduled) {
  const s = Number(scheduled) || 0;
  if (s <= 0) return null;
  return Math.round(((Number(conducted) || 0) / s) * 100);
}

export { percentChange, formatPercentLabel, formatCompactNumber, barHeights };
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test monthly-digest-png.test.js`

Expected: PASS (all helpers).

- [ ] **Step 5: Commit**

```bash
git add monthly-digest-png.js monthly-digest-png.test.js
git commit -m "feat: add monthly digest date ranges and derived metrics"
```

---

### Task 2: `computeMonthlyDigestOverall` in server.js

**Files:**
- Modify: `server.js` (`loadAdminStatsLessonsContext` select + new function near `computeAdminStatsDashboard`)

- [ ] **Step 1: Extend places select to include `river_bank`**

In `loadAdminStatsLessonsContext`, change places fragment from `places(name)` to `places(name, river_bank)`.

- [ ] **Step 2: Add `computeMonthlyDigestOverall` after `computeAdminStatsDashboard`**

This function loads context once, reuses `computeLessonFinancialsForStats`, and returns summary + breakdowns. Import `parsePlaceRiverBank` at top of `server.js` if not already (it is already imported from `admin-notifications.js`).

```js
/**
 * BBM monthly digest: dashboard-like summary + direction/bank/visit-kind breakdowns.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ fromIso?: string | null, toIso?: string | null, fromDate?: string | null, toDate?: string | null }} args
 */
async function computeMonthlyDigestOverall(supabaseAdmin, { fromIso, toIso, fromDate, toDate }) {
  const dashboard = await computeAdminStatsDashboard(supabaseAdmin, { fromIso, toIso, fromDate, toDate });
  const ctx = await loadAdminStatsLessonsContext(supabaseAdmin, { fromIso, toIso });

  /** @type {Map<string, { id: string, name: string, lessonsCount: number, totalPeopleCount: number, revenue: number }>} */
  const byDirection = new Map();
  /** @type {Map<"left"|"right", { key: "left"|"right", label: string, lessonsCount: number, totalPeopleCount: number, revenue: number }>} */
  const byBank = new Map();
  let singleVisits = 0;
  let abonVisits = 0;

  for (const row of ctx.lessons) {
    const fin = await computeLessonFinancialsForStats(supabaseAdmin, row, ctx);
    const type = row.lesson_times?.lesson_types || null;
    const typeId = String(type?.id || "unknown");
    const typeName = String(type?.name || "Інше").trim() || "Інше";
    const dir = byDirection.get(typeId) || {
      id: typeId,
      name: typeName,
      lessonsCount: 0,
      totalPeopleCount: 0,
      revenue: 0,
    };
    dir.lessonsCount += 1;
    dir.totalPeopleCount += fin.peopleCount;
    dir.revenue += fin.revenue;
    byDirection.set(typeId, dir);

    const bank = parsePlaceRiverBank(row.places?.river_bank);
    if (bank === "left" || bank === "right") {
      const label = bank === "left" ? "Лівий" : "Правий";
      const b = byBank.get(bank) || {
        key: bank,
        label,
        lessonsCount: 0,
        totalPeopleCount: 0,
        revenue: 0,
      };
      b.lessonsCount += 1;
      b.totalPeopleCount += fin.peopleCount;
      b.revenue += fin.revenue;
      byBank.set(bank, b);
    }

    const oid = String(row.lesson_vote_occurrence_id || "").trim();
    const visits = oid ? ctx.visitsByOccurrence.get(oid) || [] : [];
    for (const v of visits) {
      if (v.vote_choice === "single") singleVisits += 1;
      else if (v.vote_choice === "abon") abonVisits += 1;
    }
  }

  const teachers = dashboard.teachers || [];
  const summary = {
    lessonsCount: Number(dashboard.summary?.totalLessons) || 0,
    uniquePeopleCount: Number(dashboard.summary?.totalPeople) || 0,
    totalPeopleCount:
      Number(dashboard.summary?.totalPeopleAll) ||
      teachers.reduce((sum, row) => sum + (Number(row.peopleCount) || 0), 0),
    revenue: teachers.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
    payout: teachers.reduce((sum, row) => sum + (Number(row.payout) || 0), 0),
    scheduledLessons:
      dashboard.summary?.totalScheduledLessons == null
        ? null
        : Number(dashboard.summary.totalScheduledLessons) || 0,
  };

  return {
    summary,
    byDirection: [...byDirection.values()].sort((a, b) => b.lessonsCount - a.lessonsCount),
    byBank: ["right", "left"]
      .map((k) => byBank.get(/** @type {"left"|"right"} */ (k)))
      .filter(Boolean),
    visitKinds: { single: singleVisits, abon: abonVisits },
  };
}
```

Note: this double-loads context (dashboard + overall). Acceptable for monthly once/month; do not optimize unless needed.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: compute monthly digest overall with direction/bank/visit breakdowns"
```

---

### Task 3: SVG + PNG renderer

**Files:**
- Modify: `monthly-digest-png.js`
- Modify: `monthly-digest-png.test.js`

- [ ] **Step 1: Add SVG smoke test**

Append to `monthly-digest-png.test.js`:

```js
import { buildMonthlyDigestSvg, renderMonthlyDigestPng } from "./monthly-digest-png.js";

const sampleSummary = {
  lessonsCount: 31,
  uniquePeopleCount: 42,
  totalPeopleCount: 130,
  revenue: 50000,
  payout: 28000,
};

describe("buildMonthlyDigestSvg", () => {
  it("includes title and personal block", () => {
    const svg = buildMonthlyDigestSvg({
      teacherName: "Олена К.",
      dateSubtitle: "червень vs травень",
      teacherMonth: { current: sampleSummary, previous: { ...sampleSummary, lessonsCount: 28, revenue: 52000 } },
      overall: {
        current: {
          summary: { ...sampleSummary, lessonsCount: 124, scheduledLessons: 144, revenue: 186000 },
          byDirection: [
            { name: "Сучасний", lessonsCount: 72, totalPeopleCount: 410, revenue: 118000 },
            { name: "Тренаж", lessonsCount: 52, totalPeopleCount: 280, revenue: 68000 },
          ],
          byBank: [
            { key: "right", label: "Правий", lessonsCount: 68, totalPeopleCount: 380, revenue: 102000 },
            { key: "left", label: "Лівий", lessonsCount: 56, totalPeopleCount: 310, revenue: 84000 },
          ],
          visitKinds: { single: 210, abon: 480 },
        },
        previous: {
          summary: { ...sampleSummary, lessonsCount: 110, scheduledLessons: 140, revenue: 172000 },
          byDirection: [],
          byBank: [],
          visitKinds: { single: 192, abon: 492 },
        },
      },
    });
    assert.match(svg, /Місячний дайджест/);
    assert.match(svg, /Особисте/);
    assert.match(svg, /124/);
    assert.match(svg, /з 144/);
    assert.match(svg, /Разові|разові/i);
  });
});

describe("renderMonthlyDigestPng", () => {
  it("returns a PNG buffer", async () => {
    const buf = await renderMonthlyDigestPng({
      teacherName: "Test",
      dateSubtitle: "червень vs травень",
      teacherMonth: { current: sampleSummary, previous: sampleSummary },
      overall: {
        current: {
          summary: { ...sampleSummary, scheduledLessons: 40 },
          byDirection: [{ name: "A", lessonsCount: 10, totalPeopleCount: 40, revenue: 10000 }],
          byBank: [{ key: "right", label: "Правий", lessonsCount: 10, totalPeopleCount: 40, revenue: 10000 }],
          visitKinds: { single: 10, abon: 30 },
        },
        previous: {
          summary: { ...sampleSummary, scheduledLessons: 40 },
          byDirection: [],
          byBank: [],
          visitKinds: { single: 8, abon: 32 },
        },
      },
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test monthly-digest-png.test.js`

Expected: FAIL (`buildMonthlyDigestSvg` missing).

- [ ] **Step 3: Implement `buildMonthlyDigestSvg` + `renderMonthlyDigestPng`**

Implement in `monthly-digest-png.js` following mockup `monthly-final.html`:

- Canvas **1200×1280**, bg `#111827`
- Blocks in order: header → personal (largest) → BBM → directions|banks → single/abon
- KPI card format: label / `formatPercentLabel(pct)` / current value / `було {prev}`
- Personal bar color `#a78bfa`; BBM bars `#38bdf8`; grey prev `#64748b`
- Conducted: `X з Y` + progress rect width = share%
- Directions/banks: share bar by **lessonsCount**; cards with visits/revenue/avg
- Visit kinds: single vs abon counts, stacked bar, abs delta vs previous

Use local helpers: `escapeXml`, `truncateText`, `trendColor` (copy small private helpers from weekly — do not export). Structure SVG with nested `<g>` per block; keep text short.

Minimal skeleton (expand to full layout matching mockup — engineer must fill all five blocks with real numbers from payload, not placeholders):

```js
function escapeXml(value) { /* same as weekly */ }
function truncateText(value, maxChars) { /* same as weekly */ }
function trendColor(pct) { return pct >= 0 ? "#34d399" : "#f87171"; }
function metric(row, key) { return Number(row?.[key]) || 0; }

function kpiBox(x, y, w, h, label, cur, prev, { money = false, decimals = null } = {}) {
  const pct = percentChange(cur, prev);
  const curLabel =
    decimals != null && cur != null
      ? String(cur)
      : cur == null
        ? "—"
        : formatCompactNumber(cur, { money });
  const prevLabel =
    decimals != null && prev != null
      ? String(prev)
      : prev == null
        ? "—"
        : formatCompactNumber(prev, { money });
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937" stroke="#374151"/>
    <text x="${x + w / 2}" y="${y + 18}" text-anchor="middle" fill="#9ca3af" font-size="11" font-weight="700">${escapeXml(label)}</text>
    <text x="${x + w / 2}" y="${y + 44}" text-anchor="middle" fill="${trendColor(pct)}" font-size="22" font-weight="900">${escapeXml(formatPercentLabel(pct))}</text>
    <text x="${x + w / 2}" y="${y + 66}" text-anchor="middle" fill="#e5e7eb" font-size="14" font-weight="700">${escapeXml(curLabel)}</text>
    <text x="${x + w / 2}" y="${y + 84}" text-anchor="middle" fill="#64748b" font-size="11">було ${escapeXml(prevLabel)}</text>`;
}

export function buildMonthlyDigestSvg(payload) {
  // Read teacherMonth.current/previous, overall.current/previous
  // Layout coordinates from mockup; personal block y≈70–420; BBM ~430–640; splits ~650–920; visitKinds ~930–1080
  // Return full SVG string width=1200 height=1280
  // MUST include Ukrainian labels from mockup
}

export async function renderMonthlyDigestPng(payload) {
  const svg = buildMonthlyDigestSvg(payload);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}
```

**Implementation note for agent:** Do not leave stub comments inside `buildMonthlyDigestSvg`. Produce complete SVG markup for all five blocks. Use `avgPerLesson` / `revenuePerLesson` / `conductedShare` for derived fields. For avg KPI percent: `percentChange(curAvg, prevAvg)` with null→ treat as 0/0 → `0%` and display `—` for values when null.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test monthly-digest-png.test.js`

Expected: PASS including PNG magic bytes.

- [ ] **Step 5: Commit**

```bash
git add monthly-digest-png.js monthly-digest-png.test.js
git commit -m "feat: render monthly digest PNG card"
```

---

### Task 4: `runMonthlyTeacherStatsDigests` + text fallback

**Files:**
- Modify: `admin-notifications.js`

- [ ] **Step 1: Add imports**

```js
import {
  formatMonthCompareLabel,
  getCompletedMonthCompareRangesKyiv,
  renderMonthlyDigestPng,
} from "./monthly-digest-png.js";
```

- [ ] **Step 2: Add text fallback builder**

```js
export function buildMonthlyStatsDigestText(teacherName, monthLabel, teacherCurrent, teacherPrev, overallCurrent, overallPrev) {
  const name = String(teacherName || "Викладач").trim();
  const lines = [
    "📊 BBM — місячний дайджест",
    monthLabel,
    "",
    ...formatStatsBlock(`👤 ${name}`, teacherCurrent, teacherPrev),
    "",
    ...formatStatsBlock("🏫 BBM загалом", overallCurrent, overallPrev),
  ];
  let text = lines.join("\n").trim();
  if (text.length > 4096) text = `${text.slice(0, 4090)}…`;
  return text;
}
```

(`formatStatsBlock` already exists in this file.)

- [ ] **Step 3: Add runner**

```js
/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ telegram: { sendMessage: Function, sendPhoto: Function } } | null} bot
 * @param {typeof computeTeacherLessonsJournal} computeTeacherStats
 * @param {typeof computeMonthlyDigestOverall} computeOverallMonthly
 */
export async function runMonthlyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherStats, computeOverallMonthly) {
  if (!supabaseAdmin || !bot?.telegram?.sendMessage) {
    console.log("[admin-monthly-digest] skipped: bot or supabase not configured");
    return { sent: 0, skipped: true };
  }
  if (typeof computeTeacherStats !== "function" || typeof computeOverallMonthly !== "function") {
    console.log("[admin-monthly-digest] skipped: compute fns not configured");
    return { sent: 0, skipped: true };
  }

  const recipients = await loadDigestRecipients(supabaseAdmin);
  if (!recipients.length) {
    console.log("[admin-monthly-digest] no recipients with digest_enabled");
    return { sent: 0, skipped: false };
  }

  const ranges = getCompletedMonthCompareRangesKyiv();
  const dateSubtitle = formatMonthCompareLabel(ranges.current, ranges.previous);

  const [overallCurrent, overallPrev] = await Promise.all([
    computeOverallMonthly(supabaseAdmin, {
      fromIso: ranges.current.fromIso,
      toIso: ranges.current.toIso,
      fromDate: ranges.current.fromDate,
      toDate: ranges.current.toDate,
    }),
    computeOverallMonthly(supabaseAdmin, {
      fromIso: ranges.previous.fromIso,
      toIso: ranges.previous.toIso,
      fromDate: ranges.previous.fromDate,
      toDate: ranges.previous.toDate,
    }),
  ]);

  const overallSummaryCurrent = overallCurrent.summary;
  const overallSummaryPrev = overallPrev.summary;

  let sent = 0;
  for (const t of recipients) {
    try {
      const [current, previous] = await Promise.all([
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: ranges.current.fromIso,
          toIso: ranges.current.toIso,
        }),
        computeTeacherStats(supabaseAdmin, {
          teacherId: String(t.id),
          teacherName: String(t.name || ""),
          fromIso: ranges.previous.fromIso,
          toIso: ranges.previous.toIso,
        }),
      ]);

      const chatId = String(t.chat_id).trim();
      const teacherName = current.teacherName || t.name || "Викладач";
      const teacherCurrent = teacherSummaryToWeekSummary(current.summary);
      const teacherPrev = teacherSummaryToWeekSummary(previous.summary);

      try {
        const png = await renderMonthlyDigestPng({
          teacherName,
          dateSubtitle,
          teacherMonth: { current: teacherCurrent, previous: teacherPrev },
          overall: { current: overallCurrent, previous: overallPrev },
        });
        await bot.telegram.sendPhoto(
          chatId,
          { source: png },
          { caption: `📊 BBM — місячний дайджест\n${teacherName}\n${dateSubtitle}` },
        );
      } catch (pngErr) {
        console.error(
          `[admin-monthly-digest] png send failed teacher=${t.id}, falling back to text:`,
          pngErr?.description || pngErr?.message || pngErr,
        );
        const text = buildMonthlyStatsDigestText(
          teacherName,
          dateSubtitle,
          teacherCurrent,
          teacherPrev,
          overallSummaryCurrent,
          overallSummaryPrev,
        );
        await bot.telegram.sendMessage(chatId, text);
      }
      sent += 1;
    } catch (err) {
      console.error(
        `[admin-monthly-digest] send failed teacher=${t.id}:`,
        err?.description || err?.message || err,
      );
    }
  }
  console.log(`[admin-monthly-digest] done sent=${sent} recipients=${recipients.length} label=${dateSubtitle}`);
  return { sent, skipped: false };
}
```

- [ ] **Step 4: Commit**

```bash
git add admin-notifications.js
git commit -m "feat: run monthly teacher stats digests with PNG fallback"
```

---

### Task 5: Cron + server wiring

**Files:**
- Modify: `lesson-vote-cron.js`
- Modify: `server.js`

- [ ] **Step 1: Extend cron**

In `startDailyLessonVoteCron` destructuring, add `runMonthlyTeacherStatsDigests`.

Reuse `weeklyDigestTime` for clock time (same 09:00 default). Add:

```js
let lastMonthlyDigestRunDateKyiv = "";
```

Inside `tick`, after weekly block:

```js
if (
  weeklyDigestTime &&
  nowKyiv.day === 1 &&
  isSameKyivMinute(nowKyiv, weeklyDigestTime) &&
  lastMonthlyDigestRunDateKyiv !== dateKey
) {
  lastMonthlyDigestRunDateKyiv = dateKey;
  console.log(`[lesson-vote-daily-cron] monthly digest run started kyiv=${nowKyiv.toISO()}`);
  if (typeof runMonthlyTeacherStatsDigests === "function") {
    try {
      await runMonthlyTeacherStatsDigests();
    } catch (error) {
      console.error("[lesson-vote-daily-cron] monthly digest exception:", error?.message || error);
    }
  }
}
```

Update the enabled log line to mention monthly uses same time.

- [ ] **Step 2: Wire in `server.js`**

Update import:

```js
import { parsePlaceRiverBank, runDailyTeacherDigests, runWeeklyTeacherStatsDigests, runMonthlyTeacherStatsDigests, teacherMatchesBank } from "./admin-notifications.js";
```

Update `startDailyLessonVoteCron({...})`:

```js
runWeeklyTeacherStatsDigests: () =>
  runWeeklyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherLessonsJournal, computeAdminStatsDashboard),
runMonthlyTeacherStatsDigests: () =>
  runMonthlyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherLessonsJournal, computeMonthlyDigestOverall),
```

- [ ] **Step 3: Commit**

```bash
git add lesson-vote-cron.js server.js
git commit -m "feat: schedule monthly digest on 1st at digest time Kyiv"
```

---

### Task 6: Manual verification checklist

- [ ] **Step 1: Unit tests**

Run: `node --test monthly-digest-png.test.js weekly-digest-png.test.js`

Expected: all PASS (weekly unchanged).

- [ ] **Step 2: Manual send (optional, needs bot)**

From a one-off script or temporary route/REPL call:

```js
await runMonthlyTeacherStatsDigests(supabaseAdmin, bot, computeTeacherLessonsJournal, computeMonthlyDigestOverall);
```

Expected: each `digest_enabled` teacher gets a photo; caption has «місячний дайджест»; card shows personal largest on top, then BBM «X з Y», directions, banks, single/abon.

- [ ] **Step 3: Final commit if any polish**

Only if Step 2 required SVG tweaks — commit with message `fix: polish monthly digest PNG layout`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| 1st @ 09:00 Kyiv | Task 5 |
| Full prev month vs month before | Task 1 ranges |
| Separate pipeline | Tasks 3–5 (no weekly refactor) |
| Personal largest + BBM + directions + banks + single/abon | Task 3 |
| X з Y not «план→факт» | Task 3 |
| KPI format `%` / value / `було` | Task 3 |
| digest_enabled recipients | Task 4 |
| PNG + text fallback | Task 4 |
| `@resvg` reuse, no new deps | Task 3 |
| river_bank on places | Task 2 |
| Tests for ranges/derived/PNG | Tasks 1, 3, 6 |

No TBD placeholders remain after Task 3 note: agent must fully implement SVG (not a stub).
