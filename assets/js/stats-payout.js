function money(amount) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

function reduceMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

/** ponytail: the sum sits at the bar end, same money format as the tooltip, so it is readable without hovering. */
const payoutValueLabels = {
  id: "payoutValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0]?.data || [];
    ctx.save();
    ctx.fillStyle = "#3d2b18";
    ctx.font = "700 12px Manrope, sans-serif";
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      const value = Number(values[i]) || 0;
      ctx.textAlign = value >= 0 ? "left" : "right";
      ctx.fillText(money(value), value >= 0 ? bar.x + 8 : bar.x - 8, bar.y);
    });
    ctx.restore();
  },
};

let payoutChart = null;

export function mountPayoutChart(canvas, rows) {
  if (payoutChart) {
    payoutChart.destroy();
    payoutChart = null;
  }
  if (!canvas || !window.Chart) return;
  const labels = rows.map((row) => row.name);
  const values = rows.map((row) => row.payout);
  canvas.style.height = `${Math.max(160, rows.length * 54)}px`;
  payoutChart = new window.Chart(canvas, {
    type: "bar",
    plugins: [payoutValueLabels],
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map((v) => (v >= 0 ? "rgba(116,134,47,0.82)" : "rgba(192,79,79,0.82)")),
        borderColor: values.map((v) => (v >= 0 ? "rgba(116,134,47,1)" : "rgba(192,79,79,1)")),
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 84 } },
      animation: reduceMotion() ? false : { duration: 1000, easing: "easeOutCubic" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => `  ${money(ctx.raw)}` },
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
          grid: { color: "rgba(232,217,205,0.45)" },
          ticks: { color: "#8b7258", font: { size: 11 }, callback: (v) => money(v) },
          border: { dash: [3, 3] },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#3d2b18", font: { size: 12, weight: "600" } },
        },
      },
    },
  });
}
