import assert from "node:assert/strict";
import test from "node:test";
import { formatPresetHint, formatRangePoint, monthCells, quickPeriod } from "./assets/js/stats-range.js";

test("September 2026 starts on Tuesday, so Monday is empty", () => {
  const cells = monthCells(2026, 9);
  assert.equal(cells[0], 0);
  assert.equal(cells[1], 1);
  assert.equal(cells[30], 30);
  assert.equal(cells.length % 7, 0);
});

test("range point and preset hint use the short Ukrainian month", () => {
  assert.equal(formatRangePoint("2026-09-01"), "1 вер. 2026");
  assert.equal(formatPresetHint("2026-09-01", "2026-09-14"), "1–14 вер.");
  assert.equal(formatPresetHint("2026-07-01", "2026-09-20"), "1 лип. – 20 вер.");
});

test("previous month ends on its last day", () => {
  assert.deepEqual(quickPeriod("prev-month", new Date(2026, 8, 20)), {
    from: "2026-08-01",
    to: "2026-08-31",
  });
  assert.deepEqual(quickPeriod("month", new Date(2024, 2, 1)), {
    from: "2024-03-01",
    to: "2024-03-01",
  });
});
