begin;
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- A handout that embeds a deity or a faction shares it with its recipients, as
-- one embedding a place does; species and subclasses are rules text and share
-- nothing (#1115 story 7, 20261029011624).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('97100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hf-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hf-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000001', 'Sothery'),
  ('97100000-0000-4000-8000-000000000011', '97100000-0000-4000-8000-000000000001', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('97100000-0000-4000-8000-000000000030', '97100000-0000-4000-8000-000000000002', '97100000-0000-4000-8000-000000000010', 'Pip', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97100000-0000-4000-8000-000000000011', '97100000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000002', 'player', 'P1', '97100000-0000-4000-8000-000000000030')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- A deity left automatic, a faction set not to reveal, a faction from another
-- campaign, and a species.
insert into public.deities (id, user_id, campaign_id, name) values
  ('97100000-0000-4000-8000-000000000020', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'The Kettle Witch');
insert into public.factions (id, user_id, campaign_id, name) values
  ('97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'The Cabal'),
  ('97100000-0000-4000-8000-000000000041', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000011', 'Elsewhere Guild');
insert into public.species (id, user_id, campaign_id, name) values
  ('97100000-0000-4000-8000-000000000050', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'Sippet');

insert into public.scriptorium_documents (id, user_id, campaign_id, title, content) values
  ('97100000-0000-4000-8000-000000000080', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'Who keeps the roads',
   jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'deity', 'entityId', '97100000-0000-4000-8000-000000000020', 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'faction', 'entityId', '97100000-0000-4000-8000-000000000040', 'reveal', jsonb_build_object('off', true))),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'faction', 'entityId', '97100000-0000-4000-8000-000000000041', 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'species', 'entityId', '97100000-0000-4000-8000-000000000050', 'reveal', null))
   ))::text),
  -- The faction alone, automatic: the positive control for the "off" above.
  ('97100000-0000-4000-8000-000000000081', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'The Cabal''s March',
   jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'faction', 'entityId', '97100000-0000-4000-8000-000000000040', 'reveal', null))
   ))::text);

-- ── As the DM ──────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '97100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table dry on commit drop as
  select public.share_handout('97100000-0000-4000-8000-000000000080',
                              array['97100000-0000-4000-8000-000000000030']::uuid[], true) as r;

select is(
  (select r -> 'revealed' from dry),
  jsonb_build_array(jsonb_build_object('type', 'deity', 'id', '97100000-0000-4000-8000-000000000020', 'name', 'The Kettle Witch')),
  'a dry run reports the deity as shared, and nothing for the species');

select is(
  (select jsonb_path_query_array(r, '$.withheld[*] ? (@.type == "faction")') from dry),
  jsonb_build_array(
    jsonb_build_object('type', 'faction', 'id', '97100000-0000-4000-8000-000000000040', 'name', 'The Cabal', 'reason', 'not_revealed'),
    jsonb_build_object('type', 'faction', 'id', '97100000-0000-4000-8000-000000000041', 'reason', 'outside_campaign')),
  'and withholds the faction set not to reveal and the other campaign''s faction');

select is(
  (select player_visible_to from public.deities where id = '97100000-0000-4000-8000-000000000020'),
  '{}'::uuid[], 'a dry run writes nothing');

select lives_ok(
  $$ select public.share_handout('97100000-0000-4000-8000-000000000080',
                                 array['97100000-0000-4000-8000-000000000030']::uuid[]) $$,
  'the DM shares the page with Pip');

select is(
  (select player_visible_to from public.deities where id = '97100000-0000-4000-8000-000000000020'),
  array['97100000-0000-4000-8000-000000000030']::uuid[], 'the deity is now shared with Pip');

select is(
  (select player_visible_to from public.factions where id = '97100000-0000-4000-8000-000000000040'),
  '{}'::uuid[], 'the faction set not to reveal stays the DM''s');

select is(
  (select player_visible_to from public.factions where id = '97100000-0000-4000-8000-000000000041'),
  '{}'::uuid[], 'a faction from another campaign is never touched');

select lives_ok(
  $$ select public.share_handout('97100000-0000-4000-8000-000000000081',
                                 array['97100000-0000-4000-8000-000000000030']::uuid[]) $$,
  'the DM shares the march, which links the faction automatically');

select is(
  (select player_visible_to from public.factions where id = '97100000-0000-4000-8000-000000000040'),
  array['97100000-0000-4000-8000-000000000030']::uuid[], 'a faction left automatic is shared with Pip');

-- ── As Pip ─────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '97100000-0000-4000-8000-000000000002', true);

select is(
  (select name from public.deities where id = '97100000-0000-4000-8000-000000000020'),
  'The Kettle Witch', 'Pip can now read the deity the handout embeds');

select * from finish();
rollback;
