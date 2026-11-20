begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- A note read aloud (#1021 row 19). What would go wrong silently: a client saying a note has a reading (and of
-- which text), the Dungeon Master's secret passage in what is spoken to the players, or a player never told that a
-- note they may read can be heard.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10190000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reading-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reading-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000001', 'Reading campaign', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('10190000-0000-4000-8000-000000000030', '10190000-0000-4000-8000-000000000001', '10190000-0000-4000-8000-000000000010', 'Wren', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000002', 'player', 'The player', '10190000-0000-4000-8000-000000000030')
on conflict (campaign_id, user_id) do update set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

insert into public.notes (id, user_id, campaign_id, title, tags, is_pinned, player_visible_to, content)
values (
  '10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000001', '10190000-0000-4000-8000-000000000010',
  'Session one', '{}', false, array['10190000-0000-4000-8000-000000000030']::uuid[],
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The mayor smiled."}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"The mayor is the thief."}]}]}]}'
);

-- ── What may be spoken ─────────────────────────────────────────────────────
select ok(public.note_text_for_reading('10190000-0000-4000-8000-000000000020') like '%The mayor smiled.%', 'what is read aloud holds the text a player may read');
select ok(public.note_text_for_reading('10190000-0000-4000-8000-000000000020') not like '%the thief%', 'and never the Dungeon Master''s secret passage');

-- ── The Dungeon Master, as a client ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.notes set title = 'Session one, told', reading_hash = 'forged', reading_voice = 'male', reading_chars = 9, reading_at = now()
 where id = '10190000-0000-4000-8000-000000000020';
select is(
  (select row(title, reading_hash, reading_at)::text from public.notes where id = '10190000-0000-4000-8000-000000000020'),
  row('Session one, told'::text, null::text, null::timestamptz)::text,
  'the DM changes the note, and cannot say it has a reading'
);
select throws_ok(
  $$ select public.set_note_reading('10190000-0000-4000-8000-000000000020', 'forged', 'male', 9) $$,
  '42501', null, 'nor through the function that says so'
);
select throws_ok(
  $$ select public.note_text_for_reading('10190000-0000-4000-8000-000000000020') $$,
  '42501', null, 'and the text for reading is the server''s to ask for'
);

-- ── The server ─────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select public.set_note_reading('10190000-0000-4000-8000-000000000020', 'abc123', 'female', 17);
reset role;
select is(
  (select row(reading_hash, reading_voice, reading_chars, updated_at <= reading_at)::text from public.notes where id = '10190000-0000-4000-8000-000000000020'),
  row('abc123'::text, 'female'::text, 17, true)::text,
  'the server says the note has a reading, and that alone does not make the note read as changed since'
);

-- ── The Dungeon Master edits the note afterwards ───────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_sleep(0.01);
update public.notes set reading_hash = null, title = 'Session one, retold' where id = '10190000-0000-4000-8000-000000000020';
select is((select reading_hash from public.notes where id = '10190000-0000-4000-8000-000000000020'), 'abc123', 'an edit keeps the reading the server set');

-- ── The player ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000002', true);
select is(
  (select row(reading_hash, reading_voice)::text from public.get_player_visible_notes('10190000-0000-4000-8000-000000000010') where id = '10190000-0000-4000-8000-000000000020'),
  row('abc123'::text, 'female'::text)::text,
  'a player who may read the note is told it can be heard'
);
select ok(
  (select content not like '%the thief%' from public.get_player_visible_notes('10190000-0000-4000-8000-000000000010') where id = '10190000-0000-4000-8000-000000000020'),
  'and still reads it without the secret passage'
);

select * from finish();
rollback;
