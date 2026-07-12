import { DateTime } from "luxon";

const KYIV_TZ = "Europe/Kyiv";
const UK_MONTHS_SHORT = [
  "", "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];

/** @param {number} cur @param {number} prev */
export function percentChange(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p === 0 && c === 0) return 0;
  if (p === 0) return 100;
  return Math.round(((c - p) / p) * 100);
}

/** @param {number} pct */
export function formatPercentLabel(pct) {
  const n = Math.round(Number(pct) || 0);
  if (n === 0) return "0%";
  if (n > 0) return `+${n}%`;
  return `−${Math.abs(n)}%`;
}

/**
 * @param {number} value
 * @param {{ money?: boolean }} [opts]
 */
export function formatCompactNumber(value, { money = false } = {}) {
  const n = Number(value) || 0;
  if (money) {
    if (Math.abs(n) >= 1000) {
      const k = n / 1000;
      const s = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, "");
      return `${s}к`;
    }
    return String(Math.round(n));
  }
  return String(Math.round(n));
}

/**
 * @param {number} prev
 * @param {number} cur
 * @param {number} maxBar
 * @returns {{ prev: number, cur: number }}
 */
export function barHeights(prev, cur, maxBar) {
  const p = Math.max(0, Number(prev) || 0);
  const c = Math.max(0, Number(cur) || 0);
  const max = Math.max(p, c);
  const minH = 2;
  if (max === 0) return { prev: minH, cur: minH };
  return {
    prev: Math.max(minH, Math.round((p / max) * maxBar)),
    cur: Math.max(minH, Math.round((c / max) * maxBar)),
  };
}

export function getMonthToDateCompareRangesKyiv(now = DateTime.now().setZone(KYIV_TZ)) {
  const kyiv = now.setZone(KYIV_TZ);
  const yesterday = kyiv.startOf("day").minus({ days: 1 });
  const curStart = yesterday.startOf("month");
  const curEnd = yesterday;
  const dayN = yesterday.day;
  const prevMonthRef = curStart.minus({ months: 1 });
  const prevLastDay = prevMonthRef.endOf("month").day;
  const prevEndDay = Math.min(dayN, prevLastDay);
  const prevStart = prevMonthRef.startOf("month");
  const prevEnd = prevStart.set({ day: prevEndDay });

  const pack = (from, to) => ({
    fromDate: from.toISODate(),
    toDate: to.toISODate(),
    fromIso: from.startOf("day").toUTC().toISO(),
    toIso: to.endOf("day").toUTC().toISO(),
  });

  return { current: pack(curStart, curEnd), previous: pack(prevStart, prevEnd) };
}

function dayMonth(dt) {
  return `${dt.day} ${UK_MONTHS_SHORT[dt.month]}`;
}

export function formatDigestDateSubtitle(parts) {
  const weekSameMonth = parts.weekFrom.month === parts.weekTo.month;
  const weekPart = weekSameMonth
    ? `${parts.weekFrom.day}–${parts.weekTo.day} ${UK_MONTHS_SHORT[parts.weekTo.month]}`
    : `${dayMonth(parts.weekFrom)}–${dayMonth(parts.weekTo)}`;

  const monthPart = `${parts.monthFrom.day}–${parts.monthTo.day} ${UK_MONTHS_SHORT[parts.monthTo.month]}`;
  const prevPart = `${parts.prevMonthFrom.day}–${parts.prevMonthTo.day} ${UK_MONTHS_SHORT[parts.prevMonthTo.month]}`;
  return `${weekPart} · ${monthPart} vs ${prevPart}`;
}

export function formatDigestDateSubtitleFromRanges(week, monthCurrent, monthPrev) {
  const z = (isoDate) => DateTime.fromISO(isoDate, { zone: KYIV_TZ });
  return formatDigestDateSubtitle({
    weekFrom: z(week.fromDate),
    weekTo: z(week.toDate),
    monthFrom: z(monthCurrent.fromDate),
    monthTo: z(monthCurrent.toDate),
    prevMonthFrom: z(monthPrev.fromDate),
    prevMonthTo: z(monthPrev.toDate),
  });
}
