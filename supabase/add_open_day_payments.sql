alter table public.open_day_signups
  add column if not exists paid_at timestamptz,
  add column if not exists payment_order_reference text;

create index if not exists open_day_signups_payment_order_idx
  on public.open_day_signups (payment_order_reference);

create table if not exists public.wayforpay_payments (
  order_reference text primary key,
  merchant_account text,
  amount numeric,
  currency text,
  transaction_status text not null,
  reason text,
  reason_code text,
  phone text,
  email text,
  card_pan text,
  payment_system text,
  signup_id uuid references public.open_day_signups (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wayforpay_payments enable row level security;

drop policy if exists "deny_all_wayforpay_payments" on public.wayforpay_payments;
create policy "deny_all_wayforpay_payments"
on public.wayforpay_payments
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin_select_wayforpay_payments" on public.wayforpay_payments;
create policy "admin_select_wayforpay_payments"
on public.wayforpay_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);
