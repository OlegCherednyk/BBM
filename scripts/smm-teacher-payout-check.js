/**
 * ponytail: self-check for SMM teacher payout math (no framework).
 * Run: node scripts/smm-teacher-payout-check.js
 */

function lessonPayout({ revenue, rent, smm, isSmmTeacher }) {
  return Math.round((revenue - rent - (isSmmTeacher ? 0 : smm)) * 100) / 100;
}

function dashboardForSmm({ lessons, smmTeacherId }) {
  /** @type {Map<string, { payout: number, smm: number, isSmm: boolean }>} */
  const by = new Map();
  let pool = 0;
  for (const L of lessons) {
    pool += L.smm;
    const payout = lessonPayout(L);
    const key = L.teacherId;
    const agg = by.get(key) || { payout: 0, smm: 0, isSmm: false };
    agg.payout += payout;
    if (!L.isSmmTeacher) agg.smm += L.smm;
    if (L.isSmmTeacher) agg.isSmm = true;
    by.set(key, agg);
  }
  const smmAgg = by.get(smmTeacherId) || { payout: 0, smm: 0, isSmm: true };
  smmAgg.isSmm = true;
  smmAgg.payout = Math.round((smmAgg.payout + pool) * 100) / 100;
  by.set(smmTeacherId, smmAgg);
  return { pool, by };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const lessons = [
  { teacherId: "a", revenue: 1000, rent: 200, smm: 250, isSmmTeacher: false },
  { teacherId: "b", revenue: 800, rent: 200, smm: 350, isSmmTeacher: true },
];

assert(lessonPayout(lessons[0]) === 550, "regular payout");
assert(lessonPayout(lessons[1]) === 600, "smm teacher lesson payout without smm deduct");

const { pool, by } = dashboardForSmm({ lessons, smmTeacherId: "b" });
assert(pool === 600, "pool smm");
assert(by.get("a").payout === 550, "regular unchanged");
assert(by.get("b").smm === 0, "no smm line on smm teacher");
assert(by.get("b").payout === 1200, "overall payout includes smm pool");

console.log("ok");
