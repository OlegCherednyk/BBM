-- Per-student discounts on a specific lesson (percent or fixed UAH).
create table if not exists public.lesson_student_discounts (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  discount_kind text not null check (discount_kind in ('percent', 'uah')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_student_discounts_lesson_student_unique unique (lesson_id, student_id),
  constraint lesson_student_discounts_percent_range check (
    discount_kind <> 'percent' or discount_value <= 100
  )
);

create index if not exists lesson_student_discounts_lesson_id_idx
  on public.lesson_student_discounts (lesson_id);

create index if not exists lesson_student_discounts_student_id_idx
  on public.lesson_student_discounts (student_id);

comment on table public.lesson_student_discounts is
  'Знижка на конкретного учня в конкретному занятті: percent (%) або uah (грн)';

create or replace function public.set_lesson_student_discounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lesson_student_discounts_set_updated_at on public.lesson_student_discounts;
create trigger trg_lesson_student_discounts_set_updated_at
before update on public.lesson_student_discounts
for each row execute function public.set_lesson_student_discounts_updated_at();

alter table public.lesson_student_discounts enable row level security;

drop policy if exists "deny_all_lesson_student_discounts" on public.lesson_student_discounts;
create policy "deny_all_lesson_student_discounts"
on public.lesson_student_discounts
for all
to anon, authenticated
using (false)
with check (false);
