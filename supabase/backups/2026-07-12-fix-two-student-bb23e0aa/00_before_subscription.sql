-- BEFORE snapshot: subscriptions (Alina abon used for this lesson)
-- subscription_id = 8c19743d-28e9-4e6e-a60e-ceea0f2684f1
-- captured: 2026-07-12

update public.subscriptions
set
  student_id = 'f31f4354-4e6f-4fea-a5c6-7c5961be3388',
  lesson_type_id = '9af4a173-9306-4e64-983f-8ab23b5573fb',
  total_visits = 8,
  amount_uah = 2040,
  purchased_at = null,
  valid_until = null,
  status = 'active',
  created_at = '2026-05-18T08:24:51.697275+00:00',
  updated_at = '2026-07-08T18:23:32.361+00:00',
  used_visits_override = 3
where id = '8c19743d-28e9-4e6e-a60e-ceea0f2684f1';
