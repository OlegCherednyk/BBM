alter table public.subscriptions
  add column if not exists used_visits_override integer null
    check (used_visits_override is null or used_visits_override >= 0);
