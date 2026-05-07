-- SMM прайси за заняття в залежності від кількості людей.
create table if not exists public.smm_prices (
  id uuid primary key default gen_random_uuid(),
  people_from integer not null check (people_from >= 1),
  people_to integer check (people_to is null or people_to >= people_from),
  amount_uah integer not null check (amount_uah >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists smm_prices_people_range_unique_idx
on public.smm_prices (people_from, coalesce(people_to, 2147483647));

create or replace function public.set_smm_prices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_smm_prices_set_updated_at on public.smm_prices;
create trigger trg_smm_prices_set_updated_at
before update on public.smm_prices
for each row execute function public.set_smm_prices_updated_at();

insert into public.smm_prices (people_from, people_to, amount_uah)
values
  (1, 2, 0),
  (3, 3, 250),
  (4, 4, 350),
  (5, 6, 500),
  (7, null, 700)
on conflict (people_from, coalesce(people_to, 2147483647))
do update set
  amount_uah = excluded.amount_uah,
  updated_at = now();
