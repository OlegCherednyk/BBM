const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PEOPLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

function dayLabel(iso) {
  const [year, month, day] = String(iso || "").split("-");
  if (!year || !month || !day) return iso;
  return day + "." + month;
}

function totalCard(color, icon, label, value, hint, delayMs) {
  return `<article class="admin-stats-kpi-card admin-stats-kpi-card--${color} admin-stats-rise" style="animation-delay:${delayMs}ms"><div class="admin-stats-kpi-card__icon">${icon}</div><div class="admin-stats-kpi-card__body"><div class="admin-stats-kpi-card__label">${label}</div><div class="admin-stats-kpi-card__value">${Number(value) || 0}</div><p class="admin-stats-views-hint">${hint}</p></div></article>`;
}

function releaseRise(root) {
  root?.querySelectorAll(".admin-stats-rise").forEach((el) => {
    el.addEventListener("animationend", () => el.classList.remove("admin-stats-rise"), { once: true });
  });
}

function reduceMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

/** ponytail: line draw is the Chart.js progressive-line sample (delay = index × duration / points). */
function progressiveLine(pointCount) {
  if (pointCount < 2 || reduceMotion()) return false;
  const totalDuration = 1200;
  const delayBetweenPoints = totalDuration / pointCount;
  const previousY = (ctx) =>
    ctx.index === 0
      ? ctx.chart.scales.y.getPixelForValue(0)
      : ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1].getProps(["y"], true).y;
  const delay = (flag) => (ctx) => {
    if (ctx.type !== "data" || ctx[flag]) return 0;
    ctx[flag] = true;
    return ctx.index * delayBetweenPoints;
  };
  return {
    x: { type: "number", easing: "linear", duration: delayBetweenPoints, from: NaN, delay: delay("xStarted") },
    y: { type: "number", easing: "linear", duration: delayBetweenPoints, from: previousY, delay: delay("yStarted") },
  };
}

let viewsChart = null;

export function mountPageViews({ totals, canvas, legend, summary }) {
  const home = summary?.home || { views: 0, visitors: 0 };
  if (totals) {
    totals.innerHTML =
      totalCard("olive", EYE, "Перегляди", home.views, "скільки разів відкрили головну", 0) +
      totalCard("blue", PEOPLE, "Користувачі", home.visitors, "скільки різних людей зайшло", 80);
    releaseRise(totals);
  }
  const days = summary?.days || [];
  const views = summary?.series?.home || [];
  const users = summary?.series?.homeVisitors || days.map(() => 0);
  const previous = Array.isArray(summary?.previous?.home) ? summary.previous.home : null;
  const segments = [
    { label: "Перегляди", color: "#74862f", border: "#74862f" },
    { label: "Користувачі", color: "#5aa8b8", border: "#2e7d8c" },
  ];
  if (previous) segments.push({ label: "Минулий період", dash: true, color: "transparent", border: "#a38057" });
  if (legend) {
    legend.innerHTML = segments
      .map((item) => {
        const dash = item.dash ? " admin-stats-donut-legend__dot--dash" : "";
        const style = item.dash ? "" : ` style="background:${item.color};border:1.5px solid ${item.border}"`;
        return `<div class="admin-stats-donut-legend__item"><span class="admin-stats-donut-legend__dot${dash}"${style}></span><span>${item.label}</span></div>`;
      })
      .join("");
  }
  if (!canvas || !window.Chart) return;
  if (viewsChart) {
    viewsChart.destroy();
    viewsChart = null;
  }
  const datasets = [
    {
      label: "Перегляди",
      data: views,
      borderColor: "#74862f",
      backgroundColor: "transparent",
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Користувачі",
      data: users,
      borderColor: "#2e7d8c",
      backgroundColor: "transparent",
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
  ];
  if (previous) {
    datasets.push({
      label: "Минулий період",
      data: days.map((_, i) => Number(previous[i]) || 0),
      borderColor: "#a38057",
      backgroundColor: "transparent",
      borderDash: [5, 4],
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    });
  }
  viewsChart = new window.Chart(canvas, {
    type: "line",
    data: { labels: days.map(dayLabel), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: progressiveLine(days.length),
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `  ${ctx.dataset.label}: ${ctx.raw}` },
          backgroundColor: "rgba(251,246,240,0.97)",
          titleColor: "#2d1f0e",
          bodyColor: "#5a3e22",
          borderColor: "rgba(232,217,205,0.9)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8b7258", font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#8b7258", font: { size: 11 }, precision: 0 },
          grid: { color: "rgba(232,217,205,0.45)" },
          border: { dash: [3, 3] },
        },
      },
    },
  });
}
