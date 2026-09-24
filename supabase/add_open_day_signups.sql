-- Записи на Open Day. Запис лише через service role, читання — адмінам.
create table if not exists public.open_day_signups (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null default 'open-day',
  name text not null,
  telegram text not null,
  phone text not null,
  pass text not null,
  practice text,
  source text,
  source_other text,
  hope text,
  created_at timestamptz not null default now(),
  constraint open_day_signups_name_not_blank check (length(btrim(name)) > 0),
  constraint open_day_signups_telegram_not_blank check (length(btrim(telegram)) > 0),
  constraint open_day_signups_phone_not_blank check (length(btrim(phone)) > 0),
  constraint open_day_signups_pass_check check (pass in ('full', 'grunt', 'sprouts', 'one')),
  constraint open_day_signups_practice_check check (
    practice is null or practice in ('trenazh', 'dance', 'game', 'contact', 'health', 'stretch')
  ),
  constraint open_day_signups_practice_when_one check (
    (pass = 'one' and practice is not null) or (pass <> 'one' and practice is null)
  ),
  constraint open_day_signups_source_check check (
    source is null or source in ('ig', 'tg', 'friend', 'other')
  )
);

create index if not exists open_day_signups_created_at_idx
  on public.open_day_signups (created_at desc);

alter table public.open_day_signups enable row level security;

drop policy if exists "deny_all_open_day_signups" on public.open_day_signups;
create policy "deny_all_open_day_signups"
on public.open_day_signups
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin_select_open_day_signups" on public.open_day_signups;
create policy "admin_select_open_day_signups"
on public.open_day_signups
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);
