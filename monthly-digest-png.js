import { DateTime } from "luxon";
import { Resvg } from "@resvg/resvg-js";
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

const FONT = "Inter, Arial, sans-serif";

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

/** KPI card: label / %change / value / "було {prev}". null cur/prev → "—", pct treated as 0/0. */
function kpiBox({ x, y, w, h, label, cur, prev, money = false, raw = false }) {
  const pct = percentChange(cur ?? 0, prev ?? 0);
  const fmt = (v) => (v == null ? "—" : raw ? String(v) : formatCompactNumber(v, { money }));
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937" stroke="#374151"/>
    <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" fill="#9ca3af" font-size="11" font-weight="700">${escapeXml(label)}</text>
    <text x="${x + w / 2}" y="${y + 52}" text-anchor="middle" fill="${trendColor(pct)}" font-size="24" font-weight="900">${escapeXml(formatPercentLabel(pct))}</text>
    <text x="${x + w / 2}" y="${y + 76}" text-anchor="middle" fill="#e5e7eb" font-size="15" font-weight="700">${escapeXml(fmt(cur))}</text>
    <text x="${x + w / 2}" y="${y + 94}" text-anchor="middle" fill="#64748b" font-size="11">було ${escapeXml(fmt(prev))}</text>`;
}

function legendTwoLine({ x, y, prevLabel, curLabel, curColor }) {
  return `
    <text x="${x}" y="${y}" text-anchor="end" fill="#64748b" font-size="13" font-family="${FONT}">■ ${escapeXml(prevLabel)}</text>
    <text x="${x}" y="${y + 22}" text-anchor="end" fill="${curColor}" font-size="13" font-family="${FONT}">■ ${escapeXml(curLabel)}</text>`;
}

/** Grouped bar-chart comparing the 5 tracked metrics, prev (grey) vs current (curColor). */
function categoryBarsChart({ x, y, w, h, current, previous, curColor, metricsList, showLabel = true }) {
  const labelH = showLabel ? 22 : 0;
  const catLabelH = 16;
  const barsH = Math.max(10, h - labelH - catLabelH);
  const baseline = y + labelH + barsH;
  const slotW = w / metricsList.length;
  const barW = Math.max(8, Math.min(24, slotW * 0.28));
  const bars = metricsList.map(([label, key], i) => {
    const heights = barHeights(metric(previous, key), metric(current, key), barsH);
    const cx = x + i * slotW + slotW / 2;
    return `
      <rect x="${cx - barW - 3}" y="${baseline - heights.prev}" width="${barW}" height="${heights.prev}" rx="3" fill="#64748b"/>
      <rect x="${cx + 3}" y="${baseline - heights.cur}" width="${barW}" height="${heights.cur}" rx="3" fill="${curColor}"/>
      <text x="${cx}" y="${baseline + 14}" text-anchor="middle" fill="#94a3b8" font-size="11">${escapeXml(label)}</text>`;
  }).join("");
  const label = showLabel
    ? `<text x="${x}" y="${y + 14}" fill="#9ca3af" font-size="11" font-weight="700">ПОРІВНЯННЯ З ПОПЕРЕДНІМ МІСЯЦЕМ</text>`
    : "";
  return `${label}${bars}`;
}

/** "Уроки проведено: X з Y  Z%" + progress bar. */
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

/** Direction/bank card: title + visits/revenue/avg rows. */
function breakdownCard({ x, y, w, h, title, accentColor, visits, revenue, avg }) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#1f2937"/>
    <rect x="${x}" y="${y}" width="4" height="${h}" fill="${accentColor}"/>
    <text x="${x + 14}" y="${y + 20}" fill="#e5e7eb" font-size="13" font-weight="800">${escapeXml(truncateText(title, 14))}</text>
    <text x="${x + 14}" y="${y + 40}" fill="#9ca3af" font-size="11">візити</text>
    <text x="${x + w - 12}" y="${y + 40}" text-anchor="end" fill="#e5e7eb" font-size="12" font-weight="700">${escapeXml(String(visits))}</text>
    <text x="${x + 14}" y="${y + 58}" fill="#9ca3af" font-size="11">виручка</text>
    <text x="${x + w - 12}" y="${y + 58}" text-anchor="end" fill="#e5e7eb" font-size="12" font-weight="700">${escapeXml(formatCompactNumber(revenue, { money: true }))}</text>
    <text x="${x + 14}" y="${y + 76}" fill="#9ca3af" font-size="11">сер.</text>
    <text x="${x + w - 12}" y="${y + 76}" text-anchor="end" fill="#e5e7eb" font-size="12" font-weight="700">${escapeXml(avg == null ? "—" : String(avg))}</text>`;
}

/** Panel: title + lessonsCount share bar + legend + per-item breakdown cards. */
function breakdownPanel({ x, y, w, h, title, items, colorFor, nameOf }) {
  const pad = 16;
  const innerX = x + pad;
  const innerW = w - pad * 2;
  const total = items.reduce((sum, it) => sum + metric(it, "lessonsCount"), 0);
  const barY = y + pad + 26;
  let cursor = innerX;
  const segments = items.map((it, i) => {
    const val = metric(it, "lessonsCount");
    const segW = total > 0 ? Math.round((innerW * val) / total) : 0;
    const rect = `<rect x="${cursor}" y="${barY}" width="${segW}" height="14" fill="${colorFor(it, i)}"/>`;
    cursor += segW;
    return rect;
  }).join("");
  const legendY = barY + 32;
  const legendW = innerW / Math.max(items.length, 1);
  const legend = items.map((it, i) => {
    const val = metric(it, "lessonsCount");
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `<text x="${innerX + i * legendW}" y="${legendY}" font-size="12"><tspan fill="${colorFor(it, i)}">■</tspan><tspan fill="#94a3b8"> ${escapeXml(nameOf(it))} ${pct}% · ${val}</tspan></text>`;
  }).join("");
  const cardsY = legendY + 16;
  const cardsH = y + h - pad - cardsY;
  const cardGap = 10;
  const count = Math.max(items.length, 1);
  const cardW = (innerW - cardGap * (count - 1)) / count;
  const cards = items.map((it, i) => breakdownCard({
    x: innerX + i * (cardW + cardGap),
    y: cardsY,
    w: cardW,
    h: cardsH,
    title: nameOf(it),
    accentColor: colorFor(it, i),
    visits: metric(it, "totalPeopleCount"),
    revenue: metric(it, "revenue"),
    avg: avgPerLesson(metric(it, "totalPeopleCount"), metric(it, "lessonsCount")),
  })).join("");
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#172033" stroke="#293548"/>
    <text x="${innerX}" y="${y + pad + 14}" fill="#f8fafc" font-size="16" font-weight="900">${escapeXml(title)}</text>
    ${segments}
    ${legend}
    ${cards}`;
}

/** Single visit-kind card (single/abon): count, share%, abs delta vs previous. */
function visitKindCard({ x, y, w, h, label, color, count, total, prevCount }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const delta = count - prevCount;
  const deltaLabel = delta === 0 ? "0" : delta > 0 ? `+${delta}` : `${delta}`;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#1f2937"/>
    <rect x="${x}" y="${y}" width="${w}" height="4" fill="${color}"/>
    <text x="${x + 16}" y="${y + 26}" fill="${color}" font-size="12" font-weight="800">${escapeXml(label)}</text>
    <text x="${x + 16}" y="${y + 54}" fill="#f8fafc" font-size="26" font-weight="900">${escapeXml(String(count))}<tspan fill="#94a3b8" font-size="13" font-weight="600"> візитів</tspan></text>
    <text x="${x + 16}" y="${y + 72}" fill="#cbd5e1" font-size="13">${pct}% · <tspan fill="${trendColor(delta)}">${escapeXml(deltaLabel)}</tspan></text>`;
}

function stackedBar({ x, y, w, h, singlePct, colors }) {
  const singleW = Math.round((w * singlePct) / 100);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${colors[1]}"/>
    <rect x="${x}" y="${y}" width="${singleW}" height="${h}" rx="${h / 2}" fill="${colors[0]}"/>`;
}

const PERSONAL_METRICS = [
  ["уроки", "lessonsCount", false],
  ["учні", "uniquePeopleCount", false],
  ["візити", "totalPeopleCount", false],
  ["виручка", "revenue", true],
  ["виплата", "payout", true],
];

function bankColor(key) {
  return key === "left" ? "#34d399" : "#38bdf8";
}

const DIRECTION_COLORS = ["#a78bfa", "#f472b6", "#38bdf8", "#34d399"];

export function buildMonthlyDigestSvg(payload) {
  const teacherMonth = payload?.teacherMonth ?? {};
  const tCur = teacherMonth.current ?? {};
  const tPrev = teacherMonth.previous ?? {};
  const overall = payload?.overall ?? {};
  const oCur = overall.current ?? {};
  const oPrev = overall.previous ?? {};
  const oCurSummary = oCur.summary ?? {};
  const oPrevSummary = oPrev.summary ?? {};
  const byDirection = oCur.byDirection ?? [];
  const byBank = oCur.byBank ?? [];
  const visitKindsCur = oCur.visitKinds ?? {};
  const visitKindsPrev = oPrev.visitKinds ?? {};

  const teacherName = escapeXml(truncateText(payload?.teacherName ?? "", 20));
  const dateSubtitleRaw = String(payload?.dateSubtitle ?? "");
  const dateSubtitle = escapeXml(dateSubtitleRaw);
  const [curMonthWord, prevMonthWord] = dateSubtitleRaw.split(" vs ");

  const tCurAvg = avgPerLesson(metric(tCur, "totalPeopleCount"), metric(tCur, "lessonsCount"));
  const tPrevAvg = avgPerLesson(metric(tPrev, "totalPeopleCount"), metric(tPrev, "lessonsCount"));
  const tCurRpl = revenuePerLesson(metric(tCur, "revenue"), metric(tCur, "lessonsCount"));
  const tPrevRpl = revenuePerLesson(metric(tPrev, "revenue"), metric(tPrev, "lessonsCount"));

  const oConducted = metric(oCurSummary, "lessonsCount");
  const oScheduled = oCurSummary.scheduledLessons ?? null;
  const oSharePct = conductedShare(oConducted, oScheduled);
  const oCurAvg = avgPerLesson(metric(oCurSummary, "totalPeopleCount"), metric(oCurSummary, "lessonsCount"));
  const oPrevAvg = avgPerLesson(metric(oPrevSummary, "totalPeopleCount"), metric(oPrevSummary, "lessonsCount"));
  const oCurRpl = revenuePerLesson(metric(oCurSummary, "revenue"), metric(oCurSummary, "lessonsCount"));
  const oPrevRpl = revenuePerLesson(metric(oPrevSummary, "revenue"), metric(oPrevSummary, "lessonsCount"));

  const singleCur = metric(visitKindsCur, "single");
  const abonCur = metric(visitKindsCur, "abon");
  const singlePrev = metric(visitKindsPrev, "single");
  const abonPrev = metric(visitKindsPrev, "abon");
  const totalVisits = singleCur + abonCur;
  const singlePct = totalVisits > 0 ? Math.round((singleCur / totalVisits) * 100) : 0;
  const abonPct = 100 - singlePct;

  // ===== Block 1: Особисте · місяць (largest, full width) =====
  const b1 = { x: 32, y: 90, w: 1136, h: 482 };
  const b1InnerX = b1.x + 20;
  const b1InnerW = b1.w - 40;
  const kpiRow1Y = b1.y + 20 + 26;
  const kpiRow1H = 140;
  const kpiColW = (b1InnerW - 4 * 16) / 5;
  const personalKpis = PERSONAL_METRICS.map(([label, key, money], i) => kpiBox({
    x: b1InnerX + i * (kpiColW + 16),
    y: kpiRow1Y,
    w: kpiColW,
    h: kpiRow1H,
    label: label.toUpperCase(),
    cur: metric(tCur, key),
    prev: metric(tPrev, key),
    money,
  })).join("");

  const row2Y = kpiRow1Y + kpiRow1H + 16;
  const row2H = b1.y + b1.h - 20 - row2Y;
  const derivedKpis = [
    kpiBox({ x: b1InnerX, y: row2Y, w: kpiColW, h: row2H, label: "СЕР. НА УРОК", cur: tCurAvg, prev: tPrevAvg, raw: true }),
    kpiBox({ x: b1InnerX + kpiColW + 16, y: row2Y, w: kpiColW, h: row2H, label: "₴ / УРОК", cur: tCurRpl, prev: tPrevRpl, money: true }),
  ].join("");
  const chartX = b1InnerX + (kpiColW + 16) * 2;
  const chartW = b1InnerX + b1InnerW - chartX;
  const personalChart = categoryBarsChart({
    x: chartX, y: row2Y, w: chartW, h: row2H,
    current: tCur, previous: tPrev, curColor: "#a78bfa", metricsList: PERSONAL_METRICS,
  });

  const block1 = `
    <rect x="${b1.x}" y="${b1.y}" width="${b1.w}" height="${b1.h}" rx="18" fill="#172033" stroke="#293548"/>
    <text x="${b1InnerX}" y="${b1.y + 20 + 22}" fill="#f8fafc" font-size="26" font-weight="900">Особисте · місяць</text>
    ${legendTwoLine({ x: b1InnerX + b1InnerW, y: b1.y + 18, prevLabel: prevMonthWord || "попередній", curLabel: curMonthWord || "поточний", curColor: "#a78bfa" })}
    ${personalKpis}
    ${derivedKpis}
    <rect x="${chartX}" y="${row2Y}" width="${chartW}" height="${row2H}" rx="10" fill="#1f2937" stroke="#374151"/>
    ${personalChart}`;

  // ===== Block 2: BBM загалом =====
  const b2 = { x: 32, y: b1.y + b1.h + 16, w: 1136, h: 270 };
  const b2InnerX = b2.x + 20;
  const b2InnerW = b2.w - 40;
  const b2TitleY = b2.y + 20 + 22;
  const row1Y = b2TitleY + 18;
  const row1H = 100;
  const progressW = 380;
  const kpiGap = 16;
  const kpiW = (b2InnerW - progressW - kpiGap * 3) / 3;
  const bbmKpis = [
    ["ВИРУЧКА", metric(oCurSummary, "revenue"), metric(oPrevSummary, "revenue"), true, false],
    ["СЕР. / УРОК", oCurAvg, oPrevAvg, false, true],
    ["₴ / УРОК", oCurRpl, oPrevRpl, true, false],
  ].map(([label, cur, prev, money, raw], i) => kpiBox({
    x: b2InnerX + progressW + kpiGap + i * (kpiW + kpiGap),
    y: row1Y, w: kpiW, h: row1H, label, cur, prev, money, raw,
  })).join("");

  const b2Row2Y = row1Y + row1H + 12;
  const b2Row2H = b2.y + b2.h - 20 - b2Row2Y;
  const bbmChart = categoryBarsChart({
    x: b2InnerX, y: b2Row2Y, w: b2InnerW, h: b2Row2H,
    current: oCurSummary, previous: oPrevSummary, curColor: "#38bdf8", metricsList: PERSONAL_METRICS, showLabel: false,
  });

  const block2 = `
    <rect x="${b2.x}" y="${b2.y}" width="${b2.w}" height="${b2.h}" rx="16" fill="#172033" stroke="#293548"/>
    <text x="${b2InnerX}" y="${b2TitleY}" fill="#f8fafc" font-size="22" font-weight="900">BBM загалом</text>
    ${legendTwoLine({ x: b2InnerX + b2InnerW, y: b2.y + 16, prevLabel: prevMonthWord || "попередній", curLabel: curMonthWord || "поточний", curColor: "#38bdf8" })}
    ${lessonsProgressCard({ x: b2InnerX, y: row1Y, w: progressW, h: row1H, conducted: oConducted, scheduled: oScheduled, pct: oSharePct })}
    ${bbmKpis}
    <rect x="${b2InnerX}" y="${b2Row2Y}" width="${b2InnerW}" height="${b2Row2H}" rx="10" fill="#1f2937" stroke="#374151"/>
    ${bbmChart}`;

  // ===== Block 3: За напрямами | За берегами =====
  const b3 = { x: 32, y: b2.y + b2.h + 16, w: 1136, h: 200 };
  const panelGap = 16;
  const panelW = (b3.w - panelGap) / 2;
  const directionsPanel = breakdownPanel({
    x: b3.x, y: b3.y, w: panelW, h: b3.h,
    title: "За напрямами · BBM",
    items: byDirection,
    colorFor: (_it, i) => DIRECTION_COLORS[i % DIRECTION_COLORS.length],
    nameOf: (it) => it.name,
  });
  const banksPanel = breakdownPanel({
    x: b3.x + panelW + panelGap, y: b3.y, w: panelW, h: b3.h,
    title: "За берегами · BBM",
    items: byBank,
    colorFor: (it) => bankColor(it.key),
    nameOf: (it) => it.label,
  });
  const block3 = `${directionsPanel}${banksPanel}`;

  // ===== Block 4: Разові vs абонемент =====
  const b4 = { x: 32, y: b3.y + b3.h + 16, w: 1136, h: 170 };
  const b4InnerX = b4.x + 20;
  const b4InnerW = b4.w - 40;
  const b4TitleY = b4.y + 20 + 22;
  const cardsY = b4TitleY + 14;
  const cardsH = 70;
  const midW = 80;
  const cardW = (b4InnerW - midW - 32) / 2;
  const singleX = b4InnerX;
  const midX = singleX + cardW + 16;
  const abonX = midX + midW + 16;
  const barY = cardsY + cardsH + 12;

  const block4 = `
    <rect x="${b4.x}" y="${b4.y}" width="${b4.w}" height="${b4.h}" rx="16" fill="#172033" stroke="#293548"/>
    <text x="${b4InnerX}" y="${b4TitleY}" fill="#f8fafc" font-size="22" font-weight="900">Разові vs абонемент · BBM</text>
    <text x="${b4InnerX + b4InnerW}" y="${b4.y + 20 + 14}" text-anchor="end" fill="#64748b" font-size="13">візити · vs ${escapeXml(prevMonthWord || "попередній")}</text>
    ${visitKindCard({ x: singleX, y: cardsY, w: cardW, h: cardsH, label: "РАЗОВІ", color: "#fbbf24", count: singleCur, total: totalVisits, prevCount: singlePrev })}
    <text x="${midX + midW / 2}" y="${cardsY + cardsH / 2 - 4}" text-anchor="middle" fill="#64748b" font-size="12" font-weight="700">з</text>
    <text x="${midX + midW / 2}" y="${cardsY + cardsH / 2 + 12}" text-anchor="middle" fill="#64748b" font-size="12" font-weight="700">${escapeXml(String(totalVisits))}</text>
    ${visitKindCard({ x: abonX, y: cardsY, w: cardW, h: cardsH, label: "АБОНЕМЕНТ", color: "#818cf8", count: abonCur, total: totalVisits, prevCount: abonPrev })}
    ${stackedBar({ x: b4InnerX, y: barY, w: b4InnerW, h: 10, singlePct, colors: ["#fbbf24", "#818cf8"] })}`;

  return `<svg width="1200" height="1280" viewBox="0 0 1200 1280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BBM monthly digest" font-family="${FONT}">
  <rect width="1200" height="1280" fill="#111827"/>
  <text x="32" y="58" fill="#c4b5fd" font-size="32" font-weight="900">BBM · Місячний дайджест</text>
  <text x="32" y="86" fill="#94a3b8" font-size="18">${dateSubtitle}</text>
  <text x="1168" y="66" text-anchor="end" fill="#e5e7eb" font-size="22" font-weight="800">${teacherName}</text>
  <g>${block1}</g>
  <g>${block2}</g>
  <g>${block3}</g>
  <g>${block4}</g>
</svg>`;
}

export async function renderMonthlyDigestPng(payload) {
  const svg = buildMonthlyDigestSvg(payload);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}
