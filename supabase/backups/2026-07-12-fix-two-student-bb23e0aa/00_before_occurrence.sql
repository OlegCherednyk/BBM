-- BEFORE snapshot: lesson_vote_occurrences
-- occurrence_id = bb23e0aa-0008-4ddb-9d7f-c2a268b3382d
-- captured: 2026-07-12

-- Restore this row to pre-fix state:
update public.lesson_vote_occurrences
set
  lesson_time_id = 'd351cda3-e40e-4e86-b1eb-303f7e5ab342',
  place_id = '7af25126-c6a9-405c-9cf9-c42845c0c1ba',
  occurrence_at = '2026-07-08T17:00:00+00:00',
  status = 'finalized',
  vote_id = 'v_1783234817402_axog6y',
  telegram_group_chat_id = '-1002330895789',
  telegram_group_message_id = 1471,
  votes_snapshot = '{"abon":{"572378534":{"n":"Аліна","u":"medinakoliusz"}},"skip":{"392631541":{"n":"Iryna","u":"divcha_z_perom"},"392928436":{"n":"маря 🖇","u":"immort_al"},"531636750":{"n":"Valentyna","u":"Malenke_sovennia"},"790335765":"Law"},"single":{"350249969":{"n":"Sasha Pochep","u":"pooochep"}}}'::jsonb,
  lesson_snapshot = '{"riverBank":"Лівий берег","placeLabel":"Лівий берег · Мішуги","lesson_type_id":"9af4a173-9306-4e64-983f-8ab23b5573fb","lessonTimeLabel":"Ср, 20:00 (Київ)","lessonTypeLabel":"Тренаж"}'::jsonb,
  conducting_display_name = null,
  conduct_messages = '[{"chat_id":"617431901","conduct_id":"c_1783234818480_qpza8p","message_id":731},{"chat_id":"488737203","conduct_id":"c_1783234818480_v74rr0","message_id":730},{"chat_id":"928124322","conduct_id":"c_1783234818480_vjwdh9","message_id":732},{"chat_id":"465672619","conduct_id":"c_1783234818480_mw0s0q","message_id":733}]'::jsonb,
  created_at = '2026-07-05T07:00:17.880622+00:00',
  finalized_at = '2026-07-07T21:01:27.636+00:00',
  is_test = false,
  conducting_telegram_chat_id = null,
  post_finalize_errors = null,
  two_student_review_status = 'pending',
  two_student_review_message = null
where id = 'bb23e0aa-0008-4ddb-9d7f-c2a268b3382d';
