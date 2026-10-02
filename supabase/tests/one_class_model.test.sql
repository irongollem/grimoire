-- Epic #943 wave 5: a character's class has one shape (20261002151709).
--
-- What is held here:
--
--   pinned rows   every class row names its definition; a subclass is a
--                 definition too
--   the mirror    party_members.class / .subclass are the primary class row's
--                 names, kept by the database; a write to them is overwritten
--   classless     a character with no class rows has no class, and that is valid
--   one reader    nothing in the database reads the typed class as a class
--
--   1 Dana  DM of c1 (2014)        2 Pia  plays at c1

begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('94600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'one-class-model-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('94600000-0000-4000-8000-0000000000c1', '94600000-0000-4000-8000-000000000001', 'Dana''s table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('94600000-0000-4000-8000-0000000000c1', '94600000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('94600000-0000-4000-8000-0000000000c1', '94600000-0000-4000-8000-000000000002', 'player', 'Pia')
on conflict (campaign_id, user_id) do update set role = excluded.role;

create function pg_temp.pm(p_suffix text) returns public.party_members language sql security definer as $$
  select * from public.party_members where id = ('94600000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.class_id(p_edition text, p_name text) returns uuid language sql as $$
  select id from public.system_classes where ruleset = p_edition and class_name = p_name;
$$;

-- ── Classless is a valid state, and typed text is not a class ────────────────

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, class, subclass)
values ('94600000-0000-4000-8000-0000000000e1', '94600000-0000-4000-8000-000000000002', '94600000-0000-4000-8000-000000000002',
        null, 'Typed', 3, '2014', 'Sorcerer', 'Wild Magic');
select is((pg_temp.pm('e1')).class, null, 'a class written as text on a new character does not make it that class');
select is((pg_temp.pm('e1')).subclass, null, 'nor a subclass');
select is(public.sorcerer_level(pg_temp.pm('e1')), 0,
  'and nothing in the database takes the typed word for a class: a "Sorcerer" with no class row has no sorcerer level');

-- ── Every class row is pinned ────────────────────────────────────────────────

select col_not_null('public', 'character_classes', 'class_definition_id', 'a class row always names its definition');
select col_not_null('public', 'character_classes', 'class_definition_kind', 'and which kind of definition it is');
select throws_ok($$
  insert into public.character_classes (party_member_id, class_name, levels, is_primary)
  values ('94600000-0000-4000-8000-0000000000e1', 'Sorcerer', 3, true)
$$, '23502', null, 'a class row with only a name is refused');
select throws_ok($$
  insert into public.character_classes (party_member_id, class_name, subclass_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('94600000-0000-4000-8000-0000000000e1', 'Sorcerer', 'Wild Magic', 3, true, pg_temp.class_id('2014', 'Sorcerer'), 'system')
$$, '23514', null, 'so is a subclass with only a name');

-- ── The mirror follows the rows ──────────────────────────────────────────────

insert into public.custom_subclasses (id, user_id, class_name, subclass_name) values
  ('94600000-0000-4000-8000-000000000091', '94600000-0000-4000-8000-000000000002', 'Sorcerer', 'Wild Magic');
insert into public.character_classes
  (id, party_member_id, class_name, subclass_name, levels, is_primary, sort_order, class_definition_id, class_definition_kind, subclass_definition_id)
values ('94600000-0000-4000-8000-0000000000f1', '94600000-0000-4000-8000-0000000000e1', 'Sorcerer', 'Wild Magic', 3, true, 0,
        pg_temp.class_id('2014', 'Sorcerer'), 'system', '94600000-0000-4000-8000-000000000091');
select is((pg_temp.pm('e1')).class || ' / ' || (pg_temp.pm('e1')).subclass, 'Sorcerer / Wild Magic',
  'taking a class gives the character its class and subclass names');
select is(public.sorcerer_level(pg_temp.pm('e1')), 3, 'and a Sorcerer by its class row has its sorcerer level');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"94600000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select isnt_empty($$
  update public.party_members set class = 'Wizard', subclass = 'Evocation', notes = 'edited'
   where id = '94600000-0000-4000-8000-0000000000e1' returning id
$$, 'control: its owner can still edit the character');
reset role;
select is((pg_temp.pm('e1')).class || ' / ' || (pg_temp.pm('e1')).subclass || ' / ' || (pg_temp.pm('e1')).notes,
  'Sorcerer / Wild Magic / edited',
  'a client''s write to the typed class is overwritten by what the rows say, and the rest of the edit lands');

-- A second class: the primary row is the one mirrored, whichever was written last.
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, sort_order, class_definition_id, class_definition_kind)
values ('94600000-0000-4000-8000-0000000000f2', '94600000-0000-4000-8000-0000000000e1', 'Fighter', 1, false, 1,
        pg_temp.class_id('2014', 'Fighter'), 'system');
select is((pg_temp.pm('e1')).class, 'Sorcerer', 'a second class does not displace the primary one');
update public.character_classes set is_primary = false where id = '94600000-0000-4000-8000-0000000000f1';
update public.character_classes set is_primary = true where id = '94600000-0000-4000-8000-0000000000f2';
select is((pg_temp.pm('e1')).class, 'Fighter', 'making another class primary changes the name the character shows');
select is((pg_temp.pm('e1')).subclass, null, 'and its subclass, here none');

delete from public.character_classes where id = '94600000-0000-4000-8000-0000000000f2';
select is((pg_temp.pm('e1')).class, 'Sorcerer', 'losing a class falls back to the one that remains');
delete from public.character_classes where party_member_id = '94600000-0000-4000-8000-0000000000e1';
select is((pg_temp.pm('e1')).class, null, 'and losing the last one leaves the character without a class');

-- ── What a client can reach ──────────────────────────────────────────────────

select is_empty($q$
  select p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('mirror_party_member_class', 'refresh_party_member_class_mirror')
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
$q$, 'the mirror''s trigger functions are not callable by a client');

select * from finish();
rollback;
