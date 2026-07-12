# Backup: two-student lesson fix (bb23e0aa)

**When:** 2026-07-12  
**Why:** Occurrence with 2 students stayed `pending` because no teacher pressed «Я провожу»; lesson + visits were never created.

**Occurrence:** `bb23e0aa-0008-4ddb-9d7f-c2a268b3382d`  
**Slot:** 2026-07-08 17:00 UTC / Ср 20:00 Київ · Лівий берег · Мішуги · Тренаж

## Files

| File | Purpose |
|------|---------|
| `00_before_occurrence.sql` | Snapshot of `lesson_vote_occurrences` row before change |
| `00_before_subscription.sql` | Snapshot of Alina's subscription used for abon visit |
| `00_before_lessons_visits.sql` | Confirms no lesson/visits existed for this occurrence |
| `01_apply.sql` | Forward fix (lesson + visits + confirm review) |
| `02_rollback.sql` | Undo apply |

## Notes

- Before apply: no `lessons` / `visits` rows for this occurrence.
- Teacher set to Віка (`conducting_display_name = Вікторія`) based on prior lessons on the same slot.
