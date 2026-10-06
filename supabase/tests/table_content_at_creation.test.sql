-- A character in its player's pool may take the homebrew class or subclass of a
-- table that player sits at (migration 20261006112320). The creation wizard
-- writes the class row before the character is seated, so this is what lets a
-- player pick their table's own Arcana Domain at level 1.
--
-- What is held here, each refusal beside a control:
--
--   the table's own    homebrew a DM keeps for a table the writer sits at,
--                      and a DM's global homebrew, are taken
--   another table      homebrew the same DM keeps for a table the writer does
--                      not sit at is refused
--   a stranger         an account at none of the DM's tables takes none of it,
--                      for a subclass or a class
--   the helper         answers false, never NULL, for a character that is not there
--
--   1 Pat   player at c1                 3 Stan  plain account, at no table
--   2 Dana  DM of c1 and of c2

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('98100000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'table-content-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('98100000-0000-4000-8000-0000000000c1', '98100000-0000-4000-8000-000000000002', 'Dana''s first table', '2014'),
  ('98100000-0000-4000-8000-0000000000c2', '98100000-0000-4000-8000-000000000002', 'Dana''s second table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('98100000-0000-4000-8000-0000000000c1', '98100000-0000-4000-8000-000000000002', 'dm', 'Dana'),
  ('98100000-0000-4000-8000-0000000000c2', '98100000-0000-4000-8000-000000000002', 'dm', 'Dana'),
  ('98100000-0000-4000-8000-0000000000c1', '98100000-0000-4000-8000-000000000001', 'player', 'Pat')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset) values
  ('98100000-0000-4000-8000-0000000000b1', '98100000-0000-4000-8000-000000000002', '98100000-0000-4000-8000-0000000000c1', 'Cleric', 'Table Domain', '2014'),
  ('98100000-0000-4000-8000-0000000000b2', '98100000-0000-4000-8000-000000000002', null, 'Cleric', 'Global Domain', '2014'),
  ('98100000-0000-4000-8000-0000000000b3', '98100000-0000-4000-8000-000000000002', '98100000-0000-4000-8000-0000000000c2', 'Cleric', 'Other Table Domain', '2014');
insert into public.custom_classes (id, user_id, campaign_id, class_name, ruleset) values
  ('98100000-0000-4000-8000-0000000000a1', '98100000-0000-4000-8000-000000000002', '98100000-0000-4000-8000-0000000000c1', 'Table Class', '2014');

-- A pool character each for Pat and Stan: a 2014 Cleric on the built-in class,
-- no domain yet, which is where the creation wizard stands when it writes one.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, ruleset) values
  ('98100000-0000-4000-8000-0000000000e1', '98100000-0000-4000-8000-000000000001', '98100000-0000-4000-8000-000000000001', null, 'Pat''s cleric', 'Cleric', 1, '2014'),
  ('98100000-0000-4000-8000-0000000000e2', '98100000-0000-4000-8000-000000000003', '98100000-0000-4000-8000-000000000003', null, 'Stan''s cleric', 'Cleric', 1, '2014');
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select ('98100000-0000-4000-8000-0000000000d' || n)::uuid, ('98100000-0000-4000-8000-0000000000e' || n)::uuid, 'Cleric', 1, true,
  (select id from public.system_classes where ruleset = '2014' and class_name = 'Cleric'), 'system'
from generate_series(1, 2) as n;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"98100000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── Pat, at c1 ───────────────────────────────────────────────────────────────
select pg_temp.as_user(1);

select lives_ok($$
  update public.character_classes set subclass_name = 'Table Domain', subclass_definition_id = '98100000-0000-4000-8000-0000000000b1'
   where id = '98100000-0000-4000-8000-0000000000d1'
$$, 'a pool character takes the homebrew subclass its player''s table keeps');

select lives_ok($$
  update public.character_classes set subclass_name = 'Global Domain', subclass_definition_id = '98100000-0000-4000-8000-0000000000b2'
   where id = '98100000-0000-4000-8000-0000000000d1'
$$, 'and the global homebrew of a DM of that table');

select throws_ok($$
  update public.character_classes set subclass_name = 'Other Table Domain', subclass_definition_id = '98100000-0000-4000-8000-0000000000b3'
   where id = '98100000-0000-4000-8000-0000000000d1'
$$, 'P0001', 'Subclass definition is unavailable for ruleset 2014',
  'but not homebrew that DM keeps for a table the player does not sit at');

select lives_ok($$
  insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind, sort_order)
  values ('98100000-0000-4000-8000-0000000000e1', 'Table Class', 1, false, '98100000-0000-4000-8000-0000000000a1', 'custom', 1)
$$, 'a pool character takes the homebrew class its player''s table keeps');

-- ── Stan, at no table ────────────────────────────────────────────────────────
select pg_temp.as_user(3);

select throws_ok($$
  update public.character_classes set subclass_name = 'Table Domain', subclass_definition_id = '98100000-0000-4000-8000-0000000000b1'
   where id = '98100000-0000-4000-8000-0000000000d2'
$$, 'P0001', 'Subclass definition is unavailable for ruleset 2014',
  'a stranger cannot take a table''s homebrew subclass');

select throws_ok($$
  update public.character_classes set subclass_name = 'Global Domain', subclass_definition_id = '98100000-0000-4000-8000-0000000000b2'
   where id = '98100000-0000-4000-8000-0000000000d2'
$$, 'P0001', 'Subclass definition is unavailable for ruleset 2014',
  'nor a DM''s global homebrew when they sit at none of that DM''s tables');

select throws_ok($$
  insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind, sort_order)
  values ('98100000-0000-4000-8000-0000000000e2', 'Table Class', 1, false, '98100000-0000-4000-8000-0000000000a1', 'custom', 1)
$$, 'P0001', 'Class definition is unavailable for ruleset 2014',
  'nor a table''s homebrew class');

-- ── The helper ───────────────────────────────────────────────────────────────
reset role;
select is(private.character_may_take_definition('98100000-0000-4000-8000-0000000000ff', null, null), false,
  'a character that does not exist takes nothing, and the answer is false rather than NULL');

select * from finish();
rollback;
