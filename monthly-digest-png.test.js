import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  getCompletedMonthCompareRangesKyiv,
  formatMonthCompareLabel,
  avgPerLesson,
  revenuePerLesson,
  conductedShare,
  buildMonthlyDigestSvg,
  renderMonthlyDigestPng,
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

  it("shows 0% when derived avg is null", () => {
    const empty = { lessonsCount: 0, uniquePeopleCount: 0, totalPeopleCount: 0, revenue: 0, payout: 0 };
    const svg = buildMonthlyDigestSvg({
      teacherName: "Test",
      dateSubtitle: "червень vs травень",
      teacherMonth: { current: empty, previous: empty },
      overall: {
        current: {
          summary: { ...empty, scheduledLessons: 0 },
          byDirection: [],
          byBank: [],
          visitKinds: { single: 0, abon: 0 },
        },
        previous: {
          summary: { ...empty, scheduledLessons: 0 },
          byDirection: [],
          byBank: [],
          visitKinds: { single: 0, abon: 0 },
        },
      },
    });
    assert.match(svg, /СЕР\. НА УРОК[\s\S]*?>0%</);
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
