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

function formatWeekRangeShort(fromDate, toDate) {
  const from = DateTime.fromISO(fromDate, { zone: KYIV_TZ });
  const to = DateTime.fromISO(toDate, { zone: KYIV_TZ });
  if (from.month === to.month) {
    return `${from.day}–${to.day} ${UK_MONTHS_SHORT[to.month]}`;
  }
  return `${from.day} ${UK_MONTHS_SHORT[from.month]} – ${to.day} ${UK_MONTHS_SHORT[to.month]}`;
}

/** @param {{ fromDate: string, toDate: string }} current @param {{ fromDate: string, toDate: string }} previous */
export function formatWeekCompareSubtitle(current, previous) {
  return `${formatWeekRangeShort(current.fromDate, current.toDate)} vs ${formatWeekRangeShort(previous.fromDate, previous.toDate)}`;
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

function metric(row, key) {
  return Number(row?.[key]) || 0;
}

/** Same "X з Y" share used by monthly digest; copied (not imported) to avoid a monthly→weekly circular import. */
function conductedShare(conducted, scheduled) {
  const s = Number(scheduled) || 0;
  if (s <= 0) return null;
  return Math.round(((Number(conducted) || 0) / s) * 100);
}

const FONT = "Inter, Arial, sans-serif";

const WEEKLY_METRICS = [
  ["уроки", "lessonsCount", false],
  ["учні", "uniquePeopleCount", false],
  ["візити", "totalPeopleCount", false],
  ["виручка", "revenue", true],
  ["виплата", "payout", true],
];

const BBM_KPI_METRICS = [
  ["уроки", "lessonsCount", false],
  ["візити", "totalPeopleCount", false],
  ["виручка", "revenue", true],
];

/** KPI card: label / %change / value / "було {prev}". Copied from monthly-digest-png.js. */
function kpiBox({ x, y, w, h, label, cur, prev, money = false }) {
  const pct = (cur == null || prev == null) ? 0 : percentChange(cur, prev);
  const fmt = (v) => (v == null ? "—" : formatCompactNumber(v, { money }));
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937" stroke="#374151"/>
    <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" fill="#9ca3af" font-size="11" font-weight="700">${escapeXml(label)}</text>
    <text x="${x + w / 2}" y="${y + 52}" text-anchor="middle" fill="${trendColor(pct)}" font-size="24" font-weight="900">${escapeXml(formatPercentLabel(pct))}</text>
    <text x="${x + w / 2}" y="${y + 76}" text-anchor="middle" fill="#e5e7eb" font-size="15" font-weight="700">${escapeXml(fmt(cur))}</text>
    <text x="${x + w / 2}" y="${y + 94}" text-anchor="middle" fill="#64748b" font-size="11">було ${escapeXml(fmt(prev))}</text>`;
}

function legendTwoLine({ x, y, prevLabel, curLabel, curColor }) {
  return `
    <text x="${x}" y="${y}" text-anchor="end" fill="#64748b" font-size="13">■ ${escapeXml(prevLabel)}</text>
    <text x="${x}" y="${y + 22}" text-anchor="end" fill="${curColor}" font-size="13">■ ${escapeXml(curLabel)}</text>`;
}

/** Grouped bar-chart comparing tracked metrics, prev (grey) vs current (curColor). Copied from monthly-digest-png.js. */
function categoryBarsChart({ x, y, w, h, current, previous, curColor, metricsList, showLabel = true, label = "" }) {
  const labelH = showLabel ? 22 : 0;
  const catLabelH = 16;
  const barsH = Math.max(10, h - labelH - catLabelH);
  const baseline = y + labelH + barsH;
  const slotW = w / metricsList.length;
  const barW = Math.max(8, Math.min(24, slotW * 0.28));
  const bars = metricsList.map(([lbl, key], i) => {
    const heights = barHeights(metric(previous, key), metric(current, key), barsH);
    const cx = x + i * slotW + slotW / 2;
    return `
      <rect x="${cx - barW - 3}" y="${baseline - heights.prev}" width="${barW}" height="${heights.prev}" rx="3" fill="#64748b"/>
      <rect x="${cx + 3}" y="${baseline - heights.cur}" width="${barW}" height="${heights.cur}" rx="3" fill="${curColor}"/>
      <text x="${cx}" y="${baseline + 14}" text-anchor="middle" fill="#94a3b8" font-size="11">${escapeXml(lbl)}</text>`;
  }).join("");
  const labelText = showLabel
    ? `<text x="${x}" y="${y + 14}" fill="#9ca3af" font-size="11" font-weight="700">${escapeXml(label)}</text>`
    : "";
  return `${labelText}${bars}`;
}

/** "Уроки проведено: X з Y  Z%" + progress bar. Copied from monthly-digest-png.js. */
function lessonsProgressCard({ x, y, w, h, conducted, scheduled, pct }) {
  const scheduledLabel = scheduled == null ? "—" : String(scheduled);
  const pctLabel = pct == null ? "—" : `${pct}%`;
  const barPct = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const barW = w - 32;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937" stroke="#38bdf8" stroke-opacity="0.25"/>
    <text x="${x + 16}" y="${y + 22}" fill="#9ca3af" font-size="11" font-weight="700">УРОКИ ПРОВЕДЕНО</text>
    <text x="${x + 16}" y="${y + 54}" fill="#f8fafc" font-size="26" font-weight="900">${escapeXml(String(conducted))}<tspan fill="#94a3b8" font-size="16" font-weight="600"> з ${escapeXml(scheduledLabel)}</tspan><tspan fill="#38bdf8" font-size="18" font-weight="800"> ${escapeXml(pctLabel)}</tspan></text>
    <rect x="${x + 16}" y="${y + h - 18}" width="${barW}" height="8" rx="4" fill="#334155"/>
    <rect x="${x + 16}" y="${y + h - 18}" width="${(barW * barPct) / 100}" height="8" rx="4" fill="#38bdf8"/>`;
}

/** Full-width monthly-style block: title + legend + 5 KPIs + full-width bars chart. */
function sectionBlock({ x, y, w, h, title, prevLabel, curLabel, curColor, current, previous, chartLabel }) {
  const innerX = x + 20;
  const innerW = w - 40;
  const titleY = y + 20 + 22;
  const kpiRowY = titleY + 16;
  const kpiH = 140;
  const kpiGap = 16;
  const kpiW = (innerW - kpiGap * 4) / 5;
  const kpis = WEEKLY_METRICS.map(([label, key, money], i) => kpiBox({
    x: innerX + i * (kpiW + kpiGap),
    y: kpiRowY,
    w: kpiW,
    h: kpiH,
    label: label.toUpperCase(),
    cur: metric(current, key),
    prev: metric(previous, key),
    money,
  })).join("");
  const chartY = kpiRowY + kpiH + 16;
  const chartH = y + h - 20 - chartY;
  const chart = categoryBarsChart({
    x: innerX, y: chartY, w: innerW, h: chartH,
    current, previous, curColor, metricsList: WEEKLY_METRICS, label: chartLabel,
  });
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#172033" stroke="#293548"/>
    <text x="${innerX}" y="${titleY}" fill="#f8fafc" font-size="26" font-weight="900">${escapeXml(title)}</text>
    ${legendTwoLine({ x: innerX + innerW, y: y + 18, prevLabel, curLabel, curColor })}
    ${kpis}
    <rect x="${innerX}" y="${chartY}" width="${innerW}" height="${chartH}" rx="10" fill="#1f2937" stroke="#374151"/>
    ${chart}`;
}

export function buildWeeklyDigestSvg(payload) {
  const teacherWeek = payload?.teacherWeek ?? {};
  const tCur = teacherWeek.current ?? {};
  const tPrev = teacherWeek.previous ?? {};
  const overallWeek = payload?.overallWeek ?? {};
  const oCur = overallWeek.current ?? {};
  const oPrev = overallWeek.previous ?? {};

  const teacherName = escapeXml(truncateText(payload?.teacherName ?? "", 18));
  const dateSubtitleRaw = String(payload?.dateSubtitle ?? "");
  const dateSubtitle = escapeXml(dateSubtitleRaw);
  const [curWeekWord, prevWeekWord] = dateSubtitleRaw.split(" vs ");

  const b1 = { x: 32, y: 90, w: 1136, h: 380 };
  const block1 = sectionBlock({
    x: b1.x, y: b1.y, w: b1.w, h: b1.h,
    title: "Особисте · тиждень",
    prevLabel: prevWeekWord || "попередній",
    curLabel: curWeekWord || "поточний",
    curColor: "#a78bfa",
    current: tCur,
    previous: tPrev,
    chartLabel: "ПОРІВНЯННЯ З ПОПЕРЕДНІМ ТИЖНЕМ",
  });

  const b2 = { x: 32, y: b1.y + b1.h + 16, w: 1136, h: 270 };
  const b2InnerX = b2.x + 20;
  const b2InnerW = b2.w - 40;
  const b2TitleY = b2.y + 20 + 22;
  const row1Y = b2TitleY + 18;
  const row1H = 100;
  const progressW = 380;
  const kpiGap = 16;
  const kpiW = (b2InnerW - progressW - kpiGap * 3) / 3;
  const oConducted = metric(oCur, "lessonsCount");
  const oScheduled = oCur.scheduledLessons ?? null;
  const oSharePct = conductedShare(oConducted, oScheduled);

  const bbmKpis = BBM_KPI_METRICS.map(([label, key, money], i) => kpiBox({
    x: b2InnerX + progressW + kpiGap + i * (kpiW + kpiGap),
    y: row1Y,
    w: kpiW,
    h: row1H,
    label: label.toUpperCase(),
    cur: metric(oCur, key),
    prev: metric(oPrev, key),
    money,
  })).join("");

  const b2Row2Y = row1Y + row1H + 12;
  const b2Row2H = b2.y + b2.h - 20 - b2Row2Y;
  const bbmChart = categoryBarsChart({
    x: b2InnerX, y: b2Row2Y, w: b2InnerW, h: b2Row2H,
    current: oCur, previous: oPrev, curColor: "#38bdf8", metricsList: WEEKLY_METRICS, showLabel: false,
  });

  const block2 = `
    <rect x="${b2.x}" y="${b2.y}" width="${b2.w}" height="${b2.h}" rx="16" fill="#172033" stroke="#293548"/>
    <text x="${b2InnerX}" y="${b2TitleY}" fill="#f8fafc" font-size="22" font-weight="900">BBM загалом</text>
    ${legendTwoLine({ x: b2InnerX + b2InnerW, y: b2.y + 16, prevLabel: prevWeekWord || "попередній", curLabel: curWeekWord || "поточний", curColor: "#38bdf8" })}
    ${lessonsProgressCard({ x: b2InnerX, y: row1Y, w: progressW, h: row1H, conducted: oConducted, scheduled: oScheduled, pct: oSharePct })}
    ${bbmKpis}
    <rect x="${b2InnerX}" y="${b2Row2Y}" width="${b2InnerW}" height="${b2Row2H}" rx="10" fill="#1f2937" stroke="#374151"/>
    ${bbmChart}`;

  const height = b2.y + b2.h + 32;

  return `<svg width="1200" height="${height}" viewBox="0 0 1200 ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BBM weekly digest" font-family="${FONT}">
  <rect width="1200" height="${height}" fill="#111827"/>
  <text x="32" y="58" fill="#c4b5fd" font-size="32" font-weight="900">BBM · Тижневий дайджест</text>
  <text x="32" y="86" fill="#94a3b8" font-size="18">${dateSubtitle}</text>
  <text x="1168" y="66" text-anchor="end" fill="#e5e7eb" font-size="22" font-weight="800">${teacherName}</text>
  <g>${block1}</g>
  <g>${block2}</g>
</svg>`;
}

export async function renderWeeklyDigestPng(payload) {
  const svg = buildWeeklyDigestSvg(payload);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}
