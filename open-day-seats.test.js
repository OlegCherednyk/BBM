import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  OPEN_DAY_PRACTICE_DAY,
  openDaySeatError,
  openDaySeatsLeft,
  openDayTicketLine,
  openDayTicketShort,
  openDayTicketWord,
} from "./open-day-seats.js";

const paid = (pass, practices) => ({ pass, practices: practices || null, paid_at: "2026-09-28T10:00:00Z" });

describe("open day seats", () => {
  it("keeps 12 per direction and spends one of each on a full pass", () => {
    const left = openDaySeatsLeft([
      paid("full"),
      paid("grunt"),
      { pass: "sprouts", paid_at: null },
      paid("one", ["trenazh", "dance"]),
      paid("one", ["game", "stretch"]),
    ]);
    assert.deepEqual(left, { limit: 12, grunt: 9, sprouts: 10 });
  });

  it("spends one seat per direction when one pass covers both days", () => {
    const left = openDaySeatsLeft([paid("one", ["dance", "health"])]);
    assert.deepEqual(left, { limit: 12, grunt: 11, sprouts: 11 });
  });

  it("does not show a negative remainder", () => {
    const rows = Array.from({ length: 13 }, () => paid("grunt"));
    assert.equal(openDaySeatsLeft(rows).grunt, 0);
    assert.equal(openDaySeatsLeft(rows).sprouts, 12);
  });

  it("refuses a format that needs a sold-out direction", () => {
    const left = { limit: 12, grunt: 0, sprouts: 4 };
    assert.match(openDaySeatError(left, "full", null), /Full pass/);
    assert.equal(openDaySeatError(left, "sprouts", null), "");
    assert.match(openDaySeatError(left, "grunt", null), /Ґрунт/);
    assert.match(openDaySeatError(left, "one", ["dance"]), /Ґрунт/);
    assert.equal(openDaySeatError(left, "one", ["stretch"]), "");
    assert.match(openDaySeatError({ limit: 12, grunt: 0, sprouts: 0 }, "one", ["dance", "game"]), /обидва/);
  });

  it("names the remainder in Ukrainian", () => {
    assert.equal(openDayTicketWord(1), "квиток");
    assert.equal(openDayTicketWord(2), "квитки");
    assert.equal(openDayTicketWord(5), "квитків");
    assert.equal(openDayTicketWord(11), "квитків");
    assert.equal(openDayTicketWord(12), "квитків");
    assert.equal(openDayTicketLine("Ґрунт", 9, 12), "Ґрунт — лишилося 9 квитків із 12");
    assert.equal(openDayTicketLine("Паростки", 1, 12), "Паростки — лишилося 1 квиток із 12");
    assert.equal(openDayTicketLine("Ґрунт", 0, 12), "Ґрунт — не лишилося");
    assert.equal(openDayTicketShort(4, 12), "4 із 12");
    assert.equal(openDayTicketShort(0, 12), "не лишилося");
  });
});

describe("open day ticket reminder", () => {
  const landing = readFileSync(new URL("./open-day/landing.html", import.meta.url), "utf8");
  const form = readFileSync(new URL("./open-day/form.html", import.meta.url), "utf8");

  it("sits in the prices block, under the poster", () => {
    const heroEnd = landing.indexOf("</section>");
    const prices = landing.indexOf('id="prices"');
    const seats = landing.indexOf('id="seats"');
    assert.ok(heroEnd > -1 && prices > heroEnd && seats > prices);
    assert.equal(landing.slice(0, heroEnd).includes('id="seats"'), false);
    assert.match(landing, /Усього по 12 на напрям\. Full pass бере по одному з кожного\./);
    assert.equal(landing.includes("Подія передбачає 12 місць"), false);
  });

  it("repeats the same reminder on the registration form", () => {
    assert.match(form, /id="seats"/);
    assert.match(form, /Full pass бере по одному з кожного/);
    assert.equal(form.includes("Подія передбачає 12 місць"), false);
    for (const [id, day] of Object.entries(OPEN_DAY_PRACTICE_DAY)) {
      assert.match(form, new RegExp(`data-day="${day}"[\\s\\S]{0,180}value="${id}"`));
    }
  });
});
