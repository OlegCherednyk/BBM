-- Підтвердження заняття з 2 учнями: до відповіді викладача урок і візити не створюються.
alter table public.lesson_vote_occurrences
  add column if not exists two_student_review_status text
    check (two_student_review_status in ('pending', 'confirmed', 'cancelled'));

alter table public.lesson_vote_occurrences
  add column if not exists two_student_review_message jsonb;

comment on column public.lesson_vote_occurrences.two_student_review_status is
  'pending — очікуємо відповідь викладача (2 учні); confirmed — урок проводиться; cancelled — урок скасовано';
comment on column public.lesson_vote_occurrences.two_student_review_message is
  'Приватне повідомлення викладачу: { chat_id, message_id, review_id } для hydrate після рестарту';

create index if not exists lesson_vote_occurrences_two_student_review_pending_idx
  on public.lesson_vote_occurrences (two_student_review_status)
  where two_student_review_status = 'pending';
