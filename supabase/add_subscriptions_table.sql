create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types(id) on delete restrict,
  total_visits integer,
  amount_uah integer,
  purchased_at date,
  valid_until date,
  status text not null default 'pending'
    check (status in ('pending','active','exhausted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_total_visits_positive check (total_visits is null or total_visits > 0),
  constraint subscriptions_amount_non_negative check (amount_uah is null or amount_uah >= 0)
);

create unique index if not exists subscriptions_one_active_per_type_idx
  on public.subscriptions(student_id, lesson_type_id)
  where status = 'active';

create index if not exists subscriptions_student_id_idx on public.subscriptions(student_id);
create index if not exists subscriptions_lesson_type_id_idx on public.subscriptions(lesson_type_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.subscriptions enable row level security;

drop policy if exists "deny_all_subscriptions" on public.subscriptions;
create policy "deny_all_subscriptions"
on public.subscriptions
for all
to anon, authenticated
using (false)
with check (false);
