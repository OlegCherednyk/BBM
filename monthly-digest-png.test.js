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
