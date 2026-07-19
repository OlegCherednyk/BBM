-- Keep rental price history so stats use the rate in effect at lesson time.
alter table public.places_prices
  add column if not exists effective_from timestamptz not null default '1970-01-01 00:00:00+00';

comment on column public.places_prices.effective_from is
  'Тариф діє для уроків з starts_at >= effective_from';

drop index if exists public.places_prices_place_duration_unique_idx;

create unique index if not exists places_prices_place_duration_effective_unique_idx
  on public.places_prices (place_id, duration_minutes, effective_from);

create index if not exists places_prices_lookup_idx
  on public.places_prices (place_id, duration_minutes, effective_from desc);
