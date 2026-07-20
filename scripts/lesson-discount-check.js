/**
 * ponytail: self-check for per-student lesson discount math (no framework).
 * Run: node scripts/lesson-discount-check.js
 */

import { applyVisitDiscount, normalizeDiscount } from "../lesson-discount.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(normalizeDiscount(null) === null, "null discount");
assert(normalizeDiscount({ discount_kind: "percent", discount_value: 0 }) === null, "zero invalid");
assert(normalizeDiscount({ discount_kind: "percent", discount_value: 101 }) === null, "over 100%");
assert(normalizeDiscount({ kind: "percent", value: 20 })?.kind === "percent", "alias keys");

{
  const r = applyVisitDiscount(500, { discount_kind: "percent", discount_value: 20 });
  assert(r.baseAmountUah === 500, "base kept");
  assert(r.amountUah === 400, "20% off 500");
  assert(r.discountUah === 100, "discount amount");
  assert(r.discountKind === "percent", "kind");
  assert(r.discountValue === 20, "value");
}

{
  const r = applyVisitDiscount(600, { discount_kind: "uah", discount_value: 150 });
  assert(r.amountUah === 450, "fixed ₴ off");
  assert(r.discountUah === 150, "fixed discount uah");
}

{
  const r = applyVisitDiscount(100, { discount_kind: "uah", discount_value: 250 });
  assert(r.amountUah === 0, "floor at 0");
  assert(r.discountUah === 100, "cannot discount more than base");
}

{
  const r = applyVisitDiscount(325.555, { discount_kind: "percent", discount_value: 10 });
  assert(r.baseAmountUah === 325.56, "base rounded");
  assert(r.amountUah === 293, "10% of rounded base");
}

{
  const r = applyVisitDiscount(400, null);
  assert(r.amountUah === 400 && r.discountUah === 0 && r.discountKind === null, "no discount");
}

console.log("ok");
