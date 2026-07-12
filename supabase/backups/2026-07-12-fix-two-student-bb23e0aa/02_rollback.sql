-- ROLLBACK: undo 01_apply.sql for occurrence bb23e0aa-0008-4ddb-9d7f-c2a268b3382d
-- Restores occurrence + subscription to BEFORE snapshots; deletes created lesson/visits.

begin;

delete from public.visits
where lesson_vote_occurrence_id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d';

delete from public.lessons
where lesson_vote_occurrence_id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'
   or (lesson_time_id = 'd351cda3-e40e-4e86-b1eb-303f7e5ab342'
       and starts_at = '2026-07-08 17:00:00+00');

-- restore occurrence (from 00_before_occurrence.sql)
update public.lesson_vote_occurrences
set
  conducting_display_name = null,
  conducting_telegram_chat_id = null,
  two_student_review_status = 'pending',
  two_student_review_message = null
where id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d';

-- restore subscription override/state (from 00_before_subscription.sql)
update public.subscriptions
set
  status = 'active',
  updated_at = '2026-07-08T18:23:32.361+00:00',
  used_visits_override = 3
where id = '8c19743d-28e9-4e6e-a60e-ceea0f2684f1';

commit;
