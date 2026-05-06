-- Підсумки Telegram-голосування по конкретному проведенню слота (lesson_time_id + час початку).
-- Очікує наявність public.lessons та public.lesson_vote_occurrences.

alter table public.lessons add column if not exists starts_at timestamptz;
alter table public.lessons add column if not exists skip_visitors_count integer not null default 0;
alter table public.lessons add column if not exists conducting_display_name text;
alter table public.lessons add column if not exists vote_finalized_at timestamptz;
alter table public.lessons add column if not exists vote_snapshot jsonb;
alter table public.lessons add column if not exists lesson_vote_occurrence_id uuid;

alter table public.lessons drop constraint if exists lessons_skip_visitors_count_check;
alter table public.lessons
add constraint lessons_skip_visitors_count_check
check (skip_visitors_count >= 0);

alter table public.lessons drop constraint if exists lessons_lesson_vote_occurrence_id_fkey;

alter table public.lessons
add constraint lessons_lesson_vote_occurrence_id_fkey
foreign key (lesson_vote_occurrence_id)
references public.lesson_vote_occurrences(id)
on delete set null;

drop index if exists public.lessons_lesson_time_starts_unique;
create unique index lessons_lesson_time_starts_unique
on public.lessons (lesson_time_id, starts_at)
where lesson_time_id is not null and starts_at is not null;

comment on column public.lessons.starts_at is 'Фактичний час початку цього проведення (Kyiv/UTC), збігається з occurrence_at голосування';
comment on column public.lessons.skip_visitors_count is 'Пропускаю (за підсумком Telegram-голосування)';
comment on column public.lessons.conducting_display_name is 'Хто проводить — з голосування викладачів';
comment on column public.lessons.vote_finalized_at is 'Коли закрито голосування (≈за 24 год до заняття)';
comment on column public.lessons.vote_snapshot is 'Знімок голосів { abon, single, skip } → { telegram_user_id: ім''я }';
comment on column public.lessons.lesson_vote_occurrence_id is 'Посилання на сесію голосування lesson_vote_occurrences';
