begin;
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- A beat's rumour and reveal text are rich text and pass the secret-block strip
-- on the way to a player: a [secret] block and a lens pair's Deep half never
-- reach one, the Bright half and the open text do (#1115, 20261029074145).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('97300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bt-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bt-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('97300000-0000-4000-8000-000000000010', '97300000-0000-4000-8000-000000000001', 'Sothery');
insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('97300000-0000-4000-8000-000000000020', '97300000-0000-4000-8000-000000000002', '97300000-0000-4000-8000-000000000010', 'Pip', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('97300000-0000-4000-8000-000000000010', '97300000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('97300000-0000-4000-8000-000000000010', '97300000-0000-4000-8000-000000000002', 'player', 'P1', '97300000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('97300000-0000-4000-8000-000000000030', '97300000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000010', 'The Long Steep',
   array['97300000-0000-4000-8000-000000000020']::uuid[]);

-- Revealed: open text, a [secret] block, and a lens pair. Rumoured: an emptied editor.
insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, reveal_text, rumor_text) values
  ('97300000-0000-4000-8000-000000000040', '97300000-0000-4000-8000-000000000030', '97300000-0000-4000-8000-000000000010', 'The kettle', 'revealed',
   jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
     jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'The kettle sings.'))),
     jsonb_build_object('type', 'secretBlock', 'content', jsonb_build_array(
       jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'The Witch is listening.'))))),
     jsonb_build_object('type', 'lensPair', 'content', jsonb_build_array(
       jsonb_build_object('type', 'lensBright', 'content', jsonb_build_array(
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Tea is ready.'))))),
       jsonb_build_object('type', 'lensDeep', 'content', jsonb_build_array(
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Someone poured it for the last time.')))))))
   ))::text,
   null),
  ('97300000-0000-4000-8000-000000000041', '97300000-0000-4000-8000-000000000030', '97300000-0000-4000-8000-000000000010', 'The rumour', 'rumored',
   null, '{"type":"doc","content":[{"type":"paragraph"}]}');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── As Pip ───────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);

create temporary table seen on commit drop as
  select private.rich_text_plain(player_text) as words
    from public.get_player_visible_quest_beats('97300000-0000-4000-8000-000000000010')
   where id = '97300000-0000-4000-8000-000000000040';

select ok((select words like '%The kettle sings.%' and words like '%Tea is ready.%' from seen),
  'a player reads the open text and the Bright half');
select ok((select words not like '%Witch is listening%' from seen), 'but never the DM-only block');
select ok((select words not like '%last time%' from seen), 'nor the Deep half');

-- ── As the DM ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);

select ok(
  jsonb_path_exists((select reveal_text::jsonb from public.quest_beats where id = '97300000-0000-4000-8000-000000000040'),
                    'strict $.** ? (@.type == "secretBlock").attrs.secretId'),
  'the secret block in a beat is stamped with an id');

select is(
  (select jsonb_build_object('type', entity_type, 'id', entity_id, 'field', field, 'name', entity_name)
     from public.list_campaign_secrets('97300000-0000-4000-8000-000000000010')),
  jsonb_build_object('type', 'quest', 'id', '97300000-0000-4000-8000-000000000030', 'field', 'reveal_text', 'name', 'The Long Steep · The kettle'),
  'the beat''s secret is listed under its quest, so an NPC memory can name it');

create temporary table board on commit drop as
  select b from jsonb_array_elements(public.get_quest_board('97300000-0000-4000-8000-000000000010') -> 'beats') b;

select is((select (b ->> 'has_rumor_text')::boolean from board where b ->> 'id' = '97300000-0000-4000-8000-000000000041'), false,
  'an emptied editor is no rumour copy');
select is((select (b ->> 'has_reveal_text')::boolean from board where b ->> 'id' = '97300000-0000-4000-8000-000000000040'), true,
  'a beat with reveal text has reveal copy');

select * from finish();
rollback;
