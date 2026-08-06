import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSubscriptionPatchBody, computeSubscriptionUsedVisits } from "./subscription-utils.js";

describe("computeSubscriptionUsedVisits", () => {
  it("counts only journal when override is null", () => {
    assert.equal(computeSubscriptionUsedVisits(4, null, 8), 4);
  });

  it("adds opening override on top of journal attended", () => {
    assert.equal(computeSubscriptionUsedVisits(1, 1, 8), 2);
  });

  it("decreases when a journal visit is rolled back (journal 2 → 1)", () => {
    assert.equal(computeSubscriptionUsedVisits(2, 1, 8), 3);
    assert.equal(computeSubscriptionUsedVisits(1, 1, 8), 2);
  });
});

describe("buildSubscriptionPatchBody", () => {
  it("omits status when unchanged so server can recompute after visit rollback", () => {
    const body = buildSubscriptionPatchBody({
      total_visits: 8,
      valid_until: null,
      amount_uah: 2000,
      purchased_at: null,
      status: "exhausted",
      initialStatus: "exhausted",
      used_visits_override: null,
      attendedNow: 7,
      usedVisitsInput: 7,
    });
    assert.equal("status" in body, false);
    assert.equal(body.used_visits_override, null);
    assert.equal(body.total_visits, 8);
  });

  it("includes status when admin explicitly changed it", () => {
    const body = buildSubscriptionPatchBody({
      total_visits: 8,
      valid_until: null,
      amount_uah: null,
      purchased_at: null,
      status: "exhausted",
      initialStatus: "active",
      used_visits_override: null,
      attendedNow: 3,
      usedVisitsInput: 3,
    });
    assert.equal(body.status, "exhausted");
  });

  it("computes opening override from fresh attended count (not stale)", () => {
    const body = buildSubscriptionPatchBody({
      total_visits: 8,
      valid_until: null,
      amount_uah: null,
      purchased_at: null,
      status: "active",
      initialStatus: "active",
      attendedNow: 1,
      usedVisitsInput: 2,
    });
    assert.equal(body.used_visits_override, 1);
    assert.equal("status" in body, false);
  });

  it("clears override when used equals fresh attended after lesson delete rollback", () => {
    const body = buildSubscriptionPatchBody({
      total_visits: 8,
      valid_until: null,
      amount_uah: null,
      purchased_at: null,
      status: "active",
      initialStatus: "active",
      attendedNow: 4,
      usedVisitsInput: 4,
    });
    assert.equal(body.used_visits_override, null);
  });
});
