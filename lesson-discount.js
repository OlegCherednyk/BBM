/**
 * Lesson visit discount helpers (pure).
 * ponytail: one student may have either % or fixed ₴ off base price for one lesson.
 */

/**
 * @typedef {{ discount_kind?: string | null, discount_value?: number | string | null, kind?: string | null, value?: number | string | null }} DiscountInput
 */

/**
 * @param {unknown} raw
 * @returns {{ kind: "percent" | "uah", value: number } | null}
 */
export function normalizeDiscount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kindRaw = String(raw.discount_kind ?? raw.kind ?? "")
    .trim()
    .toLowerCase();
  const value = Number(raw.discount_value ?? raw.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (kindRaw === "percent" || kindRaw === "%") {
    if (value > 100) return null;
    return { kind: "percent", value: Math.round(value * 100) / 100 };
  }
  if (kindRaw === "uah" || kindRaw === "грн" || kindRaw === "uah_fixed") {
    return { kind: "uah", value: Math.round(value * 100) / 100 };
  }
  return null;
}

/**
 * @param {number} baseAmountUah
 * @param {DiscountInput | null | undefined} discount
 * @returns {{
 *   baseAmountUah: number,
 *   amountUah: number,
 *   discountUah: number,
 *   discountKind: "percent" | "uah" | null,
 *   discountValue: number | null,
 * }}
 */
export function applyVisitDiscount(baseAmountUah, discount) {
  const base = Math.max(0, Math.round((Number(baseAmountUah) || 0) * 100) / 100);
  const norm = normalizeDiscount(discount);
  if (!norm) {
    return {
      baseAmountUah: base,
      amountUah: base,
      discountUah: 0,
      discountKind: null,
      discountValue: null,
    };
  }

  let amount =
    norm.kind === "percent" ? base * (1 - norm.value / 100) : base - norm.value;
  amount = Math.max(0, Math.round(amount * 100) / 100);
  const discountUah = Math.round((base - amount) * 100) / 100;

  return {
    baseAmountUah: base,
    amountUah: amount,
    discountUah,
    discountKind: norm.kind,
    discountValue: norm.value,
  };
}

/**
 * @param {Map<string, DiscountInput> | Record<string, DiscountInput> | null | undefined} byStudentId
 * @param {string | null | undefined} studentId
 */
export function discountForStudent(byStudentId, studentId) {
  const sid = String(studentId || "").trim();
  if (!sid || !byStudentId) return null;
  if (byStudentId instanceof Map) return byStudentId.get(sid) || null;
  return byStudentId[sid] || null;
}
