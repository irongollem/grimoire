begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- family_trees (20261022113302, #1083): kin is its own record with a direction; players see it only through
-- get_player_visible_kin, between two people they can see; a House's line of succession is set in one write by
-- set_house_succession.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10830000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kin-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10830000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kin-ilse@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10830000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kin-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10830000-0000-4000-8000-000000000010', '10830000-0000-4000-8000-000000000001', 'Thane''s Crossing'),
  ('10830000-0000-4000-8000-000000000011', '10830000-0000-4000-8000-000000000004', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10830000-0000-4000-8000-000000000020', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'Ilse Thane', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10830000-0000-4000-8000-000000000010', '10830000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10830000-0000-4000-8000-000000000010', '10830000-0000-4000-8000-000000000002', 'player', 'Ilse', '10830000-0000-4000-8000-000000000020'),
  ('10830000-0000-4000-8000-000000000011', '10830000-0000-4000-8000-000000000004', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Bren and Brenna are known to Ilse; Wren is not; the "Grey Pilgrim" is Brenna's husband in disguise; one NPC lives elsewhere.
insert into public.npcs (id, user_id, campaign_id, name, player_visible_to, player_visible_fields, disguise_name) values
  ('10830000-0000-4000-8000-000000000030', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'Old Bren Thane',
   array['10830000-0000-4000-8000-000000000020']::uuid[], array['name'], null),
  ('10830000-0000-4000-8000-000000000031', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'Brenna Ashe',
   array['10830000-0000-4000-8000-000000000020']::uuid[], array['name'], null),
  ('10830000-0000-4000-8000-000000000032', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'Wren Ashe',
   '{}', '{}', null),
  ('10830000-0000-4000-8000-000000000033', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'Corwin Ashe',
   array['10830000-0000-4000-8000-000000000020']::uuid[], array['name'], 'The Grey Pilgrim'),
  ('10830000-0000-4000-8000-000000000034', '10830000-0000-4000-8000-000000000004', '10830000-0000-4000-8000-000000000011', 'A stranger',
   '{}', '{}', null);

insert into public.factions (id, user_id, campaign_id, name, faction_type, descent, player_visible_to) values
  ('10830000-0000-4000-8000-000000000040', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010', 'House Thane', 'House', 'either',
   array['10830000-0000-4000-8000-000000000020']::uuid[]);
insert into public.faction_npcs (user_id, faction_id, npc_id, role) values
  ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000040', '10830000-0000-4000-8000-000000000030', 'Head of house');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM draws the family ─────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10830000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.kin_links (id, user_id, campaign_id, from_npc_id, to_npc_id, to_party_member_id, kind, parent_role) values
    ('10830000-0000-4000-8000-000000000050', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000030', '10830000-0000-4000-8000-000000000031', null, 'parent', 'father'),
    ('10830000-0000-4000-8000-000000000051', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000030', null, '10830000-0000-4000-8000-000000000020', 'parent', 'father'),
    ('10830000-0000-4000-8000-000000000052', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000031', '10830000-0000-4000-8000-000000000032', null, 'parent', null),
    ('10830000-0000-4000-8000-000000000053', '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000031', '10830000-0000-4000-8000-000000000033', null, 'spouse', null)
$$, 'the DM links a father, his daughter and his PC daughter, a grandchild and a husband');

select throws_ok($$
  insert into public.kin_links (user_id, campaign_id, from_npc_id, to_npc_id, kind) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000031', '10830000-0000-4000-8000-000000000030', 'sibling')
$$, '23505', null, 'a pair holds one link, whichever way round it is written');

select throws_ok($$
  insert into public.kin_links (user_id, campaign_id, from_npc_id, to_npc_id, kind) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000031', '10830000-0000-4000-8000-000000000031', 'sibling')
$$, '23514', null, 'nobody is their own kin');

select throws_ok($$
  insert into public.kin_links (user_id, campaign_id, from_npc_id, to_party_member_id, kind, adoptive) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000032', '10830000-0000-4000-8000-000000000020', 'spouse', true)
$$, '23514', null, 'only a parent link can be adoptive');

select throws_ok($$
  insert into public.kin_links (user_id, campaign_id, from_npc_id, to_npc_id, kind) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000032', '10830000-0000-4000-8000-000000000034', 'relative')
$$, null, null, 'kin cannot reach into another campaign');

select throws_ok($$
  insert into public.kin_links (user_id, campaign_id, from_npc_id, to_npc_id, kind, needs_sorting) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000032', '10830000-0000-4000-8000-000000000033', 'parent', true)
$$, '23514', null, 'only a plain relative can be waiting to be sorted');

select throws_ok($$
  insert into public.npc_relationships (user_id, campaign_id, npc_id, related_npc_id, relationship_type) values
    ('10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000010',
     '10830000-0000-4000-8000-000000000030', '10830000-0000-4000-8000-000000000032', 'family')
$$, '23514', null, 'a bond can no longer say "family": that is kin');

-- ── The line of succession ──────────────────────────────────────────────────────

select lives_ok($$ select public.set_house_succession('10830000-0000-4000-8000-000000000040',
  array['npc:10830000-0000-4000-8000-000000000031', 'pc:10830000-0000-4000-8000-000000000020']) $$,
  'the DM sets Brenna first and Ilse second');
select is((select succession_rank from public.faction_npcs
            where faction_id = '10830000-0000-4000-8000-000000000040' and npc_id = '10830000-0000-4000-8000-000000000031'),
  1, 'Brenna, not yet a member, joins the house as its heir');
select is((select succession_rank from public.faction_party_members
            where faction_id = '10830000-0000-4000-8000-000000000040' and party_member_id = '10830000-0000-4000-8000-000000000020'),
  2, 'Ilse is second');
select is((select succession_rank from public.faction_npcs
            where faction_id = '10830000-0000-4000-8000-000000000040' and npc_id = '10830000-0000-4000-8000-000000000030'),
  null, 'the head of house is not in the line');

select lives_ok($$ select public.set_house_succession('10830000-0000-4000-8000-000000000040',
  array['pc:10830000-0000-4000-8000-000000000020']) $$, 'the DM sets a new line');
select is((select succession_rank from public.faction_npcs
            where faction_id = '10830000-0000-4000-8000-000000000040' and npc_id = '10830000-0000-4000-8000-000000000031'),
  null, 'a new line replaces the old one whole');

select throws_ok($$ select public.set_house_succession('10830000-0000-4000-8000-000000000040',
  array['npc:10830000-0000-4000-8000-000000000034']) $$, '23514', null, 'the line cannot name someone from another campaign');

-- ── What the player sees ────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10830000-0000-4000-8000-000000000002', true);

select is_empty($$ select id from public.kin_links $$, 'a player cannot read the kin table');
select is((select jsonb_agg(l ->> 'id' order by l ->> 'id') from jsonb_array_elements(
             public.get_player_visible_kin('10830000-0000-4000-8000-000000000010') -> 'links') l),
  '["10830000-0000-4000-8000-000000000050", "10830000-0000-4000-8000-000000000051"]'::jsonb,
  'the player sees the links between people they know, not to an unmet grandchild or a disguise');
select is((select count(*)::int from jsonb_array_elements(
             public.get_player_visible_kin('10830000-0000-4000-8000-000000000010') -> 'links') l where l ? 'note'),
  0, 'a link''s note stays with the DM');
select is(public.get_player_visible_kin('10830000-0000-4000-8000-000000000010') -> 'houses' -> 0 -> 'members',
  '["npc:10830000-0000-4000-8000-000000000030", "npc:10830000-0000-4000-8000-000000000031", "pc:10830000-0000-4000-8000-000000000020"]'::jsonb,
  'a House the player knows says which of the people they know belong to it (Brenna stays a member after leaving the line)');
select is((select descent from public.get_player_visible_factions('10830000-0000-4000-8000-000000000010')
            where id = '10830000-0000-4000-8000-000000000040'),
  'either', 'the player sees how the house reckons its own');
select throws_ok($$ select public.set_house_succession('10830000-0000-4000-8000-000000000040', array[]::text[]) $$,
  '42501', 'Not authorized', 'a player cannot set the line of succession');

select set_config('request.jwt.claim.sub', '10830000-0000-4000-8000-000000000001', true);
select is(jsonb_array_length(public.get_player_visible_kin('10830000-0000-4000-8000-000000000010',
            '10830000-0000-4000-8000-0000000000ff') -> 'houses'), 0,
  'the DM previewing a member sees only the houses that member can see');
update public.faction_npcs set status = 'Expelled'
 where faction_id = '10830000-0000-4000-8000-000000000040' and npc_id = '10830000-0000-4000-8000-000000000030';
select set_config('request.jwt.claim.sub', '10830000-0000-4000-8000-000000000002', true);
select is(public.get_player_visible_kin('10830000-0000-4000-8000-000000000010') -> 'houses' -> 0 -> 'members',
  '["npc:10830000-0000-4000-8000-000000000031", "pc:10830000-0000-4000-8000-000000000020"]'::jsonb,
  'an expelled member is the DM''s to reveal, not the projection''s');

-- ── Who may not ─────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10830000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.get_player_visible_kin('10830000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'someone outside the campaign cannot read its families');
select throws_ok($$ select public.set_house_succession('10830000-0000-4000-8000-000000000040', array[]::text[]) $$,
  '42501', 'Not authorized', 'another DM cannot set this house''s line');

-- ── The family stays with the campaign ──────────────────────────────────────────
reset role;
select private.move_campaign_content('10830000-0000-4000-8000-000000000010',
  '10830000-0000-4000-8000-000000000001', '10830000-0000-4000-8000-000000000004', false, false);
select is((select count(*)::int from public.kin_links
            where campaign_id = '10830000-0000-4000-8000-000000000010' and user_id = '10830000-0000-4000-8000-000000000004'),
  4, 'handing the campaign on re-homes the family its author drew');

select * from finish();
rollback;
