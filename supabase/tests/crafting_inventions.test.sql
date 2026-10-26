-- #1103 story 5: AI invention on the experiment bench.
--
--   1 Dana (DM, campaign owner)   2 Pat (plays e2)   3 Quinn (plays e3)   4 Sam (stranger)
--   5 Erin (DM of another campaign)
-- Every refusal is paired with the right caller succeeding on the same fixture, so a pass
-- proves the guard and not a broken setup. Drafts are inserted as the table owner, the way the
-- invent-recipe edge function writes them (service role): clients hold no insert or update.

begin;

create extension if not exists pgtap with schema extensions;
select plan(71);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11030000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'crafting-inventions-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 5) as n;

insert into public.campaigns (id, user_id, name) values
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', 'Dana''s table'),
  ('11030000-0000-4000-8000-0000000000c2', '11030000-0000-4000-8000-000000000005', 'Erin''s table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset) values
  ('11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002',
   '11030000-0000-4000-8000-000000000002', '11030000-0000-4000-8000-0000000000c1', 'Pat''s smith', false, '2014'),
  ('11030000-0000-4000-8000-0000000000e3', '11030000-0000-4000-8000-000000000003',
   '11030000-0000-4000-8000-000000000003', '11030000-0000-4000-8000-0000000000c1', 'Quinn''s tinker', false, '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000002', 'player', 'Pat', '11030000-0000-4000-8000-0000000000e2'),
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000003', 'player', 'Quinn', '11030000-0000-4000-8000-0000000000e3')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.items (id, user_id, campaign_id, name, rarity, item_type, cost, tags) values
  ('11030000-0000-4000-8000-0000000000b1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Iron Ingot', 'uncommon', 'crafting_material', '5 gp', '{metal,iron}'),
  ('11030000-0000-4000-8000-0000000000b2', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Leather Strips', 'mundane', 'crafting_material', '2 sp', '{leather}');

-- Pat holds ingots (4), leather, and a typed-in row; Quinn holds leather.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by) values
  ('11030000-0000-4000-8000-0000000000a1', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b1', 'Iron Ingot', 4, '11030000-0000-4000-8000-0000000000e2'),
  ('11030000-0000-4000-8000-0000000000a2', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b2', 'Leather Strips', 2, '11030000-0000-4000-8000-0000000000e2'),
  ('11030000-0000-4000-8000-0000000000a3', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', null, 'Odd Trinket', 1, '11030000-0000-4000-8000-0000000000e2'),
  ('11030000-0000-4000-8000-0000000000a4', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b2', 'Leather Strips', 1, '11030000-0000-4000-8000-0000000000e3');

-- A realistic draft. p_new: false = an existing library output with a library and an item
-- ingredient; true = a new item and a new material.
create function pg_temp.draft(p_new boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'item', case when p_new then jsonb_build_object(
        'ref', null,
        'new', jsonb_build_object(
          'name', 'Clockwork Sparrow', 'item_type', 'gear', 'subtype', null, 'rarity', 'common',
          'cost', '40 gp', 'value_cp', 4000, 'weight', 1, 'flavor', 'A tiny brass bird.',
          'rules_text', 'It chirps when a creature enters the room.',
          'description', E'A tiny brass bird.\n\nIt chirps when a creature enters the room.',
          'requires_attunement', false, 'attunement_requirements', null, 'charges', null, 'recharge', null,
          'damage_rolls', null, 'armor_class', null, 'properties', jsonb_build_array('tiny'), 'tags', jsonb_build_array('clockwork')),
        'name', 'Clockwork Sparrow', 'rarity', 'common', 'item_type', 'gear', 'value_cp', 4000)
      else jsonb_build_object(
        'ref', jsonb_build_object('library_item_id', 'srd_a5e_aegis_of_the_eternal_moon'), 'new', null,
        'name', 'Aegis of the Eternal Moon', 'rarity', 'very_rare', 'item_type', 'armor', 'value_cp', 500100) end,
    'mechanics', case when p_new then jsonb_build_array(jsonb_build_object('kind', 'minor', 'text', 'Chirps on entry.')) else '[]'::jsonb end,
    'quantity', 1,
    'recipe', jsonb_build_object(
      'name', case when p_new then 'Clockwork Sparrow' else 'Moonlit Aegis' end,
      'description', 'Assembled at the bench.', 'dc', case when p_new then 12 else 21 end,
      'crafting_time', case when p_new then 5 else 125 end, 'crafting_time_unit', 'days',
      'requires_proficiency', not p_new),
    'ingredients', case when p_new then jsonb_build_array(
        jsonb_build_object('ref', null,
          'new', jsonb_build_object('name', 'Singing Wire', 'item_type', 'crafting_material', 'rarity', 'uncommon',
                                    'cost', '50 gp', 'value_cp', 5000, 'description', 'Wire that hums.', 'tags', jsonb_build_array('wire')),
          'name', 'Singing Wire', 'rarity', 'uncommon', 'value_cp', 5000, 'quantity', 2),
        jsonb_build_object('ref', jsonb_build_object('item_id', '11030000-0000-4000-8000-0000000000b2'), 'new', null,
          'name', 'Leather Strips', 'rarity', 'mundane', 'value_cp', 20, 'quantity', 3))
      else jsonb_build_array(
        jsonb_build_object('ref', jsonb_build_object('library_item_id', 'srd_a5e_aerodite_the_autumn_queen_s_true_name'), 'new', null,
          'name', 'Aerodite', 'rarity', 'uncommon', 'value_cp', 10100, 'quantity', 1),
        jsonb_build_object('ref', jsonb_build_object('item_id', '11030000-0000-4000-8000-0000000000b1'), 'new', null,
          'name', 'Iron Ingot', 'rarity', 'uncommon', 'value_cp', 500, 'quantity', 2)) end,
    'materials_value_cp', 11100, 'value_multiple', 2, 'value_limit_cp', 22200,
    'rarity_ceiling', 'common', 'adjustments', '[]'::jsonb, 'warnings', '[]'::jsonb);
$$;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11030000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

create function pg_temp.ctx(p_member text, p_rows text[], p_discipline text default 'smithing') returns jsonb language sql as $$
  select public.craft_invention_context(('11030000-0000-4000-8000-0000000000' || p_member)::uuid, p_discipline,
    array(select ('11030000-0000-4000-8000-0000000000' || r)::uuid from unnest(p_rows) as r));
$$;

-- Drafts i1 (library output), i2 (new item + new material): Pat's. i3: Pat's, to be deleted.
-- i4: Pat's, already with the DM. i5: Quinn's, so Pat can be shown not to see it.
-- The drafts name two shared-library items. The local stack holds them once the library is synced; CI's fresh
-- database does not, and the approval rightly refuses an item it cannot find, so the test brings its own.
insert into public.library_items (id, name, item_type, rarity, source, source_document_key, source_record_key) values
  ('srd_a5e_aegis_of_the_eternal_moon', 'Aegis of the Eternal Moon', 'armor', 'very_rare', 'a5e', 'a5e-test', 'aegis-test'),
  ('srd_a5e_aerodite_the_autumn_queen_s_true_name', 'Aerodite the Autumn Queen''s True Name', 'wondrous_item', 'uncommon',
   'a5e', 'a5e-test', 'aerodite-test')
on conflict (id) do nothing;

insert into public.crafting_inventions (id, campaign_id, party_member_id, user_id, discipline, mode, wish, draft, status, ai_provenance) values
  ('11030000-0000-4000-8000-0000000000f1', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'A moonlit aegis', pg_temp.draft(false), 'draft', '{"model":"test"}'),
  ('11030000-0000-4000-8000-0000000000f2', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'tinkering', 'idea', 'A singing bird', pg_temp.draft(true), 'draft', '{"model":"test"}'),
  ('11030000-0000-4000-8000-0000000000f3', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'Something', pg_temp.draft(true), 'draft', '{"model":"test"}'),
  ('11030000-0000-4000-8000-0000000000f4', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'Something else', pg_temp.draft(true), 'pending', '{"model":"test"}'),
  ('11030000-0000-4000-8000-0000000000f5', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e3', '11030000-0000-4000-8000-000000000003', 'smithing', 'idea', 'Quinn''s idea', pg_temp.draft(true), 'draft', '{"model":"test"}');

set local role authenticated;

-- ── craft_invention_context ──────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.craft_invention_context('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$, '42501', 'Not authorized', 'a stranger cannot read a bench');
select pg_temp.as_user(3);
select throws_ok($$ select public.craft_invention_context('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$, '42501', 'Not authorized', 'another player cannot use Pat''s character');
select pg_temp.as_user(1);
select throws_ok($$ select public.craft_invention_context('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$, '42501', 'Not authorized', 'the DM, seated on no character, cannot use Pat''s character');

select pg_temp.as_user(2);
select throws_ok($$ select pg_temp.ctx('e2', array['a4']) $$, 'CX001', 'Those items cannot be laid out', 'Pat cannot lay out a row Quinn carries');
select throws_ok($$ select pg_temp.ctx('e2', array['a3']) $$, 'CX001', 'Those items cannot be laid out', 'a typed-in row cannot be an ingredient');
select throws_ok($$ select pg_temp.ctx('e2', array['a1','a1','a1','a1','a2','a2','a2','a2','a2']) $$, '22023', 'Lay out between one and eight items', 'more than eight dishes is refused');
select throws_ok($$ select pg_temp.ctx('e2', array['a1'], '  ') $$, '22023', 'Choose a discipline', 'a blank discipline is refused');
select throws_ok($$ select pg_temp.ctx('e2', array['a1'], 'basketweaving') $$, '22023', 'Choose a discipline', 'an unknown discipline is refused');
select is((select pg_temp.ctx('e2', array[]::text[]) -> 'bench'), '[]'::jsonb, 'an empty bench is allowed (idea mode) and returns no materials');

select is((select pg_temp.ctx('e2', array['a1','a1','a2']) ->> 'campaign_id'), '11030000-0000-4000-8000-0000000000c1', 'Pat gets the campaign');
select is((select pg_temp.ctx('e2', array['a1','a1','a2']) ->> 'value_multiple')::numeric, 2::numeric, 'the value multiple defaults to 2');
select is((select jsonb_array_length(pg_temp.ctx('e2', array['a1','a1','a2']) -> 'bench')), 2, 'two distinct rows make two bench entries');
select is((select pg_temp.ctx('e2', array['a1','a1','a2']) -> 'bench' -> 0 ->> 'name'), 'Iron Ingot', 'a bench entry carries the name');
select is((select pg_temp.ctx('e2', array['a1','a1','a2']) -> 'bench' -> 0 ->> 'rarity'), 'uncommon', 'a bench entry carries the rarity');
select is((select pg_temp.ctx('e2', array['a1','a1','a2']) -> 'bench' -> 0 ->> 'cost'), '5 gp', 'a bench entry carries the cost');
select is((select (pg_temp.ctx('e2', array['a1','a1','a2']) -> 'bench' -> 0 ->> 'dishes')::int), 2, 'a bench entry counts its dishes');

-- The rule: a configured multiple, then switched off.
reset role;
insert into public.campaign_rules (campaign_id, rule_key, enabled, config)
values ('11030000-0000-4000-8000-0000000000c1', 'crafting_ai_invention', true, '{"value_multiple": 3}');
set local role authenticated;
select pg_temp.as_user(2);
select is((select pg_temp.ctx('e2', array['a1']) ->> 'value_multiple')::numeric, 3::numeric, 'the value multiple is read from the rule''s config');
reset role;
update public.campaign_rules set config = '{"value_multiple": "lots"}' where campaign_id = '11030000-0000-4000-8000-0000000000c1' and rule_key = 'crafting_ai_invention';
set local role authenticated;
select pg_temp.as_user(2);
select is((select pg_temp.ctx('e2', array['a1']) ->> 'value_multiple')::numeric, 2::numeric, 'a non-numeric value multiple reads as 2');
reset role;
update public.campaign_rules set config = '{"value_multiple": 9}' where campaign_id = '11030000-0000-4000-8000-0000000000c1' and rule_key = 'crafting_ai_invention';
set local role authenticated;
select pg_temp.as_user(2);
select is((select pg_temp.ctx('e2', array['a1']) ->> 'value_multiple')::numeric, 5::numeric, 'a value multiple of 9 reads as the rule''s cap of 5');
reset role;
update public.campaign_rules set enabled = false
 where campaign_id = '11030000-0000-4000-8000-0000000000c1' and rule_key = 'crafting_ai_invention';
set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$ select pg_temp.ctx('e2', array['a1']) $$, 'CX002', 'Invention is turned off in this campaign', 'a campaign that turned invention off refuses');
reset role;
delete from public.campaign_rules
 where campaign_id = '11030000-0000-4000-8000-0000000000c1' and rule_key = 'crafting_ai_invention';
set local role authenticated;

-- ── Row security ─────────────────────────────────────────────────────────────
select pg_temp.as_user(2);
select is((select count(*)::int from public.crafting_inventions), 4, 'Pat reads her own four drafts');
select is((select count(*)::int from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f5'), 0, 'Pat does not see Quinn''s draft');
select pg_temp.as_user(3);
select is((select count(*)::int from public.crafting_inventions), 1, 'Quinn reads only his own draft');
select is_empty($$ select 1 from public.crafting_inventions where user_id = '11030000-0000-4000-8000-000000000002' $$, 'Quinn sees none of Pat''s drafts');
select pg_temp.as_user(4);
select is_empty($$ select 1 from public.crafting_inventions $$, 'a stranger sees nothing');
select pg_temp.as_user(1);
select is((select count(*)::int from public.crafting_inventions), 5, 'the DM reads the whole campaign''s drafts');

select pg_temp.as_user(2);
select throws_ok(
  $$ insert into public.crafting_inventions (campaign_id, party_member_id, user_id, discipline, mode, wish, draft, ai_provenance)
     values ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'x', '{}', '{}') $$,
  '42501', null, 'a client cannot insert a draft');
-- No update policy: the statement matches no row (or, where the role holds no UPDATE grant,
-- is refused outright); either way nothing changes.
create function pg_temp.try_update(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when insufficient_privilege then null;
end;
$$;
select pg_temp.try_update($$ update public.crafting_inventions set status = 'approved', decided_at = now() where id = '11030000-0000-4000-8000-0000000000f1' $$);
select pg_temp.as_user(1);
select pg_temp.try_update($$ update public.crafting_inventions set draft = '{}' where id = '11030000-0000-4000-8000-0000000000f1' $$);
reset role;
select is((select status || '|' || (draft ? 'item')::text from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f1'),
  'draft|true', 'neither the asker nor the DM can update a draft directly');
set local role authenticated;

select pg_temp.as_user(3);
delete from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f3';
reset role;
select is((select count(*)::int from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f3'), 1, 'another player cannot delete Pat''s draft');
set local role authenticated;
select pg_temp.as_user(2);
delete from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f3';
reset role;
select is((select count(*)::int from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f3'), 0, 'the asker can delete their own draft');
set local role authenticated;

-- ── submit_crafting_invention ────────────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1') $$, '42501', 'Not authorized', 'another player cannot send Pat''s draft');
select pg_temp.as_user(4);
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1') $$, '42501', 'Not authorized', 'a stranger cannot send Pat''s draft');
select pg_temp.as_user(1);
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1') $$, '42501', 'Not authorized', 'the DM cannot send a player''s draft on their behalf');
select pg_temp.as_user(2);
select is((select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1') ->> 'status'), 'pending', 'the asker sends the draft to the DM');
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1') $$, 'CX003', 'Only a draft can be sent', 'a draft already with the DM cannot be sent again');

-- ── decide_crafting_invention ────────────────────────────────────────────────
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'approve') $$, '42501', 'Not authorized', 'the player cannot approve their own draft');
select pg_temp.as_user(4);
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'approve') $$, '42501', 'Not authorized', 'a stranger cannot decide');
select pg_temp.as_user(1);
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'bogus') $$, '22023', 'Decide approve or return', 'a decision other than approve or return is refused');

select is((select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'return', '  Make it lighter.  ') ->> 'status'), 'draft', 'the DM sends the draft back');
reset role;
select is((select status || '|' || dm_note from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f1'), 'draft|Make it lighter.', 'a returned draft is a draft again, with the DM''s trimmed note');
set local role authenticated;
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'approve') $$, 'CX003', 'Only a draft sent to you can be decided', 'a draft not with the DM cannot be approved');

select pg_temp.as_user(2);
select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f1');
select pg_temp.as_user(1);
select is((select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'approve') ->> 'status'), 'approved', 'the DM approves the library-output draft');
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f1', 'approve') $$, 'CX003', 'Only a draft sent to you can be decided', 'an approved draft cannot be decided again');

reset role;
select is((select status from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f1'), 'approved', 'the row is approved');
select isnt((select recipe_id from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f1'), null, 'the row names its recipe');
select is((select dm_note from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f1'), null, 'approval clears the DM''s note');
select is(
  (select row(r.name, r.dc, r.crafting_time, r.crafting_time_unit, r.discipline, r.discoverable, r.requires_proficiency, r.player_visible_to, r.user_id, r.ai_provenance is not null)::text
     from public.crafting_recipes r join public.crafting_inventions i on i.recipe_id = r.id
    where i.id = '11030000-0000-4000-8000-0000000000f1'),
  row('Moonlit Aegis', 21, 125, 'days', 'smithing', false, true, '{11030000-0000-4000-8000-0000000000e2}'::uuid[], '11030000-0000-4000-8000-000000000001'::uuid, true)::text,
  'the recipe carries the draft''s name, dc and time, is requires proficiency (as drafted), is shared with the character only, and is owned by the campaign owner with provenance');
select is(
  (select o.library_item_id || '|' || o.quantity from public.crafting_recipe_outputs o join public.crafting_inventions i on i.recipe_id = o.recipe_id where i.id = '11030000-0000-4000-8000-0000000000f1'),
  'srd_a5e_aegis_of_the_eternal_moon|1', 'the output keeps its library reference');
select is(
  (select string_agg(coalesce(g.library_item_id, g.item_id::text) || 'x' || g.quantity, ',' order by g.position)
     from public.crafting_recipe_ingredients g join public.crafting_inventions i on i.recipe_id = g.recipe_id where i.id = '11030000-0000-4000-8000-0000000000f1'),
  'srd_a5e_aerodite_the_autumn_queen_s_true_namex1,11030000-0000-4000-8000-0000000000b1x2', 'the ingredients keep their library and item references and quantities');

select is((select r.requires_proficiency from public.crafting_recipes r join public.crafting_inventions i on i.recipe_id = r.id where i.id = '11030000-0000-4000-8000-0000000000f1'), true, 'the magic recipe requires proficiency');

-- The new-item draft.
set local role authenticated;
select pg_temp.as_user(2);
select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f2');
select pg_temp.as_user(1);
select is((select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f2', 'approve') ->> 'status'), 'approved', 'the DM approves the new-item draft');
reset role;
select is(
  (select row(i.name, i.item_type, i.rarity, i.cost, i.user_id, i.campaign_id, i.ai_provenance is not null, i.tags)::text
     from public.items i where i.name = 'Clockwork Sparrow'),
  row('Clockwork Sparrow', 'gear', 'common', '40 gp', '11030000-0000-4000-8000-000000000001'::uuid, '11030000-0000-4000-8000-0000000000c1'::uuid, true, '{clockwork}'::text[])::text,
  'the new item exists in the campaign, owned by the campaign owner, with provenance');
select is(
  (select row(i.item_type, i.rarity, i.cost, i.user_id, i.ai_provenance is not null)::text from public.items i where i.name = 'Singing Wire'),
  row('crafting_material', 'uncommon', '50 gp', '11030000-0000-4000-8000-000000000001'::uuid, true)::text,
  'the new material exists as a crafting material owned by the campaign owner, with provenance');
select is(
  (select o.item_id from public.crafting_recipe_outputs o join public.crafting_inventions v on v.recipe_id = o.recipe_id where v.id = '11030000-0000-4000-8000-0000000000f2'),
  (select id from public.items where name = 'Clockwork Sparrow'), 'the recipe''s output is the new item');
select is(
  (select string_agg(g.item_id::text || 'x' || g.quantity, ',' order by g.position)
     from public.crafting_recipe_ingredients g join public.crafting_inventions v on v.recipe_id = g.recipe_id where v.id = '11030000-0000-4000-8000-0000000000f2'),
  (select (select id::text from public.items where name = 'Singing Wire') || 'x2,11030000-0000-4000-8000-0000000000b2x3'),
  'the recipe''s ingredients are the new material and the existing item, in order');

select is((select r.requires_proficiency from public.crafting_recipes r join public.crafting_inventions i on i.recipe_id = r.id where i.id = '11030000-0000-4000-8000-0000000000f2'), false, 'the mundane recipe does not');

-- ── The audit's guards ───────────────────────────────────────────────────────
select pg_temp.as_user(1);
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f4', null) $$, '22023', 'Decide approve or return', 'a NULL decision is refused, not read as a send-back');
select pg_temp.as_user(5);
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f4', 'approve') $$, '42501', 'Not authorized', 'the DM of another campaign cannot decide');

-- anon holds no execute on any of the three.
set local role anon;
select throws_ok($$ select public.craft_invention_context('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$, '42501', null, 'anon cannot read a bench');
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f4') $$, '42501', null, 'anon cannot send a draft');
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f4', 'approve') $$, '42501', null, 'anon cannot decide');
reset role;

-- Table-level triggers, as the owner (the service-role path).
select throws_ok($$ update public.crafting_inventions set draft = '{}' where id = '11030000-0000-4000-8000-0000000000f4' $$, 'CX003', 'A draft sent to the DM cannot be revised', 'a pending draft cannot be revised');
insert into public.crafting_inventions (id, campaign_id, party_member_id, user_id, discipline, mode, wish, draft, status, ai_provenance) values
  ('11030000-0000-4000-8000-0000000000f6', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'Revisable', pg_temp.draft(true), 'draft', '{"model":"test"}');
select lives_ok($$ update public.crafting_inventions set draft = pg_temp.draft(false), revision = 2 where id = '11030000-0000-4000-8000-0000000000f6' $$, 'a draft still with the player can be revised');
select throws_ok(
  $$ insert into public.crafting_inventions (campaign_id, party_member_id, user_id, discipline, mode, wish, draft, ai_provenance)
     values ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e3', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'x', pg_temp.draft(true), '{}') $$,
  '23514', 'Invention does not match the asker''s seat', 'a draft naming a character the asker is not seated on is refused');

-- Approval refuses a reference into another campaign, and nothing materialises.
insert into public.items (id, user_id, campaign_id, name) values
  ('11030000-0000-4000-8000-0000000000b9', '11030000-0000-4000-8000-000000000005', '11030000-0000-4000-8000-0000000000c2', 'Erin''s Secret');
insert into public.crafting_inventions (id, campaign_id, party_member_id, user_id, discipline, mode, wish, draft, status, ai_provenance) values
  ('11030000-0000-4000-8000-0000000000f7', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002', 'smithing', 'idea', 'Poisoned',
   jsonb_set(pg_temp.draft(false), '{item,ref}', '{"item_id":"11030000-0000-4000-8000-0000000000b9"}'), 'pending', '{"model":"test"}');
set local role authenticated;
select pg_temp.as_user(1);
select throws_ok($$ select public.decide_crafting_invention('11030000-0000-4000-8000-0000000000f7', 'approve') $$, '42501', 'The draft names an item outside this campaign', 'approval refuses an output from another campaign');
reset role;
select is((select status || '|' || (recipe_id is null)::text from public.crafting_inventions where id = '11030000-0000-4000-8000-0000000000f7'), 'pending|true', 'the refused draft stays pending with no recipe');

-- A caretaker (#1059) minding Pat's character: seated on it, not its owner.
set local role authenticated;
select pg_temp.as_user(2);
insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
values ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000003');
select pg_temp.as_user(3);
update public.campaign_members set party_member_id = '11030000-0000-4000-8000-0000000000e2'
 where campaign_id = '11030000-0000-4000-8000-0000000000c1' and user_id = '11030000-0000-4000-8000-000000000003';
select is((select party_member_id from public.campaign_members
            where campaign_id = '11030000-0000-4000-8000-0000000000c1' and user_id = '11030000-0000-4000-8000-000000000003'),
  '11030000-0000-4000-8000-0000000000e2'::uuid, 'Quinn has taken Pat''s character up');
select throws_ok($$ select public.craft_invention_context('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$, '42501', 'Not authorized', 'a caretaker cannot read the bench');
select throws_ok($$ select public.submit_crafting_invention('11030000-0000-4000-8000-0000000000f6') $$, '42501', 'Not authorized', 'a caretaker cannot send the owner''s draft');

-- ── The shared guard, smoke-checked through craft_experiment ────────────────
set local role authenticated;
select pg_temp.as_user(4);
select throws_ok(
  $$ select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$,
  '42501', 'Not authorized', 'craft_experiment still refuses a stranger');
select pg_temp.as_user(2);
select is((select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) ->> 'result'), 'none', 'and still answers Pat');

select * from finish();
rollback;
