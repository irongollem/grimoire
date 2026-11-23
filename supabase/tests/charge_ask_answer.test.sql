begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- Ask Grimoire's allowance and meter (#1253): five free answers a day, then whole credits rounded down with the
-- fraction carried to the next answer.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12530000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ask-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12530000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ask-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- An allowance of two, so the test reaches the meter quickly.
select is(
  (select row(free, credits, free_left)::text from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 0.4, 2)),
  row(true, 0, 1)::text, 'the first answer of the day is free and leaves one'
);
select is(
  (select row(free, credits, free_left)::text from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 0.4, 2)),
  row(true, 0, 0)::text, 'the last free answer leaves none'
);
select is(
  (select row(free, credits)::text from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 0.7, 2)),
  row(false, 0)::text, 'past the allowance, an answer under a whole credit charges nothing yet'
);
select is(
  (select carry from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000000a1'),
  0.7::numeric, 'and its fraction is kept, not given away'
);
select is(
  (select row(free, credits)::text from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 0.6, 2)),
  row(false, 1)::text, 'the answer that takes the carry past a whole credit charges that credit'
);
select is(
  (select carry from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000000a1'),
  0.3::numeric, 'the remainder under a credit stays for the next answer'
);
select is(
  (select credits from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 2.5, 2)),
  2, 'a large answer charges every whole credit it crosses, rounded down'
);

-- A new day gives the allowance back and keeps the carry.
update public.ask_usage set day = day - 1 where user_id = '12530000-0000-4000-8000-0000000000a1';
select is(
  (select row(free, credits, free_left)::text from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', 0.9, 2)),
  row(true, 0, 1)::text, 'yesterday''s count does not hold today''s free answers back'
);
select is(
  (select carry from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000000a1'),
  0.8::numeric, 'a free answer neither adds to nor clears the carry'
);

select throws_ok(
  $$ select * from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a1', -1, 2) $$,
  '22023', null, 'a negative cost is refused: an answer can never give credits back'
);

-- Only the server settles answers; an account reads its own row and nobody else's.
set local role authenticated;
set local request.jwt.claims to '{"sub": "12530000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.charge_ask_answer('12530000-0000-4000-8000-0000000000a2', 0, 99) $$,
  '42501', null, 'a signed-in account cannot call the charge to hand itself free answers'
);
select is_empty(
  $$ select 1 from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000000a1' $$,
  'another account''s allowance is not readable'
);
set local request.jwt.claims to '{"sub": "12530000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select isnt_empty(
  $$ select 1 from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000000a1' $$,
  'positive control: the owner reads their own allowance'
);

select * from finish();
rollback;
