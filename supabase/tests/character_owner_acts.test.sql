-- Epic #943: the owner acts for a character, not whoever made it
-- (20261003105149).
--
-- A character has a creator (user_id) and an owner (owner_user_id). They
-- differ once a DM-made character is handed to a player. Eighteen functions
-- and eight policies admitted "creator or owner", so the account that made a
-- character kept its rights after handing it over; an audit rewrote another
-- player's hit points that way. The rule now: the owner, or the creator while
-- nobody owns it (and, where it was already so, the table's DM or the member
-- seated on it).
--
--   1 Dana  DM of c1            3 Rex  made e1, is now only a player at c1
--   2 Pia   owns e1 and e3      4 Zed  no part of c1
--
--   e1 made by Rex, owned by Pia, seated at c1
--   e2 made by Rex, owned by nobody, in no campaign
--   e3 made by Pia herself, seated at c1

begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('94700000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'owner-acts-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('94700000-0000-4000-8000-0000000000c1', '94700000-0000-4000-8000-000000000001', 'Dana''s table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('94700000-0000-4000-8000-0000000000c1', '94700000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('94700000-0000-4000-8000-0000000000c1', '94700000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('94700000-0000-4000-8000-0000000000c1', '94700000-0000-4000-8000-000000000003', 'player', 'Rex')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp) values
  ('94700000-0000-4000-8000-0000000000e1', '94700000-0000-4000-8000-000000000003', '94700000-0000-4000-8000-000000000002',
   '94700000-0000-4000-8000-0000000000c1', 'Handed over', 3, '2014', 20, 20),
  ('94700000-0000-4000-8000-0000000000e2', '94700000-0000-4000-8000-000000000003', null,
   null, 'Still Rex''s to give', 3, '2014', 20, 20),
  ('94700000-0000-4000-8000-0000000000e3', '94700000-0000-4000-8000-000000000002', '94700000-0000-4000-8000-000000000002',
   '94700000-0000-4000-8000-0000000000c1', 'Pia''s own', 3, '2014', 20, 20);
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select ('94700000-0000-4000-8000-0000000000f' || right(m.id::text, 1))::uuid, m.id, 'Fighter', 3, true, sc.id, 'system'
  from public.party_members m join public.system_classes sc on sc.ruleset = '2014' and sc.class_name = 'Fighter'
 where m.id::text like '94700000-%';

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"94700000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
create function pg_temp.pm(p_suffix text) returns public.party_members language sql security definer as $$
  select * from public.party_members where id = ('94700000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;

set local role authenticated;

-- Pia takes her seat on e1, so Rex (a member of the table) can still SEE it.
select pg_temp.as_user(2);
update public.campaign_members set party_member_id = '94700000-0000-4000-8000-0000000000e1'
 where campaign_id = '94700000-0000-4000-8000-0000000000c1' and user_id = '94700000-0000-4000-8000-000000000002';

-- ── The creator after a hand-over ────────────────────────────────────────────

select pg_temp.as_user(3);
select isnt_empty($$ select id from public.party_members where id = '94700000-0000-4000-8000-0000000000e1' $$,
  'control: the creator, a member of the table, still sees the character he handed over');
select throws_ok($$
  select public.apply_de_level('94700000-0000-4000-8000-0000000000e1', '{"max_hp": 1, "str": 3}'::jsonb, null, '{}')
$$, '42501', null, 'but he cannot level it down');
select throws_ok($$
  select public.apply_level_up('94700000-0000-4000-8000-0000000000e1', '{"level": 4}'::jsonb,
    '{"op": "update", "id": "94700000-0000-4000-8000-0000000000f1", "levels": 4}'::jsonb, '[]'::jsonb)
$$, '42501', null, 'or level it up');
select throws_ok($$ select public.take_spellcasting_rest('94700000-0000-4000-8000-0000000000e1', 'long') $$,
  'P0001', 'Access denied', 'or rest it');
select throws_ok($$ select public.acknowledge_ruleset_reviews('94700000-0000-4000-8000-0000000000e1', '{}'::text[]) $$,
  '42501', null, 'or acknowledge its edition reviews');
select is_empty($$
  update public.character_classes set hit_dice_used = 1
   where party_member_id = '94700000-0000-4000-8000-0000000000e1' returning id
$$, 'or write its class rows');
select is_empty($$
  delete from public.character_classes where party_member_id = '94700000-0000-4000-8000-0000000000e1' returning id
$$, 'or delete them');
select throws_ok($$
  insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('94700000-0000-4000-8000-0000000000e1', 'Wizard', 1, false,
          (select id from public.system_classes where ruleset = '2014' and class_name = 'Wizard'), 'system')
$$, '42501', null, 'or give it another class');
reset role;
select is((pg_temp.pm('e1')).max_hp || ' / ' || (pg_temp.pm('e1')).level || ' / ' || (pg_temp.pm('e1')).class, '20 / 3 / Fighter',
  'and the character is exactly as its owner left it');

-- ── The owner, and a creator whose character nobody owns yet ─────────────────

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$
  select public.apply_de_level('94700000-0000-4000-8000-0000000000e1', '{"max_hp": 19}'::jsonb, null, '{}')
$$, 'control: the owner acts for her character');
select isnt_empty($$
  update public.character_classes set hit_dice_used = 1
   where party_member_id = '94700000-0000-4000-8000-0000000000e1' returning id
$$, 'control: and writes its class rows');
select lives_ok($$ select public.acknowledge_ruleset_reviews('94700000-0000-4000-8000-0000000000e1', '{}'::text[]) $$,
  'control: and acknowledges its reviews');

select pg_temp.as_user(3);
select lives_ok($$
  select public.apply_de_level('94700000-0000-4000-8000-0000000000e2', '{"max_hp": 18}'::jsonb, null, '{}')
$$, 'control: a creator still acts for a character nobody owns');
select isnt_empty($$
  update public.character_classes set hit_dice_used = 1
   where party_member_id = '94700000-0000-4000-8000-0000000000e2' returning id
$$, 'control: and writes its class rows');

-- ── Class rows are read by whoever may read the character ────────────────────

select pg_temp.as_user(1);
select isnt_empty($$ select id from public.character_classes where party_member_id = '94700000-0000-4000-8000-0000000000e3' $$,
  'the DM reads the class of a character its player made herself (he is neither its creator nor its owner)');
select lives_ok($$
  select public.apply_de_level('94700000-0000-4000-8000-0000000000e3', '{"max_hp": 17}'::jsonb, null, '{}')
$$, 'control: and acts for it through the level RPCs, as the table''s DM');
select is_empty($$
  update public.character_classes set hit_dice_used = 2
   where party_member_id = '94700000-0000-4000-8000-0000000000e3' returning id
$$, 'but does not write its class rows directly');

select pg_temp.as_user(3);
select isnt_empty($$ select id from public.character_classes where party_member_id = '94700000-0000-4000-8000-0000000000e1' $$,
  'a member of the table reads the class of the seated character he can see');

select pg_temp.as_user(4);
select is_empty($$ select id from public.character_classes where party_member_id in
  ('94700000-0000-4000-8000-0000000000e1', '94700000-0000-4000-8000-0000000000e2', '94700000-0000-4000-8000-0000000000e3') $$,
  'a stranger reads none of them');
reset role;

-- ── The clause cannot be written again ───────────────────────────────────────
-- Body-based, like the admin guards: an outcome test covers only the functions
-- someone remembered to test, and what went wrong here was a clause copied
-- from sibling to sibling.

select is_empty($q$
  select p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosrc ~* '(\w+\.)?user_id\s*=\s*(auth\.uid\(\)|\(\s*select auth\.uid\(\)\s*\)|v_uid)\s+or\s+(\w+\.)?owner_user_id\s*='
$q$, 'no function admits "creator or owner"');
select is_empty($q$
  select pol.polrelid::regclass::text || '.' || pol.polname
    from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
         ~* '\.user_id = \( SELECT auth\.uid\(\) AS uid\)\) OR \(\w+\.owner_user_id = '
$q$, 'no policy admits "creator or owner"');
select is_empty($q$
  select pol.polrelid::regclass::text || '.' || pol.polname
    from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname <> 'party_members'
     and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
         ~* 'party_members\.user_id = \( SELECT auth\.uid\(\) AS uid\)'
     and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
         !~* 'owner_user_id IS NULL'
$q$, 'and none asks for a character''s creator alone');

select * from finish();
rollback;
