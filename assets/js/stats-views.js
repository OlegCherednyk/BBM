const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PEOPLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

function dayLabel(iso) {
  const [year, month, day] = String(iso || "").split("-");
  if (!year || !month || !day) return iso;
  return day + "." + month;
}

function totalCard(color, icon, label, value, hint) {
  return `<article class="admin-stats-kpi-card admin-stats-kpi-card--${color}"><div class="admin-stats-kpi-card__icon">${icon}</div><div class="admin-stats-kpi-card__body"><div class="admin-stats-kpi-card__label">${label}</div><div class="admin-stats-kpi-card__value">${Number(value) || 0}</div><p class="admin-stats-views-hint">${hint}</p></div></article>`;
}

let viewsChart = null;

export function mountPageViews({ totals, canvas, legend, summary }) {
  const home = summary?.home || { views: 0, visitors: 0 };
  if (totals) {
    totals.innerHTML =
      totalCard("olive", EYE, "Перегляди", home.views, "скільки разів відкрили головну") +
      totalCard("blue", PEOPLE, "Користувачі", home.visitors, "скільки різних людей зайшло");
  }
  const days = summary?.days || [];
  const views = summary?.series?.home || [];
  const users = summary?.series?.homeVisitors || days.map(() => 0);
  const segments = [
    { label: "Перегляди", color: "#8ea34a", border: "#74862f" },
    { label: "Користувачі", color: "#5aa8b8", border: "#2e7d8c" },
  ];
  if (legend) {
    legend.innerHTML = segments
      .map(
        (item) =>
          `<div class="admin-stats-donut-legend__item"><span class="admin-stats-donut-legend__dot" style="background:${item.color};border:1.5px solid ${item.border}"></span><span>${item.label}</span></div>`,
      )
      .join("");
  }
  if (!canvas || !window.Chart) return;
  if (viewsChart) {
    viewsChart.destroy();
    viewsChart = null;
  }
  viewsChart = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: days.map(dayLabel),
      datasets: [
        {
          label: "Перегляди",
          data: views,
          backgroundColor: segments[0].color,
          borderColor: segments[0].border,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: "Користувачі",
          data: users,
          backgroundColor: segments[1].color,
          borderColor: segments[1].border,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
