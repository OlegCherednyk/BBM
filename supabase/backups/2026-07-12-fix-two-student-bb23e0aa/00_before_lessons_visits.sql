-- BEFORE: lessons / visits for this occurrence were empty (2026-07-12)

-- lessons for occurrence / slot:
-- select * from public.lessons
-- where lesson_vote_occurrence_id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'
--    or (lesson_time_id = 'd351cda3-e40e-4e86-b1eb-303f7e5ab342'
--        and starts_at = '2026-07-08 17:00:00+00');
-- → 0 rows

-- visits for occurrence:
-- select * from public.visits
-- where lesson_vote_occurrence_id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d';
-- → 0 rows
