-- SMM-викладач (лише один задається з адмінки).
alter table public.teachers
  add column if not exists is_smm boolean not null default false;

comment on column public.teachers.is_smm is
  'SMM-викладач: SMM не списується з уроків; отримує суму SMM з усіх уроків як дохід';
