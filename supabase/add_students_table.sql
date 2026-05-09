-- Учні: ідентифікація по Telegram user id; доступ лише через service role (RLS deny).
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  display_name text not null,
  telegram_username text,
  instagram text,
  phone text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_telegram_user_id_unique unique (telegram_user_id),
  constraint students_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create index if not exists students_telegram_user_id_idx on public.students(telegram_user_id);

alter table public.students enable row level security;

drop policy if exists "deny_all_students" on public.students;
create policy "deny_all_students"
on public.students
for all
to anon, authenticated
using (false)
with check (false);
