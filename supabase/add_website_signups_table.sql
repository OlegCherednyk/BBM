-- Заявки на приєднання з сайту (форма «приєднатися»).
-- Доступ лише через service role (RLS deny).
create table if not exists public.website_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  created_at timestamptz not null default now(),
  constraint website_signups_name_not_blank check (length(btrim(name)) > 0),
  constraint website_signups_contact_not_blank check (length(btrim(contact)) > 0)
);

create index if not exists website_signups_created_at_idx
  on public.website_signups (created_at desc);

alter table public.website_signups enable row level security;

drop policy if exists "deny_all_website_signups" on public.website_signups;
create policy "deny_all_website_signups"
on public.website_signups
for all
to anon, authenticated
using (false)
with check (false);
