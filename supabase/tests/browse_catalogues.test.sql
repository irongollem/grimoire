begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- browse_monsters / browse_items / browse_spells (#972, migration
-- 20261004230629): one page of the Monsters, Vault and Spells lists, with the
-- rules the client used to apply to the whole catalogue in memory. Migration
-- 20261005001303 sends the summary on the first page only and adds `is_own`
-- to spells.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97250000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'browse-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97250000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'browse-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('97250000-0000-4000-8000-000000000010', '97250000-0000-4000-8000-000000000001', 'Browse');

insert into public.monsters (id, user_id, campaign_id, name, monster_type, size, created_at) values
  ('97250000-0000-4000-8000-000000000020', '97250000-0000-4000-8000-000000000001', null, 'Zz Old Owlkin', 'beast', 'Medium', now() - interval '3 days'),
  ('97250000-0000-4000-8000-000000000021', '97250000-0000-4000-8000-000000000001', '97250000-0000-4000-8000-000000000010', 'Zz New Owlkin', 'beast', 'Medium', now()),
  -- Another account's monster: never listed.
  ('97250000-0000-4000-8000-000000000022', '97250000-0000-4000-8000-000000000002', null, 'Zz Stranger Owlkin', 'beast', 'Medium', now());

-- The library rows the scope and shadowing tests stand on. The test makes its
-- own rather than borrowing seeded ones: CI's database is built from the
-- migrations alone, so its library tables are empty, and a fixture that copied
-- "whichever bundled item exists" inserted nothing there.
insert into public.library_monsters (id, name, monster_type, ruleset, conceptual_key, source, source_document_key, source_record_key) values
  ('browse_test_owlbear', 'Zz Library Owlbear', 'monstrosity', '2014', 'zz_library_owlbear', 'srd-2014', 'srd-2014', 'browse-test-owlbear');
insert into public.library_items (id, name, item_type, rarity, source, source_document_key, source_record_key) values
  ('browse_test_lantern', 'Zz Library Lantern', 'gear', 'mundane', 'grimoire-bundled', 'grimoire-bundled', 'browse-test-lantern');

-- An own item that is a customized copy of a library item (same identity keys).
insert into public.items (id, user_id, campaign_id, name, item_type, rarity, source, source_document_key, source_record_key)
select '97250000-0000-4000-8000-000000000030', '97250000-0000-4000-8000-000000000001', null, l.name || ' (mine)', l.item_type, l.rarity,
       l.source, l.source_document_key, l.source_record_key
  from public.library_items l
 where l.id = 'browse_test_lantern';

-- A custom spell copied from a library one counts as shared.
insert into public.spells (id, user_id, campaign_id, name, level, school, source_record_key) values
  ('97250000-0000-4000-8000-000000000040', '97250000-0000-4000-8000-000000000001', null, 'Zz Copied Bolt', 1, 'evocation', 'some-record'),
  ('97250000-0000-4000-8000-000000000041', '97250000-0000-4000-8000-000000000001', null, 'Zz Homebrew Bolt', 1, 'evocation', null);

-- A co-member's homebrew spell: spells_select lets the DM read it, but it is
-- not the DM's to edit or select.
insert into public.campaign_members (campaign_id, user_id, role) values
  ('97250000-0000-4000-8000-000000000010', '97250000-0000-4000-8000-000000000001', 'dm'),
  ('97250000-0000-4000-8000-000000000010', '97250000-0000-4000-8000-000000000002', 'player')
on conflict do nothing;
insert into public.spells (id, user_id, campaign_id, name, level, school) values
  ('97250000-0000-4000-8000-000000000042', '97250000-0000-4000-8000-000000000002', null, 'Yy Stranger Bolt', 1, 'evocation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97250000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"97250000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Monsters
select is(
  (select jsonb_agg(r ->> 'name' order by ord) from jsonb_array_elements(
     public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', 'owlkin') -> 'rows') with ordinality as x(r, ord)),
  '["Zz New Owlkin", "Zz Old Owlkin"]'::jsonb,
  'own monsters list in name order, and another account''s never'
);
select is(
  (public.browse_monsters(array[]::text[], '2014', null, 'owlkin') ->> 'total')::int,
  1,
  'with no campaign, only global own monsters are in scope'
);
select is(
  public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', null, 'all', null, 48, 0, 1) -> 'locked_ids',
  '["97250000-0000-4000-8000-000000000021"]'::jsonb,
  'the quota lock takes the newest own monsters, as the grid did'
);
select is(
  (public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', 'Owl%') ->> 'total')::int,
  0,
  'a % typed into the search is a character, not a wildcard'
);
select is(
  jsonb_array_length(public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', 'owlkin') -> 'selectable_ids'),
  2,
  'select-all covers every own row matching the filter, not only the page'
);
select is(
  jsonb_array_length(public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', 'owlkin', 'all', null, 1, 0) -> 'rows'),
  1,
  'the page is limited'
);
select ok(
  (public.browse_monsters(array['srd-2014'], '2014', '97250000-0000-4000-8000-000000000010') ->> 'scope_total')::int
    > (public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010') ->> 'scope_total')::int,
  'an enabled book adds its library monsters to the scope'
);

-- Items: an own copy shadows its library twin.
select is(
  (select count(*)::int from jsonb_array_elements(
     public.browse_items(array[]::text[], '2014', null, null, null, null, null, null, 5000) -> 'rows') r
    where r ->> 'id' = (select l.id from public.library_items l
                         join public.items i on i.source_document_key = l.source_document_key and i.source_record_key = l.source_record_key
                        where i.id = '97250000-0000-4000-8000-000000000030')),
  0,
  'an own item carrying a library item''s identity hides that library item'
);
select ok(
  exists (select 1 from jsonb_array_elements(
     public.browse_items(array[]::text[], '2014', null, '(mine)') -> 'rows') r
    where r ->> 'id' = '97250000-0000-4000-8000-000000000030'),
  'and lists itself'
);
select is(
  public.browse_items(array[]::text[], '2014', null, '(mine)', null, null, null, 'library') -> 'rows',
  '[]'::jsonb,
  'the library scope holds no own row'
);

-- Spells: a copy of a library spell is shared, homebrew is not.
select is(
  (select jsonb_agg(r ->> 'name' order by r ->> 'name') from jsonb_array_elements(
     public.browse_spells(array[]::text[], '2014', null, 'Zz', null, null, null, 'custom') -> 'rows') r),
  '["Zz Homebrew Bolt"]'::jsonb,
  'a custom spell carrying source_record_key is not "custom"'
);
select is(
  public.browse_spells(array[]::text[], '2014', null, 'Zz') -> 'selectable_ids',
  '["97250000-0000-4000-8000-000000000041"]'::jsonb,
  'and is not selectable'
);

select is(
  (select jsonb_agg(jsonb_build_array(r ->> 'name', r -> 'is_own')) from jsonb_array_elements(
     public.browse_spells(array[]::text[], '2014', null, 'Yy') -> 'rows') r),
  '[["Yy Stranger Bolt", false]]'::jsonb,
  'a co-member''s custom spell lists, marked as not the caller''s'
);
select is(
  public.browse_spells(array[]::text[], '2014', null, 'Yy') -> 'selectable_ids',
  '[]'::jsonb,
  'and select-all leaves it out'
);

-- The summary comes with the first page only.
select ok(
  public.browse_monsters(array[]::text[], '2014', '97250000-0000-4000-8000-000000000010', 'owlkin', 'all', null, 1, 0) ? 'total',
  'the first page carries the summary'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(
     public.browse_items(array[]::text[], '2014', null, null, null, null, null, null, 1, 1)) k),
  array['rows'],
  'a later page is its rows alone'
);

reset role;
select ok(not has_function_privilege('anon', 'public.browse_monsters(text[],text,uuid,text,text,text,int,int,int)', 'EXECUTE'), 'anon cannot browse');

select * from finish();
rollback;
