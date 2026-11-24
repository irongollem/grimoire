begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- The voice registry (#1272): every account reads the filled cast slots, only the admin reads the rest or writes,
-- and a DM can give a character only a voice they can read, so nobody puts another table's signature voice on
-- their NPC by its id.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('94400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sv-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sv-admin@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('94400000-0000-4000-8000-000000000010', '94400000-0000-4000-8000-000000000001', 'Voices', 'dnd5e-2014');

insert into public.npcs (id, user_id, campaign_id, name)
values ('94400000-0000-4000-8000-000000000020', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-000000000010', 'Pell');

insert into public.speech_voices (id, name, kind, origin, service, voice_id) values
  ('94400000-0000-4000-8000-000000000030', 'Shady guy', 'cast', 'designed', 'elevenlabs', 'TestShadyGuy0001'),
  ('94400000-0000-4000-8000-000000000031', 'The Gaffer', 'own', 'imported', 'elevenlabs', 'TestTheGaffer001'),
  ('94400000-0000-4000-8000-000000000032', 'Booming villain', 'cast', 'designed', null, null),
  ('94400000-0000-4000-8000-000000000033', 'Retired voice', 'cast', 'designed', 'elevenlabs', 'TestRetired00001');
update public.speech_voices set active = false where id = '94400000-0000-4000-8000-000000000033';

-- ── As an ordinary DM ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"94400000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email"}}', true);

select is(
  (select array_agg(name order by name) from public.speech_voices where id::text like '94400000%'),
  array['Shady guy'],
  'a DM reads only filled, active cast slots: no signature voice, no empty slot, no retired one');

select is(
  (select count(*)::integer from public.speech_voices where origin = 'stock'),
  15,
  'the fifteen ready-made voices are in the pool for everyone');

select throws_ok(
  $$insert into public.speech_voices (name) values ('Mine')$$,
  '42501', null,
  'a DM cannot add a voice');

update public.speech_voices set name = 'Renamed' where id = '94400000-0000-4000-8000-000000000030';
select is(
  (select name from public.speech_voices where id = '94400000-0000-4000-8000-000000000030'),
  'Shady guy',
  'a DM cannot rename a voice (the update touches nothing)');

delete from public.speech_voices where id = '94400000-0000-4000-8000-000000000030';
select is(
  (select count(*)::integer from public.speech_voices where id = '94400000-0000-4000-8000-000000000030'),
  1,
  'a DM cannot delete a voice (the delete touches nothing)');

select lives_ok(
  $$update public.npcs set speech_voice_id = '94400000-0000-4000-8000-000000000030' where id = '94400000-0000-4000-8000-000000000020'$$,
  'a DM gives their character a cast voice');

select throws_ok(
  $$update public.npcs set speech_voice_id = '94400000-0000-4000-8000-000000000031' where id = '94400000-0000-4000-8000-000000000020'$$,
  '42501', 'That voice cannot be given to a character.',
  'a DM cannot give their character someone''s signature voice by its id');

select throws_ok(
  $$update public.npcs set speech_voice_id = '94400000-0000-4000-8000-000000000033' where id = '94400000-0000-4000-8000-000000000020'$$,
  '42501', 'That voice cannot be given to a character.',
  'nor a retired one');

-- ── As the admin ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"94400000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);

select is(
  (select count(*)::integer from public.speech_voices where id::text like '94400000%'),
  4,
  'the admin reads every slot, planned and signature ones included');

select lives_ok(
  $$insert into public.speech_voices (name, description) values ('Child, cheeky', 'A small child, quick and cheeky.')$$,
  'the admin adds a planned slot');

reset role;
select * from finish();
rollback;
