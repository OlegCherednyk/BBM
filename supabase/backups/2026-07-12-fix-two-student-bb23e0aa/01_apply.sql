-- APPLY: create missing lesson + visits for two-student pending occurrence
-- occurrence_id = bb23e0aa-0008-4ddb-9d7f-c2a268b3382d
-- date: 2026-07-12

begin;

update public.lesson_vote_occurrences
set
  two_student_review_status = 'confirmed',
  conducting_display_name = 'Вікторія',
  conducting_telegram_chat_id = '488737203'
where id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'
  and two_student_review_status = 'pending'
  and not exists (
    select 1 from public.lessons l
    where l.lesson_vote_occurrence_id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'
       or (l.lesson_time_id = 'd351cda3-e40e-4e86-b1eb-303f7e5ab342'
           and l.starts_at = '2026-07-08 17:00:00+00')
  );

insert into public.lessons (
  teacher_id,
  lesson_time_id,
  place_id,
  starts_at,
  abon_count,
  single_visitors_count,
  skip_visitors_count,
  conducting_display_name,
  vote_finalized_at,
  vote_snapshot,
  lesson_vote_occurrence_id
)
select
  'bc361895-e8df-412d-b9a1-3b36c896b8f3'::uuid,
  o.lesson_time_id,
  o.place_id,
  o.occurrence_at,
  1,
  1,
  4,
  'Вікторія',
  o.finalized_at,
  o.votes_snapshot,
  o.id
from public.lesson_vote_occurrences o
where o.id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'
  and not exists (
    select 1 from public.lessons l
    where l.lesson_vote_occurrence_id = o.id
       or (l.lesson_time_id = o.lesson_time_id and l.starts_at = o.occurrence_at)
  );

insert into public.visits (
  student_id,
  lesson_vote_occurrence_id,
  vote_choice,
  subscription_id,
  visit_status
)
select *
from (
  values
    (
      'f31f4354-4e6f-4fea-a5c6-7c5961be3388'::uuid,
      'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'::uuid,
      'abon',
      '8c19743d-28e9-4e6e-a60e-ceea0f2684f1'::uuid,
      'attended'
    ),
    (
      'ddae55ad-59e3-42aa-8634-304a183e8a3f'::uuid,
      'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d'::uuid,
      'single',
      null::uuid,
      'attended'
    )
) as v(student_id, lesson_vote_occurrence_id, vote_choice, subscription_id, visit_status)
where not exists (
  select 1 from public.visits x
  where x.student_id = v.student_id
    and x.lesson_vote_occurrence_id = v.lesson_vote_occurrence_id
);

commit;
