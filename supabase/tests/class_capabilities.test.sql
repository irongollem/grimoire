-- #934 story 9: Wild Shape comes from the class definition's capabilities, not
-- the class name, and every character class row carries its definition's list.
-- #1147: Jack of All Trades rides the same capability list.
--
--   1 Dana (DM, owns the campaign and the custom classes)   2 Pat (plays e1 and e2)

begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93410000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'capabilities-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name) values
  ('93410000-0000-4000-8000-0000000000c1', '93410000-0000-4000-8000-000000000001', 'Dana''s table');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('93410000-0000-4000-8000-0000000000e1', '93410000-0000-4000-8000-000000000002', '93410000-0000-4000-8000-000000000002',
   '93410000-0000-4000-8000-0000000000c1', 'Ilse', '2014'),
  ('93410000-0000-4000-8000-0000000000e2', '93410000-0000-4000-8000-000000000002', '93410000-0000-4000-8000-000000000002',
   '93410000-0000-4000-8000-0000000000c1', 'Brin', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93410000-0000-4000-8000-0000000000c1', '93410000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('93410000-0000-4000-8000-0000000000c1', '93410000-0000-4000-8000-000000000002', 'player', 'Pat', '93410000-0000-4000-8000-0000000000e1')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- A homebrew shapeshifter named nothing like a druid, and a homebrew class
-- named like one that the DM has not given Wild Shape.
insert into public.custom_classes (id, user_id, campaign_id, class_name, hit_die, ruleset, capabilities) values
  ('93410000-0000-4000-8000-0000000000a1', '93410000-0000-4000-8000-000000000001', '93410000-0000-4000-8000-0000000000c1', 'Skinchanger', 8, '2014', '{wild_shape}'),
  ('93410000-0000-4000-8000-0000000000a2', '93410000-0000-4000-8000-000000000001', '93410000-0000-4000-8000-0000000000c1', 'Druidic Scholar', 8, '2014', '{}');

insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select '93410000-0000-4000-8000-0000000000e1', sc.class_name, 2, true, sc.id, 'system'
  from public.system_classes sc where sc.conceptual_key = 'druid' and sc.ruleset = '2014';
insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind) values
  ('93410000-0000-4000-8000-0000000000e2', 'Skinchanger', 3, true, '93410000-0000-4000-8000-0000000000a1', 'custom'),
  ('93410000-0000-4000-8000-0000000000e2', 'Druidic Scholar', 1, false, '93410000-0000-4000-8000-0000000000a2', 'custom');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93410000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

select ok(
  (select bool_and('wild_shape' = any (capabilities)) from public.system_classes where conceptual_key = 'druid'),
  'the library Druid can Wild Shape in both editions (bug: a backfill that missed one stops every druid at that table)'
);
select is((select capabilities from public.character_classes where party_member_id = '93410000-0000-4000-8000-0000000000e1'),
  '{wild_shape}'::text[], 'a druid''s class row carries Wild Shape from its definition');
select is((select capabilities from public.character_classes where class_name = 'Skinchanger'),
  '{wild_shape}'::text[], 'a homebrew shapeshifter can Wild Shape although nothing in its name says druid');
select is((select capabilities from public.character_classes where class_name = 'Druidic Scholar'),
  '{}'::text[], 'a class named like a druid cannot Wild Shape unless its definition says so');

set local role authenticated;
select pg_temp.as_user(2);
update public.character_classes set capabilities = '{}'
 where party_member_id = '93410000-0000-4000-8000-0000000000e1';
reset role;
select is((select capabilities from public.character_classes where party_member_id = '93410000-0000-4000-8000-0000000000e1'),
  '{wild_shape}'::text[], 'a player cannot drop (or forge) a capability by writing the row: it always comes from the definition');

set local role authenticated;
select pg_temp.as_user(1);
update public.custom_classes set capabilities = '{wild_shape}' where id = '93410000-0000-4000-8000-0000000000a2';
reset role;
select is((select capabilities from public.character_classes where class_name = 'Druidic Scholar'),
  '{wild_shape}'::text[], 'the DM giving a class Wild Shape reaches every character of that class at once');

set local role authenticated;
select pg_temp.as_user(1);
update public.custom_classes set capabilities = '{}' where id = '93410000-0000-4000-8000-0000000000a1';
reset role;
select is((select capabilities from public.character_classes where class_name = 'Skinchanger'),
  '{}'::text[], 'taking Wild Shape away reaches the class''s characters too');

select ok(
  (select bool_and('jack_of_all_trades' = any (capabilities)) from public.system_classes where conceptual_key = 'bard'),
  'the library Bard has Jack of All Trades in both editions (bug: the backfill missed an edition, and that Bard scores checks short)'
);
select ok(
  (select not bool_or('jack_of_all_trades' = any (capabilities)) from public.system_classes where conceptual_key <> 'bard'),
  'no other library class has Jack of All Trades (bug: a backfill keyed too wide hands every class half proficiency)'
);
select throws_ok(
  $$update public.custom_classes set capabilities = '{jack_of_all_trades_plus}' where id = '93410000-0000-4000-8000-0000000000a2'$$,
  '23514', null,
  'an unknown capability is refused, so a typo cannot pass for a feature'
);

select * from finish();
rollback;
