-- #1255 items 9 and 10: a canon entry can be finished, and the table holds what "finished" may mean for each part.
-- Every refusal sits beside the allowed write it is one mistake away from.

begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12550000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'close-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12550000-0000-4000-8000-0000000000d1', '12550000-0000-4000-8000-000000000011', 'The Salt Road', 'dnd5e-2024'),
  ('12550000-0000-4000-8000-0000000000d2', '12550000-0000-4000-8000-000000000011', 'Another table', 'dnd5e-2024');

insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title, wants) values
  ('12550000-0000-4000-8000-0000000000a1', '12550000-0000-4000-8000-000000000011', '12550000-0000-4000-8000-0000000000d1', 'question', null, 'Who cast the first bell?', null),
  ('12550000-0000-4000-8000-0000000000a2', '12550000-0000-4000-8000-000000000011', '12550000-0000-4000-8000-0000000000d1', 'force', null, 'The Brine Court', 'Every salt pan'),
  ('12550000-0000-4000-8000-0000000000a3', '12550000-0000-4000-8000-000000000011', '12550000-0000-4000-8000-0000000000d1', 'truth', 'all', 'The drowned god cast it', null),
  ('12550000-0000-4000-8000-0000000000a4', '12550000-0000-4000-8000-000000000011', '12550000-0000-4000-8000-0000000000d1', 'secret', null, 'Maren sold the bell', null),
  ('12550000-0000-4000-8000-0000000000a5', '12550000-0000-4000-8000-000000000011', '12550000-0000-4000-8000-0000000000d2', 'truth', 'all', 'A truth of another table', null);

select lives_ok(
  $$update public.canon_entries set closed_as = 'answered', closed_at = now(), closed_note = 'The god did.',
           became_entry_id = '12550000-0000-4000-8000-0000000000a3' where id = '12550000-0000-4000-8000-0000000000a1'$$,
  'a question is answered, with its answer and the truth it became');
select lives_ok(
  $$update public.canon_entries set closed_as = 'stopped', closed_at = now() where id = '12550000-0000-4000-8000-0000000000a2'$$,
  'a force is stopped');
select lives_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a3' where id = '12550000-0000-4000-8000-0000000000a2'$$,
  'an ended force leaves a truth behind (#1258)');
select throws_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a4' where id = '12550000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'a force becomes only a truth, never a secret');
select lives_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a3' where id = '12550000-0000-4000-8000-0000000000a4'$$,
  'a secret becomes a truth without closing: its ending is its reveal');

select throws_ok(
  $$update public.canon_entries set closed_as = 'stopped', closed_at = now() where id = '12550000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'a question cannot end the way a force does');
select throws_ok(
  $$update public.canon_entries set closed_as = 'answered', closed_at = now() where id = '12550000-0000-4000-8000-0000000000a3'$$,
  '23514', null, 'a truth does not close: it holds');
select throws_ok(
  $$update public.canon_entries set closed_as = 'succeeded', closed_at = null where id = '12550000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'an ending always says when');
select throws_ok(
  $$update public.canon_entries set closed_as = null, closed_at = null, closed_note = 'left over' where id = '12550000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'a reopened entry keeps no note of an ending it no longer has');
select throws_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a4' where id = '12550000-0000-4000-8000-0000000000a3'$$,
  '23514', null, 'a truth becomes nothing else');
select throws_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a2' where id = '12550000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'a question becomes a truth or a secret, never a force');
select throws_ok(
  $$update public.canon_entries set became_entry_id = id where id = '12550000-0000-4000-8000-0000000000a4'$$,
  '23514', null, 'an entry cannot become itself');
-- The same-campaign guard lets server code through (no signed-in writer), so this one write is made as the DM.
select set_config('request.jwt.claims', '{"sub": "12550000-0000-4000-8000-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$update public.canon_entries set became_entry_id = '12550000-0000-4000-8000-0000000000a5' where id = '12550000-0000-4000-8000-0000000000a4'$$,
  '23514', null, 'an entry cannot become an entry of another campaign');
select set_config('request.jwt.claims', '', true);

delete from public.canon_entries where id = '12550000-0000-4000-8000-0000000000a3';
select is((select became_entry_id from public.canon_entries where id = '12550000-0000-4000-8000-0000000000a1'), null,
  'deleting the entry it became leaves the question standing, pointing nowhere');

select * from finish();
rollback;
