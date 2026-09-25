alter table public.open_day_signups
  add column if not exists practices text[];

update public.open_day_signups
set practices = array[practice]
where practice is not null
  and practices is null;

alter table public.open_day_signups
  drop constraint if exists open_day_signups_practices_check;

alter table public.open_day_signups
  add constraint open_day_signups_practices_check
  check (
    practices is null
    or (
      cardinality(practices) > 0
      and practices <@ array['trenazh', 'dance', 'game', 'contact', 'health', 'stretch']::text[]
    )
  );

create table if not exists public.wayforpay_callbacks (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  order_reference text,
  transaction_status text,
  signature_ok boolean not null default false,
  http_status integer,
  body jsonb not null
);

create index if not exists wayforpay_callbacks_received_at_idx
  on public.wayforpay_callbacks (received_at desc);

alter table public.wayforpay_callbacks enable row level security;

drop policy if exists "deny_all_wayforpay_callbacks" on public.wayforpay_callbacks;
create policy "deny_all_wayforpay_callbacks"
on public.wayforpay_callbacks
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin_select_wayforpay_callbacks" on public.wayforpay_callbacks;
create policy "admin_select_wayforpay_callbacks"
on public.wayforpay_callbacks
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);
