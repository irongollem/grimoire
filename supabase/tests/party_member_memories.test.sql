begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- A party member played by the AI (#1021 row 26). What would go wrong silently: one player reading what another
-- player's character lived through, a player writing a memory into their own (or anyone's) character, or a player
-- unable to read their own character's, which is the reason it is kept. And the switch: a player must be able to
-- say on their own sheet that the AI may speak for their character, and nobody else's.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10260000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pmm-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10260000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pmm-wren@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10260000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pmm-folio@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000001', 'Party campaign', 'dnd5e-2014');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('10260000-0000-4000-8000-000000000030', '10260000-0000-4000-8000-000000000001', '10260000-0000-4000-8000-000000000002', '10260000-0000-4000-8000-000000000010', 'Wren', '2014'),
  ('10260000-0000-4000-8000-000000000031', '10260000-0000-4000-8000-000000000001', '10260000-0000-4000-8000-000000000003', '10260000-0000-4000-8000-000000000010', 'Folio', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000002', 'player', 'Wren''s player', '10260000-0000-4000-8000-000000000030'),
  ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000003', 'player', 'Folio''s player', '10260000-0000-4000-8000-000000000031')
on conflict (campaign_id, user_id) do update set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

insert into public.party_member_memories (campaign_id, party_member_id, user_id, kind, body) values
  ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000030', '10260000-0000-4000-8000-000000000001', 'event', 'Wren stood watch at the ferry.'),
  ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000031', '10260000-0000-4000-8000-000000000001', 'event', 'Folio owes the ferryman a favour.');

-- ── Wren's player ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10260000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select array_agg(body order by body) from public.party_member_memories),
  array['Wren stood watch at the ferry.'],
  'a player reads what their own character lived through, and not another player''s character'
);
select throws_ok(
  $$ insert into public.party_member_memories (campaign_id, party_member_id, user_id, kind, body)
     values ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000030', '10260000-0000-4000-8000-000000000002', 'event', 'Wren found a vorpal sword.') $$,
  '42501', null, 'a player cannot write a memory into their own character'
);
update public.party_member_memories set body = 'Wren ran away.' where party_member_id = '10260000-0000-4000-8000-000000000030';
reset role;
select is((select body from public.party_member_memories where party_member_id = '10260000-0000-4000-8000-000000000030'), 'Wren stood watch at the ferry.', 'nor rewrite one');

-- The switch on the sheet is the player's own to set.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10260000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.party_members set ai_speaks = true where id = '10260000-0000-4000-8000-000000000030';
update public.party_members set ai_speaks = true where id = '10260000-0000-4000-8000-000000000031';
reset role;
select is((select ai_speaks from public.party_members where id = '10260000-0000-4000-8000-000000000030'), true, 'a player says on their own sheet that the AI may speak for their character');
select is((select ai_speaks from public.party_members where id = '10260000-0000-4000-8000-000000000031'), false, 'and cannot say it for another player''s character');

-- ── The Dungeon Master ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10260000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.party_member_memories), 2, 'the DM reads every party member''s');
select lives_ok(
  $$ insert into public.party_member_memories (campaign_id, party_member_id, user_id, kind, body)
     values ('10260000-0000-4000-8000-000000000010', '10260000-0000-4000-8000-000000000031', '10260000-0000-4000-8000-000000000001', 'promise', 'Folio promised to come back.') $$,
  'and writes one'
);
reset role;

-- ── Whose word each switch is (20261119115241) ─────────────────────────────
-- The player's consent is not the DM's to give; whether an absent character is played is not the player's to decide,
-- since it is charged to the DM.
insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('10260000-0000-4000-8000-000000000032', '10260000-0000-4000-8000-000000000001', '10260000-0000-4000-8000-000000000010', 'Ash', '2014');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10260000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ update public.party_members set ai_speaks = false where id = '10260000-0000-4000-8000-000000000030' $$,
  '42501', null, 'the DM cannot change a consent that is a player''s to give'
);
select lives_ok(
  $$ update public.party_members set ai_speaks = true, ai_stands_in = true where id = '10260000-0000-4000-8000-000000000032' $$,
  'for a character nobody has claimed, the DM says both'
);
select lives_ok(
  $$ update public.party_members set ai_stands_in = true where id = '10260000-0000-4000-8000-000000000030' $$,
  'the DM has an absent player''s character played'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10260000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ update public.party_members set ai_stands_in = false where id = '10260000-0000-4000-8000-000000000030' $$,
  '42501', null, 'a player cannot decide whether their character is played at the DM''s cost'
);
reset role;

-- That a memory is of a character of its own campaign is held for every such reference at once by
-- same_campaign_refs.test.sql.

select * from finish();
rollback;
