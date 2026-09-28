-- Кожен перегляд головної та лендінгу Open Day. Запис лише через service role, читання — адмінам.
create table if not exists public.site_page_views (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.open_day_visitors(id) on delete cascade,
  page text not null,
  seen_at timestamptz not null default now(),
  constraint site_page_views_page_check check (page in ('home', 'open-day'))
);

create index if not exists site_page_views_page_seen_idx
  on public.site_page_views (page, seen_at desc);

alter table public.site_page_views enable row level security;

drop policy if exists "deny_all_site_page_views" on public.site_page_views;
create policy "deny_all_site_page_views"
on public.site_page_views
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin_select_site_page_views" on public.site_page_views;
create policy "admin_select_site_page_views"
on public.site_page_views
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);

revoke all on table public.site_page_views from anon, authenticated;
grant select on table public.site_page_views to authenticated;
