-- Тестові голосування з адмінки: окремий прапор + унікальність (lesson_time, occurrence_at) лише для НЕ-тестів.
alter table public.lesson_vote_occurrences
add column if not exists is_test boolean not null default false;

comment on column public.lesson_vote_occurrences.is_test is 'Тест із адмінки; не брати до авто-закриття cron та не писати в lessons';

alter table public.lesson_vote_occurrences
drop constraint if exists lesson_vote_occurrences_lesson_occurrence_unique;

drop index if exists public.lesson_vote_occurrences_lesson_occurrence_scheduled_unique;
create unique index lesson_vote_occurrences_lesson_occurrence_scheduled_unique
on public.lesson_vote_occurrences (lesson_time_id, occurrence_at)
where not is_test;
