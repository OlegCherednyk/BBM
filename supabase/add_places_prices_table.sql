-- Rental prices per place with separate durations.
create table if not exists public.places_prices (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes in (60, 90)),
  amount_uah integer not null check (amount_uah >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists places_prices_place_duration_unique_idx
on public.places_prices (place_id, duration_minutes);

create index if not exists places_prices_place_id_idx
on public.places_prices (place_id);

create or replace function public.set_places_prices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_places_prices_set_updated_at on public.places_prices;
create trigger trg_places_prices_set_updated_at
before update on public.places_prices
for each row execute function public.set_places_prices_updated_at();
