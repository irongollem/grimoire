begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

-- npc_memories (20261012105632, #1019): what an NPC and the party told each
-- other. The DM reads and writes every line; a player reads the lines shared
-- with their own character and nothing else. The campaign always comes from
-- the NPC, and an id in either member array that is not one of that
-- campaign's party members never survives a write.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10190000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-wren@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-tomas@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-seatless@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10190000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memory-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000001', 'Remembered'),
  ('10190000-0000-4000-8000-000000000011', '10190000-0000-4000-8000-000000000004', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000001', '10190000-0000-4000-8000-000000000010', 'Wren', '2014'),
  ('10190000-0000-4000-8000-000000000021', '10190000-0000-4000-8000-000000000001', '10190000-0000-4000-8000-000000000010', 'Tomas', '2014'),
  ('10190000-0000-4000-8000-000000000022', '10190000-0000-4000-8000-000000000004', '10190000-0000-4000-8000-000000000011', 'Stranger', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000002', 'player', 'Wren', '10190000-0000-4000-8000-000000000020'),
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000003', 'player', 'Tomas', '10190000-0000-4000-8000-000000000021'),
  ('10190000-0000-4000-8000-000000000011', '10190000-0000-4000-8000-000000000004', 'dm', 'Other DM', null),
  -- A player seated without a character, and a co-DM who made none of the NPCs.
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000005', 'player', 'Seatless', null),
  ('10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000006', 'dm', 'Co-DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.npcs (id, user_id, campaign_id, name) values
  ('10190000-0000-4000-8000-000000000030', '10190000-0000-4000-8000-000000000001', '10190000-0000-4000-8000-000000000010', 'Bram'),
  ('10190000-0000-4000-8000-000000000031', '10190000-0000-4000-8000-000000000004', '10190000-0000-4000-8000-000000000011', 'Theirs');

-- Tonight's session is running; the other campaign has one too.
insert into public.campaign_sessions (id, campaign_id, user_id, number, started_at) values
  ('10190000-0000-4000-8000-000000000040', '10190000-0000-4000-8000-000000000010', '10190000-0000-4000-8000-000000000001', 7, now()),
  ('10190000-0000-4000-8000-000000000041', '10190000-0000-4000-8000-000000000011', '10190000-0000-4000-8000-000000000004', 3, now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM writes ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000001', true);

-- Shared with Wren, with the other campaign's character smuggled into both
-- arrays and the other campaign named outright.
select lives_ok($$
  insert into public.npc_memories (id, npc_id, campaign_id, kind, body, party_member_ids, player_visible_to)
  values ('10190000-0000-4000-8000-000000000050', '10190000-0000-4000-8000-000000000030',
          '10190000-0000-4000-8000-000000000011', 'revealed', '  Bram admitted he sold the map.  ',
          array['10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000022']::uuid[],
          array['10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000022']::uuid[])
$$, 'the DM records a memory');

select results_eq(
  $$ select campaign_id, body, party_member_ids, player_visible_to, session_id, user_id
       from public.npc_memories where id = '10190000-0000-4000-8000-000000000050' $$,
  $$ values ('10190000-0000-4000-8000-000000000010'::uuid, 'Bram admitted he sold the map.',
             array['10190000-0000-4000-8000-000000000020']::uuid[],
             array['10190000-0000-4000-8000-000000000020']::uuid[],
             null::uuid,
             '10190000-0000-4000-8000-000000000001'::uuid) $$,
  'the campaign comes from the NPC, foreign members are dropped, the author is stamped, and no session is guessed'
);

select lives_ok($$
  insert into public.npc_memories (npc_id, kind, body, session_id)
  values ('10190000-0000-4000-8000-000000000030', 'event', 'Filed tonight', '10190000-0000-4000-8000-000000000040')
$$, 'a memory filed under tonight''s session');
select is(
  (select session_id from public.npc_memories where body = 'Filed tonight'),
  '10190000-0000-4000-8000-000000000040'::uuid,
  'keeps the session it was filed under'
);
delete from public.npc_memories where body = 'Filed tonight';

select lives_ok($$
  insert into public.npc_memories (id, npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000051', '10190000-0000-4000-8000-000000000030', 'deceived',
          'Bram believes the party works for the Guild.')
$$, 'a DM-only memory needs no arrays');

select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body, user_id)
  values ('10190000-0000-4000-8000-000000000030', 'event', 'Signed as someone else',
          '10190000-0000-4000-8000-000000000003')
$$, '42501', null, 'a memory is always signed by its writer');

select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body, session_id)
  values ('10190000-0000-4000-8000-000000000030', 'event', 'Filed under their session',
          '10190000-0000-4000-8000-000000000041')
$$, null, null, 'a memory cannot be filed under another campaign''s session');

select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000030', 'gossip', 'Not a kind')
$$, '23514', null, 'the kind is one of the six');

select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000030', 'event', '   ')
$$, '23514', null, 'an empty line is refused');

-- ── Players read what was shared with them ──────────────────────────────────

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select id from public.npc_memories order by id $$,
  $$ values ('10190000-0000-4000-8000-000000000050'::uuid) $$,
  'Wren reads the line shared with her, and not the DM-only one'
);

select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000030', 'learned', 'A player writing')
$$, '42501', null, 'a player cannot write a memory');

update public.npc_memories set body = 'Rewritten by a player' where id = '10190000-0000-4000-8000-000000000050';
delete from public.npc_memories where id = '10190000-0000-4000-8000-000000000050';

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000003', true);
select is_empty(
  $$ select id from public.npc_memories $$,
  'Tomas, at the same table, reads nothing that was not shared with him'
);

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000005', true);
select is_empty(
  $$ select id from public.npc_memories $$,
  'a player seated without a character reads nothing'
);

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000004', true);
select is_empty(
  $$ select id from public.npc_memories $$,
  'the DM of another campaign reads nothing'
);
select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000030', 'event', 'Written from outside')
$$, '42501', null, 'nor writes into it');

-- ── The DM edits ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000001', true);
select is(
  (select body from public.npc_memories where id = '10190000-0000-4000-8000-000000000050'),
  'Bram admitted he sold the map.',
  'the player''s update and delete changed nothing'
);

select lives_ok($$
  update public.npc_memories
     set player_visible_to = array['10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000021', '10190000-0000-4000-8000-000000000022']::uuid[],
         session_id = null
   where id = '10190000-0000-4000-8000-000000000051'
$$, 'the DM shares a line later and takes it out of the session');

select results_eq(
  $$ select player_visible_to, session_id from public.npc_memories where id = '10190000-0000-4000-8000-000000000051' $$,
  $$ values (array['10190000-0000-4000-8000-000000000020', '10190000-0000-4000-8000-000000000021']::uuid[], null::uuid) $$,
  'an update keeps only the campaign''s own members, and the session stays unset'
);

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000003', true);
select results_eq(
  $$ select id from public.npc_memories order by id $$,
  $$ values ('10190000-0000-4000-8000-000000000051'::uuid) $$,
  'Tomas reads it once it is shared with him'
);

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000001', true);

update public.npc_memories set user_id = '10190000-0000-4000-8000-000000000002'
 where id = '10190000-0000-4000-8000-000000000051';
select is(
  (select user_id from public.npc_memories where id = '10190000-0000-4000-8000-000000000051'),
  '10190000-0000-4000-8000-000000000001'::uuid,
  'an edit keeps the original author'
);

select throws_ok($$
  update public.npc_memories set npc_id = '10190000-0000-4000-8000-000000000031'
   where id = '10190000-0000-4000-8000-000000000051'
$$, '42501', null, 'a line cannot be moved onto another campaign''s NPC');

select lives_ok($$
  delete from public.npc_memories where id = '10190000-0000-4000-8000-000000000051'
$$, 'the DM deletes a line');

-- ── A co-DM writes about an NPC another DM made ─────────────────────────────

select set_config('request.jwt.claim.sub', '10190000-0000-4000-8000-000000000006', true);
select lives_ok($$
  insert into public.npc_memories (id, npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000052', '10190000-0000-4000-8000-000000000030', 'promise',
          'Bram promised to keep the back door unlatched.')
$$, 'a co-DM records a memory on an NPC they did not make');
select is(
  (select user_id from public.npc_memories where id = '10190000-0000-4000-8000-000000000052'),
  '10190000-0000-4000-8000-000000000006'::uuid,
  'signed by the co-DM'
);

-- ── An author's account is deleted ─────────────────────────────────────────

reset role;
select lives_ok($$ delete from auth.users where id = '10190000-0000-4000-8000-000000000006' $$,
  'deleting an account that wrote a memory goes through');
select is(
  (select user_id from public.npc_memories where id = '10190000-0000-4000-8000-000000000052'),
  null::uuid,
  'and leaves the memory, unsigned'
);

-- ── Anonymous ────────────────────────────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select is_empty($$ select id from public.npc_memories $$, 'anon reads nothing');
select throws_ok($$
  insert into public.npc_memories (npc_id, kind, body)
  values ('10190000-0000-4000-8000-000000000030', 'event', 'Anonymous')
$$, '42501', null, 'anon writes nothing');

select * from finish();
rollback;
