import { DateTime } from "luxon";
import { Resvg } from "@resvg/resvg-js";

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

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function truncateText(value, maxChars) {
  const chars = Array.from(String(value ?? ""));
  if (chars.length <= maxChars) return chars.join("");
  return `${chars.slice(0, maxChars).join("")}…`;
}

function trendColor(pct) {
  return pct >= 0 ? "#34d399" : "#f87171";
}

function metricValue(row, key) {
  return Number(row?.[key]) || 0;
}

function metricRange(previous, current, key, money = false) {
  const prev = metricValue(previous, key);
  const cur = metricValue(current, key);
  return `${formatCompactNumber(prev, { money })} → ${formatCompactNumber(cur, { money })}`;
}

function kpiCard({ x, y, label, previous, current, key, money = false }) {
  const prev = metricValue(previous, key);
  const cur = metricValue(current, key);
  const pct = percentChange(cur, prev);
  return `
    <rect x="${x}" y="${y}" width="230" height="112" rx="22" fill="#1f2937" stroke="#374151"/>
    <text x="${x + 22}" y="${y + 34}" fill="#d1d5db" font-size="23" font-weight="700">${escapeXml(label)}</text>
    <text x="${x + 22}" y="${y + 72}" fill="${trendColor(pct)}" font-size="34" font-weight="800">${escapeXml(formatPercentLabel(pct))}</text>
    <text x="${x + 22}" y="${y + 96}" fill="#94a3b8" font-size="18">${escapeXml(metricRange(previous, current, key, money))}</text>`;
}

function pairBarsRow({ x, y, label, previous, current, key, curColor, maxBar = 52, money = false }) {
  const prev = metricValue(previous, key);
  const cur = metricValue(current, key);
  const pct = percentChange(cur, prev);
  const heights = barHeights(prev, cur, maxBar);
  const baseline = y + maxBar + 4;
  return `
    <text x="${x}" y="${y + 32}" fill="#e5e7eb" font-size="20" font-weight="700">${escapeXml(label)}</text>
    <line x1="${x + 128}" y1="${baseline}" x2="${x + 370}" y2="${baseline}" stroke="#334155" stroke-width="2"/>
    <rect x="${x + 170}" y="${baseline - heights.prev}" width="34" height="${heights.prev}" rx="8" fill="#64748b"/>
    <rect x="${x + 214}" y="${baseline - heights.cur}" width="34" height="${heights.cur}" rx="8" fill="${curColor}"/>
    <text x="${x + 292}" y="${y + 32}" fill="#cbd5e1" font-size="18">${escapeXml(metricRange(previous, current, key, money))}</text>
    <text x="${x + 520}" y="${y + 32}" fill="${trendColor(pct)}" font-size="20" font-weight="800">${escapeXml(formatPercentLabel(pct))}</text>`;
}

export function buildWeeklyDigestSvg(payload) {
  const teacherWeek = payload?.teacherWeek ?? {};
  const weekCurrent = teacherWeek.current ?? {};
  const weekPrevious = teacherWeek.previous ?? {};
  const overallMonth = payload?.overallMonth ?? {};
  const monthCurrent = overallMonth.current ?? {};
  const monthPrevious = overallMonth.previous ?? {};
  const teacherName = escapeXml(truncateText(payload?.teacherName ?? "", 18));
  const dateSubtitle = escapeXml(payload?.dateSubtitle ?? "");
  const monthRevenuePct = percentChange(
    metricValue(monthCurrent, "revenue"),
    metricValue(monthPrevious, "revenue"),
  );

  const metrics = [
    ["уроки", "lessonsCount", false],
    ["учні", "uniquePeopleCount", false],
    ["візити", "totalPeopleCount", false],
    ["виручка", "revenue", true],
    ["виплата", "payout", true],
  ];

  const personalBars = metrics.map(([label, key, money], index) => pairBarsRow({
    x: 60,
    y: 340 + index * 58,
    label,
    previous: weekPrevious,
    current: weekCurrent,
    key,
    curColor: "#a78bfa",
    maxBar: 44,
    money,
  })).join("");

  const monthBars = metrics.map(([label, key, money], index) => pairBarsRow({
    x: 60,
    y: 738 + index * 26,
    label,
    previous: monthPrevious,
    current: monthCurrent,
    key,
    curColor: "#38bdf8",
    maxBar: 24,
    money,
  })).join("");

  return `<svg width="840" height="920" viewBox="0 0 840 920" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BBM weekly digest">
  <rect width="840" height="920" fill="#111827"/>
  <rect x="28" y="28" width="784" height="864" rx="36" fill="#172033" stroke="#293548" stroke-width="2"/>

  <text x="60" y="72" fill="#c4b5fd" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900">BBM · Тижневий дайджест</text>
  <text x="60" y="106" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="20">${dateSubtitle}</text>
  <text x="780" y="136" text-anchor="end" fill="#e5e7eb" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">${teacherName}</text>

  <text x="60" y="176" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="900">Особисте · тиждень</text>
  <text x="626" y="176" fill="#64748b" font-family="Inter, Arial, sans-serif" font-size="18">■ попередній</text>
  <text x="626" y="202" fill="#a78bfa" font-family="Inter, Arial, sans-serif" font-size="18">■ цей</text>
  <g font-family="Inter, Arial, sans-serif">
    ${kpiCard({ x: 60, y: 198, label: "уроки", previous: weekPrevious, current: weekCurrent, key: "lessonsCount" })}
    ${kpiCard({ x: 306, y: 198, label: "учні", previous: weekPrevious, current: weekCurrent, key: "uniquePeopleCount" })}
    ${kpiCard({ x: 552, y: 198, label: "виручка", previous: weekPrevious, current: weekCurrent, key: "revenue", money: true })}
    ${personalBars}
  </g>

  <line x1="60" y1="658" x2="780" y2="658" stroke="#334155" stroke-width="2"/>
  <text x="60" y="704" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="900">BBM · місяць</text>
  <text x="60" y="734" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="18">виручка</text>
  <text x="238" y="726" fill="${trendColor(monthRevenuePct)}" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="900">${escapeXml(formatPercentLabel(monthRevenuePct))}</text>
  <text x="626" y="704" fill="#64748b" font-family="Inter, Arial, sans-serif" font-size="18">■ попередній</text>
  <text x="626" y="730" fill="#38bdf8" font-family="Inter, Arial, sans-serif" font-size="18">■ цей</text>
  <g font-family="Inter, Arial, sans-serif">
    ${monthBars}
  </g>
</svg>`;
}

export async function renderWeeklyDigestPng(payload) {
  const svg = buildWeeklyDigestSvg(payload);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 840 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}
