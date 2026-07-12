import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  percentChange,
  formatPercentLabel,
  formatCompactNumber,
  barHeights,
  getMonthToDateCompareRangesKyiv,
  formatDigestDateSubtitle,
  formatDigestDateSubtitleFromRanges,
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

describe("getMonthToDateCompareRangesKyiv", () => {
  it("clips prev month day when current day exceeds prev month length", () => {
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

describe("formatDigestDateSubtitleFromRanges", () => {
  it("wraps ISO date strings and returns the same subtitle", () => {
    const s = formatDigestDateSubtitleFromRanges(
      { fromDate: "2026-07-06", toDate: "2026-07-12" },
      { fromDate: "2026-07-01", toDate: "2026-07-11" },
      { fromDate: "2026-06-01", toDate: "2026-06-11" },
    );
    assert.equal(s, "6–12 лип · 1–11 лип vs 1–11 чер");
  });
});
