create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_vote_occurrence_id uuid not null
    references public.lesson_vote_occurrences(id) on delete cascade,
  vote_choice text not null check (vote_choice in ('abon','single')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  visit_status text not null default 'attended'
    check (visit_status in ('attended','rolled_back')),
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  constraint visits_student_occurrence_unique unique (student_id, lesson_vote_occurrence_id)
);

create index if not exists visits_occurrence_id_idx on public.visits(lesson_vote_occurrence_id);
create index if not exists visits_student_id_idx on public.visits(student_id);
create index if not exists visits_subscription_id_idx on public.visits(subscription_id);

alter table public.visits enable row level security;

drop policy if exists "deny_all_visits" on public.visits;
create policy "deny_all_visits"
on public.visits
for all
to anon, authenticated
using (false)
with check (false);
