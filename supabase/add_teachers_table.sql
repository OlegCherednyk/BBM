-- Add teachers table for admin management.
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.teachers
drop constraint if exists teachers_name_not_blank;

alter table public.teachers
add constraint teachers_name_not_blank
check (length(btrim(name)) > 0);

create index if not exists teachers_sort_order_idx on public.teachers(sort_order);
create index if not exists teachers_name_idx on public.teachers(name);

comment on table public.teachers is 'Викладачі для адмін-керування та виводу на сайті';
comment on column public.teachers.short_description is 'Необов''язковий короткий опис викладача';
