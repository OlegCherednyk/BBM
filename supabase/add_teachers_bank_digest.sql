-- Берег для фільтра TG + opt-in ранкового дайджestу.
alter table public.teachers
  add column if not exists river_bank_scope text not null default 'any'
    check (river_bank_scope in ('any', 'left', 'right'));

alter table public.teachers
  add column if not exists digest_enabled boolean not null default false;

comment on column public.teachers.river_bank_scope is
  'Фільтр TG: any — усі береги; left/right — лише відповідний берег місця заняття';
comment on column public.teachers.digest_enabled is
  'Надсилати ранковий дайджest у chat_id';
