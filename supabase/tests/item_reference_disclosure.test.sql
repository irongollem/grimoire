-- #964: a player may point at another member's private item only once the
-- campaign has been shown it, so get_player_visible_items() cannot be used to
-- read the DM's unrevealed items by naming their uuids. See migration
-- 20261003230336_item_reference_disclosure.sql for the rule and why.
begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

-- ── Structural ──────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'private.guard_inventory_item_shown()', 'execute')
  and not has_function_privilege('authenticated', 'private.guard_message_items_shown()', 'execute'),
  'the trigger functions are not executable by clients'
);

select is(
  private.item_shown_to_campaign('96400000-0000-4000-8000-0000000000ff', '96400000-0000-4000-8000-000000000010'),
  false,
  'the predicate answers false, never NULL, for an item that does not exist'
);

-- ── Fixture ─────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('96400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue964-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('96400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue964-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000001', 'Secrets');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.items (id, user_id, campaign_id, name, description) values
  ('96400000-0000-4000-8000-000000000020', '96400000-0000-4000-8000-000000000001', null, 'The plot macguffin', 'It is the villain''s phylactery.'),
  ('96400000-0000-4000-8000-000000000021', '96400000-0000-4000-8000-000000000001', null, 'Loot the DM hands out', 'A plain sword.'),
  ('96400000-0000-4000-8000-000000000022', '96400000-0000-4000-8000-000000000001', null, 'A vendor''s potion', 'Heals.'),
  ('96400000-0000-4000-8000-000000000023', '96400000-0000-4000-8000-000000000001', null, 'A crafted charm', 'Glows.'),
  ('96400000-0000-4000-8000-000000000024', '96400000-0000-4000-8000-000000000002', null, 'The player''s own heirloom', 'Theirs.'),
  ('96400000-0000-4000-8000-000000000025', '96400000-0000-4000-8000-000000000001', '96400000-0000-4000-8000-000000000010', 'The DM''s campaign secret', 'Also hidden.');

insert into public.npcs (id, user_id, campaign_id, name)
values ('96400000-0000-4000-8000-000000000050', '96400000-0000-4000-8000-000000000001', '96400000-0000-4000-8000-000000000010', 'The fence');
insert into public.campaign_messages (id, campaign_id, user_id, type, message, metadata)
values ('96400000-0000-4000-8000-000000000060', '96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000001', 'item_drop', 'dropped Sword',
        jsonb_build_object('item_id', '96400000-0000-4000-8000-000000000021', 'item_name', 'Sword', 'quantity', 1));

insert into public.crafting_recipes (id, user_id, campaign_id, name)
values ('96400000-0000-4000-8000-000000000030', '96400000-0000-4000-8000-000000000001', '96400000-0000-4000-8000-000000000010', 'Charm');
insert into public.crafting_recipe_outputs (recipe_id, item_id, quantity)
values ('96400000-0000-4000-8000-000000000030', '96400000-0000-4000-8000-000000000023', 1);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- ── The attack, both routes ─────────────────────────────────────────────────

select pg_temp.as_user('96400000-0000-4000-8000-000000000002');

select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'x', '96400000-0000-4000-8000-000000000020')
$$, '42501', null, 'a player cannot put the DM''s unrevealed item in the party inventory by naming its uuid');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'item_drop', 'dropped x',
          jsonb_build_object('item_id', '96400000-0000-4000-8000-000000000020', 'item_name', 'x', 'quantity', 1))
$$, '42501', null, 'nor post a drop naming it, which grab_item_drop would copy into the inventory');

-- The claim RPCs cast with ::uuid, which reads every spelling below; the guard
-- has to read them the same way (found in the pre-push audit).
select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'item_drop', 'dropped x',
          jsonb_build_object('item_id', '{96400000-0000-4000-8000-000000000020}', 'item_name', 'x', 'quantity', 1))
$$, '42501', null, 'nor spell the uuid in braces, which the claim RPCs still cast');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'item_drop', 'dropped x',
          jsonb_build_object('item_id', '96400000000040008000000000000020', 'item_name', 'x', 'quantity', 1))
$$, '42501', null, 'nor without hyphens');

-- A campaign-scoped item is only ever the DM's: only the DM writes one and
-- only its owner reads one (found in the pre-push audit).
select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'x', '96400000-0000-4000-8000-000000000025')
$$, '42501', null, 'nor name the DM''s unrevealed campaign-scoped item');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'loot_chest', 'a chest',
          jsonb_build_object('rolled_atoms', jsonb_build_array(jsonb_build_object('atom_id', 'a', 'item_id', '96400000-0000-4000-8000-000000000020'))))
$$, '42501', null, 'nor hide it in a loot chest atom');

select throws_ok($$
  select public.craft_apply('[]'::jsonb, 'success',
    jsonb_build_array(jsonb_build_object('campaign_id', '96400000-0000-4000-8000-000000000010', 'item_id', '96400000-0000-4000-8000-000000000020', 'name', 'x', 'quantity', 1)),
    null)
$$, '42501', null, 'nor smuggle it through craft_apply, which runs as the caller');

select lives_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'Heirloom', '96400000-0000-4000-8000-000000000024')
$$, 'positive control: a player adds their own vault item');

select lives_ok($$
  select public.craft_apply('[]'::jsonb, 'success',
    jsonb_build_array(jsonb_build_object('campaign_id', '96400000-0000-4000-8000-000000000010', 'item_id', '96400000-0000-4000-8000-000000000023', 'name', 'Charm', 'quantity', 1)),
    null)
$$, 'a player crafts the DM''s item that one of the campaign''s recipes makes');

select is(
  (select count(*)::int from public.get_player_visible_items() where id = '96400000-0000-4000-8000-000000000020'),
  0,
  'and the unrevealed item stays out of the player''s projection'
);

-- ── What the DM shows, the player may hold ──────────────────────────────────

select pg_temp.as_user('96400000-0000-4000-8000-000000000001');

select lives_ok($$
  insert into public.party_inventory (id, campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000040', '96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000001', 'Sword', '96400000-0000-4000-8000-000000000021')
$$, 'the DM puts their own item in the party inventory');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000001', 'vendor_offer', 'A potion for sale',
          jsonb_build_object('item_id', '96400000-0000-4000-8000-000000000022', 'item_name', 'Potion', 'description', 'Heals', 'pp', 0, 'gp', 1, 'ep', 0, 'sp', 0, 'cp', 0))
$$, 'and offers another for sale in chat');

select pg_temp.as_user('96400000-0000-4000-8000-000000000002');

select lives_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'Sword', '96400000-0000-4000-8000-000000000021')
$$, 'a player splits a stack of an item the party already holds');

select lives_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'Potion', '96400000-0000-4000-8000-000000000022')
$$, 'a player pays a vendor offer and takes the item it named');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, type, message, metadata)
  values ('96400000-0000-4000-8000-000000000010', '96400000-0000-4000-8000-000000000002', 'item_drop', 'dropped Sword',
          jsonb_build_object('item_id', '96400000-0000-4000-8000-000000000021', 'item_name', 'Sword', 'quantity', 1))
$$, 'a player drops an item the party holds, the DM''s included');

select lives_ok($$
  update public.party_inventory set quantity = 3 where id = '96400000-0000-4000-8000-000000000040'
$$, 'an edit that keeps the reference is not re-judged');

select throws_ok($$
  update public.party_inventory set item_id = '96400000-0000-4000-8000-000000000020' where id = '96400000-0000-4000-8000-000000000040'
$$, '42501', null, 'but re-pointing a row at the unrevealed item is');

-- ── Giving a drop to an NPC is the DM's move ───────────────────────────────

select throws_ok($$
  select public.claim_item_drop('96400000-0000-4000-8000-000000000060', 'The fence', null, '96400000-0000-4000-8000-000000000050')
$$, 'P0001', 'Only the DM can give a drop to an NPC', 'a player cannot claim a drop into an NPC''s inventory');

select pg_temp.as_user('96400000-0000-4000-8000-000000000001');
select lives_ok($$
  select public.claim_item_drop('96400000-0000-4000-8000-000000000060', 'The fence', null, '96400000-0000-4000-8000-000000000050')
$$, 'the DM can');

reset role;
select * from finish();
rollback;
