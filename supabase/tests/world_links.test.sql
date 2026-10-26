begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- world_links (20261026212025, #1084): one table for every free tie between two things in a campaign. A type outside
-- its pair is refused by the catalogue; a symmetric type is stored once whichever way round it is written; a faction
-- holds one stance per direction; only the campaign's DMs read or write it; get_connections reads links and records
-- together from the thing's own side.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10840000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'web-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10840000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'web-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10840000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'web-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10840000-0000-4000-8000-000000000010', '10840000-0000-4000-8000-000000000001', 'The Ford'),
  ('10840000-0000-4000-8000-000000000011', '10840000-0000-4000-8000-000000000004', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10840000-0000-4000-8000-000000000020', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Dorn Vale', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10840000-0000-4000-8000-000000000010', '10840000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10840000-0000-4000-8000-000000000010', '10840000-0000-4000-8000-000000000002', 'player', 'Dorn', '10840000-0000-4000-8000-000000000020'),
  ('10840000-0000-4000-8000-000000000011', '10840000-0000-4000-8000-000000000004', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.locations (id, user_id, campaign_id, name) values
  ('10840000-0000-4000-8000-000000000050', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Thane''s Crossing');

-- Dorn knows Brenna and Sister Ama by name, the Drowned Lady, and House Thane; not Harl, not the Toll-men.
insert into public.npcs (id, user_id, campaign_id, name, location_id, player_visible_to, player_visible_fields) values
  ('10840000-0000-4000-8000-000000000030', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Brenna Ashe',
   '10840000-0000-4000-8000-000000000050', array['10840000-0000-4000-8000-000000000020']::uuid[], array['name']),
  ('10840000-0000-4000-8000-000000000031', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Harl', null,
   '{}', '{}'),
  ('10840000-0000-4000-8000-000000000032', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Sister Ama', null,
   array['10840000-0000-4000-8000-000000000020']::uuid[], array['name']),
  ('10840000-0000-4000-8000-000000000034', '10840000-0000-4000-8000-000000000004', '10840000-0000-4000-8000-000000000011', 'A stranger', null,
   '{}', '{}');

insert into public.deities (id, user_id, campaign_id, name, player_visible_to) values
  ('10840000-0000-4000-8000-000000000060', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'The Drowned Lady',
   array['10840000-0000-4000-8000-000000000020']::uuid[]);

insert into public.factions (id, user_id, campaign_id, name, player_visible_to) values
  ('10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'House Thane',
   array['10840000-0000-4000-8000-000000000020']::uuid[]),
  ('10840000-0000-4000-8000-000000000041', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Toll-men', '{}');
-- Brenna is House Thane's heir, openly; Sister Ama is its secret member (typed loosely, as free text is), which is the
-- secret; the Grey Pilgrim is Corwin in disguise, and Corwin's place in the house is his own secret while the cover holds.
insert into public.npcs (id, user_id, campaign_id, name, disguise_name, player_visible_to, player_visible_fields) values
  ('10840000-0000-4000-8000-000000000033', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Corwin Ashe',
   'The Grey Pilgrim', array['10840000-0000-4000-8000-000000000020']::uuid[], array['name']);
insert into public.faction_npcs (user_id, faction_id, npc_id, role) values
  ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000030', 'Heir'),
  ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000032', ' SECRET member'),
  ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000033', 'Married in');
-- Mira, another character, is sworn to House Thane; that is hers to tell, not Dorn's to read.
insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10840000-0000-4000-8000-000000000021', '10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010', 'Mira', '2014');
insert into public.faction_party_members (user_id, faction_id, party_member_id, role) values
  ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000021', 'Member'),
  ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000040', '10840000-0000-4000-8000-000000000020', 'Ally');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM ties things together ──────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10840000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_npc_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000031', 'npc', '10840000-0000-4000-8000-000000000030', 'rival')
$$, 'the DM makes two NPCs rivals');

select is(
  (select from_npc_id from public.world_links where type = 'rival'),
  '10840000-0000-4000-8000-000000000030'::uuid,
  'a symmetric type is stored with its ends in order, whichever way it was written');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_npc_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000030', 'npc', '10840000-0000-4000-8000-000000000031', 'rival')
$$, '23505', null, 'the same symmetric tie the other way round is the same row');

select lives_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_deity_id, type, told, note,
                                  player_visible_to) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000030', 'deity', '10840000-0000-4000-8000-000000000060', 'worships',
     'She leaves the first fish of the season at the weir.', 'She stopped believing years ago.',
     array['10840000-0000-4000-8000-000000000020']::uuid[])
$$, 'the DM says Brenna worships the Drowned Lady');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_deity_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000031', 'deity', '10840000-0000-4000-8000-000000000060', 'controls')
$$, '23503', null, 'a type outside its pair is refused by the catalogue');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_deity_id, to_kind, to_npc_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'deity', '10840000-0000-4000-8000-000000000060', 'npc', '10840000-0000-4000-8000-000000000031', 'worships')
$$, '23503', null, 'a link is stored in the catalogue''s direction only');

select lives_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_faction_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'faction', '10840000-0000-4000-8000-000000000041', 'faction', '10840000-0000-4000-8000-000000000040', 'hostile'),
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'faction', '10840000-0000-4000-8000-000000000040', 'faction', '10840000-0000-4000-8000-000000000041', 'rival')
$$, 'each faction holds its own stance towards the other');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_faction_id, to_kind, to_faction_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'faction', '10840000-0000-4000-8000-000000000041', 'faction', '10840000-0000-4000-8000-000000000040', 'allied')
$$, '23505', null, 'a faction holds one stance per direction');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_npc_id, type) values
    ('10840000-0000-4000-8000-000000000001', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000030', 'npc', '10840000-0000-4000-8000-000000000034', 'friend')
$$, '23514', null, 'a link cannot reach into another campaign');

select results_eq($$
  select source || ':' || type || ':' || outward::text || ':' || other_name
    from public.get_connections('npc', '10840000-0000-4000-8000-000000000030') order by 1
$$, $$ values ('link:rival:true:Harl'), ('link:worships:true:The Drowned Lady'),
              ('membership:member_of:true:House Thane'), ('npc_home:lives_in:true:Thane''s Crossing') $$,
'Brenna''s connections read links and records together, from her side');

select results_eq($$
  select source || ':' || type || ':' || outward::text || ':' || other_name
    from public.get_connections('location', '10840000-0000-4000-8000-000000000050') order by 1
$$, $$ values ('npc_home:lives_in:false:Brenna Ashe') $$,
'a place reads its residents from its own side');

-- ── Nobody else reads or writes it ───────────────────────────────────────────────

select ok(
  (select count(*) from public.get_world_ties('10840000-0000-4000-8000-000000000010')) >= 6,
  'the DM''s web reads every tie of the campaign, links and records');

select is(
  (select count(*)::int from public.get_player_connections('10840000-0000-4000-8000-000000000010', 'npc',
     '10840000-0000-4000-8000-000000000030', '10840000-0000-4000-8000-000000000020') where source = 'link'),
  1, 'a DM previewing Dorn sees only the link revealed to him');

select set_config('request.jwt.claim.sub', '10840000-0000-4000-8000-000000000002', true);
select is_empty($$ select 1 from public.world_links $$, 'a player reads no links from the table');

select results_eq($$
  select source || ':' || type || ':' || other_name || ':' || coalesce(told, '-')
    from public.get_player_connections('10840000-0000-4000-8000-000000000010', 'npc', '10840000-0000-4000-8000-000000000030')
   order by 1
$$, $$ values ('link:worships:The Drowned Lady:She leaves the first fish of the season at the weir.'),
              ('membership:member_of:House Thane:-') $$,
'Dorn reads the revealed link with its told line and Brenna''s open membership; not the rival, not her home (unshared)');

select is_empty($$
  select 1 from public.get_player_connections('10840000-0000-4000-8000-000000000010', 'npc',
    '10840000-0000-4000-8000-000000000030') where note is not null
$$, 'a player never reads the DM''s note');

select is_empty($$
  select 1 from public.get_player_world_ties('10840000-0000-4000-8000-000000000010')
   where from_name = 'Harl' or to_name = 'Harl' or from_name = 'Toll-men' or to_name = 'Toll-men'
$$, 'nothing about someone Dorn does not know, not even that a tie exists');

select is_empty($$
  select 1 from public.get_player_world_ties('10840000-0000-4000-8000-000000000010')
   where from_name = 'Sister Ama' and source = 'membership'
$$, 'a covert membership stays the DM''s though both ends are known, however its role is typed');

select is_empty($$
  select 1 from public.get_player_world_ties('10840000-0000-4000-8000-000000000010')
   where from_id = '10840000-0000-4000-8000-000000000033' and source = 'membership'
$$, 'a disguised NPC''s true allegiances stay the DM''s while the cover holds');

select results_eq($$
  select from_name from public.get_player_world_ties('10840000-0000-4000-8000-000000000010')
   where source = 'membership' and from_kind = 'party_member'
$$, $$ values ('Dorn Vale') $$,
'a character reads their own memberships, not another character''s');

select set_config('request.jwt.claim.sub', '10840000-0000-4000-8000-000000000004', true);
select is_empty($$ select 1 from public.get_connections('npc', '10840000-0000-4000-8000-000000000030') $$,
  'another campaign''s DM reads none of Brenna''s connections');
select throws_ok($$ select * from public.get_player_world_ties('10840000-0000-4000-8000-000000000010') $$,
  '42501', null, 'a stranger cannot read what a campaign''s players know');
select throws_ok($$ select * from public.get_player_world_ties('10840000-0000-4000-8000-000000000011',
  '10840000-0000-4000-8000-000000000020') $$,
  '22023', null, 'a DM cannot preview a character from another campaign');
select throws_ok($$ select * from public.get_player_connections('10840000-0000-4000-8000-000000000010', 'npc',
  '10840000-0000-4000-8000-000000000030') $$, '42501', null, 'nor one thing''s ties');
select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_npc_id, to_kind, to_npc_id, type) values
    ('10840000-0000-4000-8000-000000000004', '10840000-0000-4000-8000-000000000010',
     'npc', '10840000-0000-4000-8000-000000000030', 'npc', '10840000-0000-4000-8000-000000000031', 'friend')
$$, '42501', null, 'a stranger cannot write a link into the campaign');

select * from finish();
rollback;
