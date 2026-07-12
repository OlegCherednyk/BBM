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
