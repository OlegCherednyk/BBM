alter table public.open_day_signups
  drop constraint if exists open_day_signups_source_check;

alter table public.open_day_signups
  add constraint open_day_signups_source_check
  check (source is null or source in ('ig', 'tg', 'friend', 'ad', 'other'));
