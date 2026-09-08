-- #819: a library item dropped into chat survives the claim with its reference
-- intact — on both branches of claim_item_drop.
--
-- Exercised rather than inspected. The first attempt at this migration patched
-- the two INSERT branches with the same search string twice, so one branch got
-- the value written twice and the other got a column with no value at all. A
-- count of occurrences passed; only running it would have failed.

begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('81900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue819-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('81900000-0000-4000-8000-000000000010', '81900000-0000-4000-8000-000000000001', 'Drop table');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('81900000-0000-4000-8000-000000000010', '81900000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('81900000-0000-4000-8000-000000000020', '81900000-0000-4000-8000-000000000001', '81900000-0000-4000-8000-000000000001', '81900000-0000-4000-8000-000000000010', 'Nessa');
insert into public.npcs (id, user_id, campaign_id, name)
values ('81900000-0000-4000-8000-000000000030', '81900000-0000-4000-8000-000000000001', '81900000-0000-4000-8000-000000000010', 'The fence');

-- The test creates its own library row rather than leaning on seeded content.
-- `library_items` is empty on a fresh local stack, and the first version of this
-- test asked `(select id from library_items limit 1)` — which returned NULL, so
-- every assertion below compared NULL to NULL and passed while proving nothing.
-- A test that cannot fail is worse than no test.
insert into public.library_items (id, name, item_type, rarity, requires_attunement, properties, description, tags, is_arcane_focus, source_document_key, source_record_key, provenance)
values ('srd_test_borrowed_blade', 'Borrowed blade', 'weapon', 'common', false, '{}', 'A blade on loan.', '{}', false, 'srd-2014', 'test-borrowed-blade', '{}'::jsonb);

select is(
  (select count(*)::integer from public.library_items where id = 'srd_test_borrowed_blade'),
  1,
  'the library row this test depends on exists, so nothing below can pass vacuously'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81900000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Two identical drops, claimed down the two different branches.
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select ('81900000-0000-4000-8000-00000000004' || n)::uuid, '81900000-0000-4000-8000-000000000010',
       '81900000-0000-4000-8000-000000000001', 'DM', 'A find', 'item_drop',
       jsonb_build_object('library_item_id', 'srd_test_borrowed_blade',
                          'item_name', 'Borrowed blade', 'quantity', 1)
from generate_series(1, 2) as n;

select lives_ok($$
  select public.claim_item_drop('81900000-0000-4000-8000-000000000041', 'DM', null, '81900000-0000-4000-8000-000000000030')
$$, 'an NPC can be handed a library item from chat');

select is(
  (select library_item_id from public.npc_inventory where npc_id = '81900000-0000-4000-8000-000000000030'),
  'srd_test_borrowed_blade',
  'and the NPC row keeps the library reference rather than a copied item'
);

select lives_ok($$
  select public.claim_item_drop('81900000-0000-4000-8000-000000000042', 'DM', '81900000-0000-4000-8000-000000000020', null)
$$, 'and so can a party member — the branch that had a column with no value');

select is(
  (select library_item_id from public.party_inventory where carried_by = '81900000-0000-4000-8000-000000000020'),
  'srd_test_borrowed_blade',
  'the party row keeps it too'
);

reset role;
select * from finish();
rollback;
