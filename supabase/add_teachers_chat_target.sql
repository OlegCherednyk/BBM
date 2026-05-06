-- Add Telegram chat binding for teachers.
alter table public.teachers
add column if not exists chat_id text;

alter table public.teachers
drop constraint if exists teachers_chat_id_fkey;

alter table public.teachers
add constraint teachers_chat_id_fkey
foreign key (chat_id)
references public.telegram_chat_targets(chat_id)
on delete set null;

create index if not exists teachers_chat_id_idx on public.teachers(chat_id);

comment on column public.teachers.chat_id is 'Посилання на telegram_chat_targets.chat_id (лише приватні чати з username в адмінці)';

-- Allow admins to read chat targets for selector in admin panel.
drop policy if exists "admin_select_telegram_chat_targets" on public.telegram_chat_targets;
create policy "admin_select_telegram_chat_targets"
on public.telegram_chat_targets
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_allowlist aa
    where aa.user_id = auth.uid()
  )
);
