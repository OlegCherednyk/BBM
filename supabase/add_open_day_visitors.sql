-- Унікальні відвідувачі лендінгу Open Day. Запис лише через service role, читання — адмінам.
create table if not exists public.open_day_visitors (
  id uuid primary key,
  event_slug text not null default 'open-day',
  ip_hash text not null,
  device_hash text not null,
  local_id uuid,
  hits integer not null default 1,
  device_label text not null,
  browser_label text not null,
  lang text,
  tz text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint open_day_visitors_hits_check check (hits > 0)
);

create unique index if not exists open_day_visitors_ip_device_uidx
  on public.open_day_visitors (event_slug, ip_hash, device_hash);

create unique index if not exists open_day_visitors_local_id_uidx
  on public.open_day_visitors (local_id)
  where local_id is not null;

create index if not exists open_day_visitors_last_seen_idx
  on public.open_day_visitors (event_slug, last_seen desc);

alter table public.open_day_visitors enable row level security;

drop policy if exists "deny_all_open_day_visitors" on public.open_day_visitors;
create policy "deny_all_open_day_visitors"
on public.open_day_visitors
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin_select_open_day_visitors" on public.open_day_visitors;
create policy "admin_select_open_day_visitors"
on public.open_day_visitors
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);

revoke all on table public.open_day_visitors from anon, authenticated;
grant select on table public.open_day_visitors to authenticated;
