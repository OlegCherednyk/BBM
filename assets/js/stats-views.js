function ukWord(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function dayLabel(iso) {
  const [year, month, day] = String(iso || "").split("-");
  if (!year || !month || !day) return iso;
  return day + "." + month;
}

function totalCard(title, views, visitors) {
  const viewCount = Number(views) || 0;
  const people = Number(visitors) || 0;
  return `<article class="admin-stats-views-total"><p>${title}</p><strong>${viewCount}</strong><span>${ukWord(viewCount, "перегляд", "перегляди", "переглядів")} · ${people} ${ukWord(people, "відвідувач", "відвідувачі", "відвідувачів")}</span></article>`;
}

let viewsChart = null;

export function mountPageViews({ totals, canvas, summary }) {
  if (totals) {
    const home = summary?.home || { views: 0, visitors: 0 };
    const openDay = summary?.openDay || { views: 0, visitors: 0 };
    totals.innerHTML = totalCard("Головна", home.views, home.visitors) + totalCard("Open Day", openDay.views, openDay.visitors);
  }
  if (!canvas || !window.Chart) return;
  if (viewsChart) {
    viewsChart.destroy();
    viewsChart = null;
  }
  const days = summary?.days || [];
  const series = summary?.series || {};
  viewsChart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: days.map(dayLabel),
      datasets: [
        {
          label: "Головна",
          data: series.home || [],
          borderColor: "#74862f",
          backgroundColor: "rgba(116,134,47,0.16)",
          pointBackgroundColor: "#74862f",
          borderWidth: 2,
          tension: 0.25,
          fill: true,
        },
        {
          label: "Open Day",
          data: series["open-day"] || [],
          borderColor: "#5c4a32",
          backgroundColor: "rgba(92,74,50,0.08)",
          pointBackgroundColor: "#5c4a32",
          borderWidth: 2,
          tension: 0.25,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#5c4a32", boxWidth: 12, boxHeight: 12, usePointStyle: true },
        },
        tooltip: {
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
