-- Add hourly rental price for each place (admins-only usage).
alter table public.places
add column if not exists rent_per_hour_uah integer;

alter table public.places
drop constraint if exists places_rent_per_hour_uah_check;

alter table public.places
add constraint places_rent_per_hour_uah_check
check (rent_per_hour_uah is null or rent_per_hour_uah >= 0);

comment on column public.places.rent_per_hour_uah is 'Ціна оренди місця за 1 годину, грн';
