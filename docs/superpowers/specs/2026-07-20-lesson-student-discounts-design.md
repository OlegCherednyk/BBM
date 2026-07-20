# Lesson student discounts — design

## Goal

Allow admins to set a per-student discount on a specific closed lesson, either as a **percent** or a fixed **UAH** amount. Discounts reduce lesson revenue in finance UI and in admin statistics.

## Data model

Table `public.lesson_student_discounts`:

| Column | Type | Notes |
|--------|------|--------|
| id | uuid PK | |
| lesson_id | uuid → lessons | cascade delete |
| student_id | uuid → students | cascade delete |
| discount_kind | `percent` \| `uah` | exactly one mode |
| discount_value | numeric | percent: (0, 100]; uah: > 0 |
| created_at / updated_at | timestamptz | |

Unique `(lesson_id, student_id)`. RLS deny-all for anon/authenticated (server uses service role), same pattern as `visits`.

## Pricing math

1. Compute base visit amount (same as today: abon unit from subscription/prices, or single price).
2. Apply discount:
   - `percent`: `max(0, base * (1 - value/100))`
   - `uah`: `max(0, base - value)`
3. Round to 2 decimals. Revenue / payout / digests use the **discounted** amount.

## API

- `GET /api/admin/lessons/:lessonId/discounts` — attended students + current discounts + base amounts
- `PUT /api/admin/lessons/:lessonId/discounts` — body `{ discounts: [{ student_id, discount_kind, discount_value } | { student_id, clear: true }] }`
- `GET /api/admin/lessons/:lessonId/finance` — student rows include `studentId`, `baseAmountUah`, `discountKind`, `discountValue`, `discountUah`, `amountUah`; summary includes `totalDiscountUah`

## UI

- Lesson card: compact `%` button (same size language as `$`) between finance and «Змінити».
- Discount modal: list of attended students; segmented `%` / `₴`; value input; clear; save.
- Finance modal: show base (struck) + discount chip + final amount; summary chip for total discounts.

## Stats

When attended visits exist, sum per-visit discounted amounts (both abon and single). Snapshot/count fallback unchanged when no visits (no student ids → no discounts).
