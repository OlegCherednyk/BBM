-- Add lessons entity with links to teacher, time slot and place.
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid,
  lesson_time_id uuid,
  place_id uuid,
  abon_count integer not null default 0,
  single_visitors_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.lessons
drop constraint if exists lessons_teacher_id_fkey;

alter table public.lessons
add constraint lessons_teacher_id_fkey
foreign key (teacher_id) references public.teachers(id) on delete set null;

alter table public.lessons
drop constraint if exists lessons_lesson_time_id_fkey;

alter table public.lessons
add constraint lessons_lesson_time_id_fkey
foreign key (lesson_time_id) references public.lesson_times(id) on delete set null;

alter table public.lessons
drop constraint if exists lessons_place_id_fkey;

alter table public.lessons
add constraint lessons_place_id_fkey
foreign key (place_id) references public.places(id) on delete set null;

alter table public.lessons
drop constraint if exists lessons_abon_count_check;

alter table public.lessons
add constraint lessons_abon_count_check
check (abon_count >= 0);

alter table public.lessons
drop constraint if exists lessons_single_visitors_count_check;

alter table public.lessons
add constraint lessons_single_visitors_count_check
check (single_visitors_count >= 0);

create index if not exists lessons_teacher_id_idx on public.lessons(teacher_id);
create index if not exists lessons_lesson_time_id_idx on public.lessons(lesson_time_id);
create index if not exists lessons_place_id_idx on public.lessons(place_id);

comment on table public.lessons is 'Заняття з прив''язкою до викладача, часу та місця';
comment on column public.lessons.teacher_id is 'Викладач, який проводить заняття';
comment on column public.lessons.lesson_time_id is 'Посилання на розклад (lesson_times)';
comment on column public.lessons.place_id is 'Місце проведення заняття';
comment on column public.lessons.abon_count is 'Кількість відвідувачів по абонементу';
comment on column public.lessons.single_visitors_count is 'Кількість разових відвідувачів';
