/*
  mozok.tilo.ruh — seed places, берег Дніпра, розклад і ціни з Instagram.

  Перед запуском у Supabase → SQL Editor:
  1. Перевір slug у таблиці lesson_types (очікується contemporary = сучасний танець, training = тренаж):
     select id, slug, name, duration_minutes from public.lesson_types order by sort_order;
  2. Якщо slug інші — підстав їх у цей скрипт замість contemporary / training.

  Час занять указаний як у Києві (як і в застосунку адмінки: day_of_week 0 = неділя).

  Перезапуск: при потребі закоментуй або змінюй умови WHERE NOT EXISTS, щоб уникнути дублікатів.
*/

-- Берег Дніпра (для картки місця в адмінці)
alter table public.places add column if not exists river_bank text;

comment on column public.places.river_bank is 'Напр. Правий берег або Лівий берег';


-- Тривалість занять із підписів (контемпорарі 1,5 год, тренаж 1 год)
update public.lesson_types set duration_minutes = 90 where slug = 'contemporary';
update public.lesson_types set duration_minutes = 60 where slug = 'training';


-- Два простори за фото — якщо вже є такий адрес, не дублюємо
insert into public.places (name, sort_order, address, notes, river_bank)
select 'Правий берег · Кирилівська', 10, 'вул. Кирилівська, 41, Київ', null, 'Правий берег'
where not exists (select 1 from public.places p where p.address = 'вул. Кирилівська, 41, Київ');

insert into public.places (name, sort_order, address, notes, river_bank)
select 'Лівий берег · Мішуги', 20, 'вул. Мішуги, 10, Київ', null, 'Лівий берег'
where not exists (select 1 from public.places p where p.address = 'вул. Мішуги, 10, Київ');


-- Слоти: contemporary + training на кожному місці (час за Києвом)
-- Правий берег / Кирилівська
insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 3, '18:30:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Кирилівська, 41, Київ' and lt.slug = 'contemporary'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 3 and x.start_time::text like '18:30:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 6, '11:00:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Кирилівська, 41, Київ' and lt.slug = 'contemporary'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 6 and x.start_time::text like '11:00:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 3, '17:30:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Кирилівська, 41, Київ' and lt.slug = 'training'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 3 and x.start_time::text like '17:30:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 6, '10:00:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Кирилівська, 41, Київ' and lt.slug = 'training'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 6 and x.start_time::text like '10:00:%'
);

-- Лівий берег / Мішуги
insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 2, '19:00:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Мішуги, 10, Київ' and lt.slug = 'contemporary'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 2 and x.start_time::text like '19:00:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 4, '19:00:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Мішуги, 10, Київ' and lt.slug = 'contemporary'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 4 and x.start_time::text like '19:00:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 3, '20:00:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Мішуги, 10, Київ' and lt.slug = 'training'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 3 and x.start_time::text like '20:00:%'
);

insert into public.lesson_times (place_id, lesson_type_id, day_of_week, start_time)
select p.id, lt.id, 6, '12:30:00'
from public.places p
cross join public.lesson_types lt
where p.address = 'вул. Мішуги, 10, Київ' and lt.slug = 'training'
and not exists (
  select 1 from public.lesson_times x
  where x.place_id = p.id and x.lesson_type_id = lt.id and x.day_of_week = 6 and x.start_time::text like '12:30:%'
);


-- Ціни з поста (якщо такий самий пакет вже є — пропускаємо)
insert into public.prices (lesson_type_id, price_kind, visits_count, amount_uah)
select lt.id, 'single'::text, 1, 600
from public.lesson_types lt where lt.slug = 'contemporary'
and not exists (
  select 1 from public.prices p
  where p.lesson_type_id = lt.id and p.price_kind = 'single' and coalesce(p.visits_count, 1) = 1 and p.amount_uah = 600
);

insert into public.prices (lesson_type_id, price_kind, visits_count, amount_uah)
select lt.id, 'abon'::text, 8, 3200
from public.lesson_types lt where lt.slug = 'contemporary'
and not exists (
  select 1 from public.prices p
  where p.lesson_type_id = lt.id and p.price_kind = 'abon' and p.visits_count = 8 and p.amount_uah = 3200
);

insert into public.prices (lesson_type_id, price_kind, visits_count, amount_uah)
select lt.id, 'single'::text, 1, 500
from public.lesson_types lt where lt.slug = 'training'
and not exists (
  select 1 from public.prices p
  where p.lesson_type_id = lt.id and p.price_kind = 'single' and coalesce(p.visits_count, 1) = 1 and p.amount_uah = 500
);

insert into public.prices (lesson_type_id, price_kind, visits_count, amount_uah)
select lt.id, 'abon'::text, 8, 2600
from public.lesson_types lt where lt.slug = 'training'
and not exists (
  select 1 from public.prices p
  where p.lesson_type_id = lt.id and p.price_kind = 'abon' and p.visits_count = 8 and p.amount_uah = 2600
);
