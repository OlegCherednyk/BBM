alter table public.lesson_vote_occurrences
  add column if not exists post_finalize_errors jsonb;
