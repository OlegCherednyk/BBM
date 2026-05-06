-- Автоматичні голосування в Telegram по розкладу: відкриття ~за 5 днів до заняття, закриття ~за 24 год до початку.
create table if not exists public.lesson_vote_occurrences (
  id uuid primary key default gen_random_uuid(),
  lesson_time_id uuid not null references public.lesson_times(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  occurrence_at timestamptz not null,
  status text not null default 'open' check (status in ('open','finalized')),
  vote_id text not null,
  telegram_group_chat_id text,
  telegram_group_message_id bigint,
  votes_snapshot jsonb not null default '{}'::jsonb,
  lesson_snapshot jsonb not null default '{}'::jsonb,
  conducting_display_name text,
  conduct_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint lesson_vote_occurrences_lesson_occurrence_unique unique (lesson_time_id, occurrence_at)
);

create index if not exists lesson_vote_occurrences_open_status_idx on public.lesson_vote_occurrences (status)
where status = 'open';

comment on table public.lesson_vote_occurrences is 'Сесії групового голосування (абонемент / разове / пропуск) по конкретному слоту та даті проведення';
comment on column public.lesson_vote_occurrences.occurrence_at is 'Початок заняття (Kyiv/UTC timestamptz), для одного унікального «наступного» проведення';
comment on column public.lesson_vote_occurrences.votes_snapshot is 'Знімок голосів: { abon, single, skip } → { telegram_user_id: display_name }';
comment on column public.lesson_vote_occurrences.conduct_messages is 'Масив { chat_id, message_id, conduct_id } для приватних «Я провожу» та hydrate після рестарту';

alter table public.lesson_vote_occurrences enable row level security;

drop policy if exists "deny_all_lesson_vote_occurrences" on public.lesson_vote_occurrences;
create policy "deny_all_lesson_vote_occurrences"
on public.lesson_vote_occurrences
for all
to anon, authenticated
using (false)
with check (false);
