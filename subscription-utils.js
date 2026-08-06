/**
 * Скільки візитів уже використано по абонементу.
 * Без override — лише журнал. З override — вже використані до журналу + attended у журналі.
 * @param {number} fromVisits
 * @param {unknown} ovRaw
 * @param {number | null | undefined} totalVisits
 */
export function computeSubscriptionUsedVisits(fromVisits, ovRaw, totalVisits) {
  const journal = Math.max(0, Math.floor(Number(fromVisits) || 0));
  if (ovRaw == null || ovRaw === "" || !Number.isFinite(Number(ovRaw))) return journal;
  const opening = Math.max(0, Math.floor(Number(ovRaw)));
  const used = opening + journal;
  if (totalVisits != null && Number.isFinite(Number(totalVisits))) {
    return Math.min(Math.max(0, Math.floor(Number(totalVisits))), used);
  }
  return used;
}

/**
 * Тіло PATCH абонемента для адмінки.
 * status додаємо лише якщо адмін явно змінив його — інакше сервер
 * перерахує статус після rollback візитів (видалення заняття).
 * used_visits_override рахуємо від свіжого attendedNow з журналу.
 *
 * @param {{
 *   total_visits: number | null,
 *   valid_until?: string | null,
 *   amount_uah?: number | null,
 *   purchased_at?: string | null,
 *   status: string,
 *   initialStatus: string,
 *   attendedNow: number,
 *   usedVisitsInput: number,
 *   admin_note?: string | null,
 *   lesson_type_id?: string | null,
 * }} args
 */
export function buildSubscriptionPatchBody(args) {
  const attendedNow = Math.max(0, Math.floor(Number(args.attendedNow) || 0));
  const usedVisitsInput = Math.max(0, Math.floor(Number(args.usedVisitsInput) || 0));
  const used_visits_override =
    usedVisitsInput === attendedNow ? null : Math.max(0, usedVisitsInput - attendedNow);

  /** @type {Record<string, unknown>} */
  const body = {
    total_visits: args.total_visits,
    used_visits_override,
  };
  if (Object.prototype.hasOwnProperty.call(args, "valid_until")) {
    body.valid_until = args.valid_until ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(args, "amount_uah")) {
    body.amount_uah = args.amount_uah ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(args, "purchased_at")) {
    body.purchased_at = args.purchased_at ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(args, "admin_note")) {
    body.admin_note = args.admin_note ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(args, "lesson_type_id")) {
    body.lesson_type_id = args.lesson_type_id ?? null;
  }

  const status = String(args.status || "").trim();
  const initialStatus = String(args.initialStatus || "").trim();
  if (status && status !== initialStatus) {
    body.status = status;
  }
  return body;
}
