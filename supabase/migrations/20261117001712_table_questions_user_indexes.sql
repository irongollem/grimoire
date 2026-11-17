-- Indexes for the two account foreign keys of the table questions (#1212).
--
-- `table_questions.user_id` and `table_question_answers.user_id` reference `auth.users` with a cascade and had no
-- index a key lookup can use, so erasing an account would scan both tables, and
-- `supabase/tests/foreign_key_indexes.test.sql` (the rule of 20261008200258) has failed main's database job since
-- 20261116200111 landed. A red database job holds back every migration queued behind it, which is why this small
-- fix rides on the first pull request that needs the job green.
--
-- `if not exists`, so the session that owns the feature can land the same two indexes without a collision.

create index if not exists table_questions_user_idx on public.table_questions (user_id);
create index if not exists table_question_answers_user_idx on public.table_question_answers (user_id);
