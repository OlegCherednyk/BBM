-- Хто натиснув «Я проводить» — приватний chat id (збігається з teachers.chat_id для викладача).
alter table public.lesson_vote_occurrences
add column if not exists conducting_telegram_chat_id text;

comment on column public.lesson_vote_occurrences.conducting_telegram_chat_id is 'Telegram chat_id приватного чату викладача після «Я провожу»; для прив’язки до teachers.id';
