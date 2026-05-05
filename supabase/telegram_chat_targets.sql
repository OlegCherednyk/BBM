create table if not exists public.telegram_chat_targets (
  chat_id text primary key,
  chat_type text not null default 'unknown',
  title text,
  username text,
  first_name text,
  last_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_telegram_chat_targets()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_telegram_chat_targets on public.telegram_chat_targets;
create trigger trg_set_updated_at_telegram_chat_targets
before update on public.telegram_chat_targets
for each row
execute function public.set_updated_at_telegram_chat_targets();

alter table public.telegram_chat_targets enable row level security;

drop policy if exists "deny_all_telegram_chat_targets" on public.telegram_chat_targets;
create policy "deny_all_telegram_chat_targets"
on public.telegram_chat_targets
for all
to anon, authenticated
using (false)
with check (false);
