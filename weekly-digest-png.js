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
