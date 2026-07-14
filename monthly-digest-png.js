import { DateTime } from "luxon";
import {
  percentChange,
  formatPercentLabel,
  formatCompactNumber,
  barHeights,
} from "./weekly-digest-png.js";

const KYIV_TZ = "Europe/Kyiv";
const UK_MONTHS = [
  "", "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

function packMonth(from, to) {
  return {
    fromDate: from.toISODate(),
    toDate: to.toISODate(),
    fromIso: from.startOf("day").toUTC().toISO(),
    toIso: to.endOf("day").toUTC().toISO(),
  };
}

/** Full previous calendar month vs month before that (Kyiv). */
export function getCompletedMonthCompareRangesKyiv(now = DateTime.now().setZone(KYIV_TZ)) {
  const kyiv = now.setZone(KYIV_TZ);
  const currentStart = kyiv.startOf("month").minus({ months: 1 });
  const currentEnd = currentStart.endOf("month").startOf("day");
  const previousStart = currentStart.minus({ months: 1 });
  const previousEnd = previousStart.endOf("month").startOf("day");
  return {
    current: packMonth(currentStart, currentEnd),
    previous: packMonth(previousStart, previousEnd),
  };
}

export function formatMonthCompareLabel(current, previous) {
  const c = DateTime.fromISO(current.fromDate, { zone: KYIV_TZ });
  const p = DateTime.fromISO(previous.fromDate, { zone: KYIV_TZ });
  return `${UK_MONTHS[c.month]} vs ${UK_MONTHS[p.month]}`;
}

export function avgPerLesson(visits, lessons) {
  const l = Number(lessons) || 0;
  if (l <= 0) return null;
  return Math.round(((Number(visits) || 0) / l) * 10) / 10;
}

export function revenuePerLesson(revenue, lessons) {
  const l = Number(lessons) || 0;
  if (l <= 0) return null;
  return Math.round((Number(revenue) || 0) / l);
}

export function conductedShare(conducted, scheduled) {
  const s = Number(scheduled) || 0;
  if (s <= 0) return null;
  return Math.round(((Number(conducted) || 0) / s) * 100);
}

export { percentChange, formatPercentLabel, formatCompactNumber, barHeights };
