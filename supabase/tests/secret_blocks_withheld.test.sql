-- #932 story 4: a "DM only" block inside shared rich text never reaches a
-- player. The server withholds it (20261007092700); the client is never asked
-- to hide it. Every assertion that a player is refused is paired with the
-- rightful caller succeeding on the same fixture, so a refusal cannot be a
-- broken fixture.
--
-- Cast (uuid suffix): 1 the DM of table c1, 2 Ada (player, character e1),
-- 3 Bo (player, character e2), 4 Sam (a stranger with a table of their own).
-- Everything at c1 is shared with Ada; Bo reaches the faction only by
-- belonging to it.

begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

-- ── The stripper on its own ─────────────────────────────────────────────────

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Shared"}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"The duke is the cult leader"}]}]}]}')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Shared"}]}]}'::jsonb,
  'a top-level secret block is removed and the shared text kept');

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"columns","content":[{"type":"column","content":[{"type":"secretBlock","content":[{"type":"paragraph"}]},{"type":"paragraph","content":[{"type":"text","text":"Left"}]}]}]}]}')::jsonb,
  '{"type":"doc","content":[{"type":"columns","content":[{"type":"column","content":[{"type":"paragraph","content":[{"type":"text","text":"Left"}]}]}]}]}'::jsonb,
  'a secret block nested inside other blocks is removed');

select is(
  private.withhold_secret_blocks($j${"type":"doc","content":[{"type":"secretBlock","content":[{"type":"paragraph"}]}]}$j$)::jsonb,
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  'an escaped spelling of the type name is decoded before it is compared, and an emptied document keeps one paragraph');

select is(
  private.withhold_secret_blocks(E'\n{"type":"doc","content":[{"type":"secretBlock","content":[{"type":"paragraph"}]},{"type":"paragraph"}]}')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  'leading whitespace JSON allows does not skip the strip');

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"secretBlock","content":[{"type":"paragraph"}]}]}]},{"type":"paragraph"}]}')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  'a container left empty by the strip goes with it, up the tree, leaving no blank where the secret was');

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"paragraph","attrs":{"x":{"type":"secretBlock"}}}]}'),
  null,
  'a secret block outside any content array survives the strip, so the value is withheld whole');

select is(
  private.withhold_secret_blocks('[DM] prose that opens with a bracket'),
  '[DM] prose that opens with a bracket',
  'prose that merely opens with a bracket is not mistaken for JSON');

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"secretBlock"'),
  null,
  'a value that names a secret block but does not parse is withheld whole');

select is(
  private.withhold_secret_blocks('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"No secrets"}]}]}'),
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"No secrets"}]}]}',
  'a document without a secret block comes back byte for byte');

select is(private.withhold_secret_blocks('<p>Legacy HTML</p>'), '<p>Legacy HTML</p>', 'legacy HTML passes through');
select is(private.withhold_secret_blocks(null), null, 'null stays null');

select ok(
  not has_function_privilege('authenticated', 'private.withhold_secret_blocks(text)', 'execute'),
  'no client role can call the stripper; only the definer projections use it');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93720000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'secrets-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000001', 'Table one'),
  ('93720000-0000-4000-8000-0000000000c2', '93720000-0000-4000-8000-000000000004', 'Sam''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('93720000-0000-4000-8000-0000000000c2', '93720000-0000-4000-8000-000000000004', 'dm', 'Sam')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('93720000-0000-4000-8000-0000000000e1', '93720000-0000-4000-8000-000000000002', '93720000-0000-4000-8000-000000000002', '93720000-0000-4000-8000-0000000000c1', 'Ada''s ranger', '2014'),
  ('93720000-0000-4000-8000-0000000000e2', '93720000-0000-4000-8000-000000000003', '93720000-0000-4000-8000-000000000003', '93720000-0000-4000-8000-0000000000c1', 'Bo''s bard', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000002', 'player', 'Ada', '93720000-0000-4000-8000-0000000000e1'),
  ('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000003', 'player', 'Bo',  '93720000-0000-4000-8000-0000000000e2');

-- One shared body with one secret, reused by every surface.
create temporary table secret_doc (body text) on commit drop;
insert into secret_doc values (
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Open text"}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"HIDDEN-PASSAGE"}]}]}]}'
);
grant select on secret_doc to authenticated;

insert into public.locations (id, user_id, campaign_id, name, location_type, is_description_shared, description, player_visible_to)
select '93720000-0000-4000-8000-000000000051', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1',
       'Duke''s manor', 'building', true, body, array['93720000-0000-4000-8000-0000000000e1']::uuid[]
  from secret_doc;

insert into public.notes (id, user_id, campaign_id, title, content, player_visible_to)
select '93720000-0000-4000-8000-000000000061', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1',
       'Rumours', body, array['93720000-0000-4000-8000-0000000000e1']::uuid[]
  from secret_doc;

insert into public.factions (id, user_id, campaign_id, name, description, player_visible_to)
select '93720000-0000-4000-8000-000000000071', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1',
       'The Lantern Guild', body, array['93720000-0000-4000-8000-0000000000e1']::uuid[]
  from secret_doc;
-- Bo is not shown the faction, but his character belongs to it.
insert into public.faction_party_members (faction_id, party_member_id, user_id) values
  ('93720000-0000-4000-8000-000000000071', '93720000-0000-4000-8000-0000000000e2', '93720000-0000-4000-8000-000000000001');

insert into public.puzzle_rooms (id, user_id, campaign_id, name, description, player_visible_to)
select '93720000-0000-4000-8000-000000000081', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1',
       'The mirror door', body, array['93720000-0000-4000-8000-0000000000e1']::uuid[]
  from secret_doc;

insert into public.items (id, user_id, campaign_id, name, description, content)
select '93720000-0000-4000-8000-000000000091', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1',
       'Sealed letter', body, body
  from secret_doc;
insert into public.party_inventory (campaign_id, user_id, name, item_id, is_identified) values
  ('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000001', 'Sealed letter',
   '93720000-0000-4000-8000-000000000091', true);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93720000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── Every projection withholds the block and keeps the rest ─────────────────

select pg_temp.as_user(2);

select is(
  (select description from public.get_player_visible_locations('93720000-0000-4000-8000-0000000000c1')
    where id = '93720000-0000-4000-8000-000000000051')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Open text"}]}]}'::jsonb,
  'a place''s shared description reaches the player without its secret block');

select is(
  (select content from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1')
    where id = '93720000-0000-4000-8000-000000000061')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Open text"}]}]}'::jsonb,
  'a shared note reaches the player without its secret block');

select is(
  (select description from public.get_player_visible_factions('93720000-0000-4000-8000-0000000000c1')
    where id = '93720000-0000-4000-8000-000000000071')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Open text"}]}]}'::jsonb,
  'a shared faction reaches the player without its secret block');

select is(
  (select description from public.get_player_visible_puzzles('93720000-0000-4000-8000-0000000000c1')
    where id = '93720000-0000-4000-8000-000000000081')::jsonb,
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Open text"}]}]}'::jsonb,
  'a shared puzzle reaches the player without its secret block');

select is(
  (select description || content from public.get_player_visible_items()
    where id = '93720000-0000-4000-8000-000000000091') like '%HIDDEN-PASSAGE%',
  false,
  'an item''s description and written contents reach the player without the secret block');

-- ── The tables no longer hand the row out ───────────────────────────────────

select is_empty(
  $$ select 1 from public.notes where id = '93720000-0000-4000-8000-000000000061' $$,
  'a player cannot select the note row itself, secret and all');
select is_empty(
  $$ select 1 from public.factions where id = '93720000-0000-4000-8000-000000000071' $$,
  'a player cannot select the faction row itself');

-- ── Refusals, each with its rightful caller above or below ──────────────────

select pg_temp.as_user(3);
select is_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1') $$,
  'a member the note was not shared with sees no note');
select is_empty(
  $$ select 1 from public.factions where id = '93720000-0000-4000-8000-000000000071' $$,
  'membership of a faction does not hand out its row either');
select isnt_empty(
  $$ select * from public.get_player_visible_factions('93720000-0000-4000-8000-0000000000c1') $$,
  'a member whose character belongs to the faction sees it through the projection');
select is_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e1') $$,
  'naming another character to preview as does not make a player a DM');

select pg_temp.as_user(4);
select is_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1') $$,
  'a stranger naming another table''s campaign sees no note');
select is_empty(
  $$ select * from public.get_player_visible_factions('93720000-0000-4000-8000-0000000000c1') $$,
  'a stranger naming another table''s campaign sees no faction');
select is_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e1') $$,
  'nor does naming a character to preview as make a stranger a DM (notes)');
select is_empty(
  $$ select * from public.get_player_visible_factions('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e1') $$,
  'nor does naming a character to preview as make a stranger a DM (factions)');

-- ── The DM: their own row whole, and an honest preview ──────────────────────

select pg_temp.as_user(1);
select ok(
  (select content from public.notes where id = '93720000-0000-4000-8000-000000000061') like '%HIDDEN-PASSAGE%',
  'the DM still reads their own note with the secret in it');
select ok(
  (select description from public.factions where id = '93720000-0000-4000-8000-000000000071') like '%HIDDEN-PASSAGE%',
  'the DM still reads the faction with the secret in it');
select isnt_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e1') $$,
  'the DM previewing as the character a note is shared with sees it');
select is(
  (select content from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e1')
    where id = '93720000-0000-4000-8000-000000000061') like '%HIDDEN-PASSAGE%',
  false,
  'and the preview withholds the secret exactly as the player''s own read does');
select is_empty(
  $$ select * from public.get_player_visible_notes('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e2') $$,
  'the DM previewing as a character the note was not shared with sees none');
select isnt_empty(
  $$ select * from public.get_player_visible_factions('93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-0000000000e2') $$,
  'the DM previewing as a member of the faction sees it');

-- ── Faction deities still resolve for the player the faction is shared with ─

reset role;
insert into public.deities (id, user_id, campaign_id, name) values
  ('93720000-0000-4000-8000-0000000000a1', '93720000-0000-4000-8000-000000000001', '93720000-0000-4000-8000-0000000000c1', 'The Lantern');
insert into public.faction_deities (faction_id, deity_id, campaign_id, user_id) values
  ('93720000-0000-4000-8000-000000000071', '93720000-0000-4000-8000-0000000000a1', '93720000-0000-4000-8000-0000000000c1', '93720000-0000-4000-8000-000000000001');
set local role authenticated;

select pg_temp.as_user(2);
select isnt_empty(
  $$ select 1 from public.faction_deities where faction_id = '93720000-0000-4000-8000-000000000071' $$,
  'a faction''s deity link still reaches the player the faction is shared with');

select pg_temp.as_user(4);
select is_empty(
  $$ select 1 from public.faction_deities where faction_id = '93720000-0000-4000-8000-000000000071' $$,
  'and not a stranger');

select * from finish();
rollback;
