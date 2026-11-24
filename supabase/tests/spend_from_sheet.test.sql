-- #1264: a fight takes what it spent off a sheet as the sheet is now, once per batch.
-- The bug: the fight wrote the whole slot list it had read, so a slot the player marked in between was put back.
begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('12640000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1264-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12640000-0000-4000-8000-000000000010', '12640000-0000-4000-8000-000000000001', 'Here', 'dnd5e-2024'),
  ('12640000-0000-4000-8000-000000000011', '12640000-0000-4000-8000-000000000001', 'Elsewhere', 'dnd5e-2024');

insert into public.party_members (id, user_id, campaign_id, name, class, level, spell_slots, class_resources, ruleset) values
  ('12640000-0000-4000-8000-000000000020', '12640000-0000-4000-8000-000000000001', '12640000-0000-4000-8000-000000000010', 'Tam', 'Warlock', 5,
   '[{"level":1,"max":2,"used":0},{"level":3,"max":2,"used":0,"pool":"spellcasting"},{"level":3,"max":2,"used":0,"pool":"pact","recovery":"short"}]'::jsonb,
   '{"second_wind":{"current":2,"max":2,"rest":"short"}}'::jsonb, '2024');

insert into public.spells (id, user_id, campaign_id, name, level, casting_time, range, duration, description, classes, attack_type, target_description) values
  ('12640000-0000-4000-8000-000000000030', '12640000-0000-4000-8000-000000000001', '12640000-0000-4000-8000-000000000010',
   'Innate Spark', 1, 'Action', '60 ft.', 'Instantaneous', 'A limited grant.', array[]::text[], 'automatic', '1 creature');
insert into public.character_spells (id, party_member_id, spell_id, source_type, uses_per_day, uses_remaining, resets_on, source_label) values
  ('12640000-0000-4000-8000-000000000031', '12640000-0000-4000-8000-000000000020', '12640000-0000-4000-8000-000000000030', 'feat', 2, 2, 'long_rest', 'Test Feat');

create function pg_temp.spend(p_batch text, p_slots jsonb, p_resources jsonb default '[]', p_innate jsonb default '[]', p_campaign uuid default '12640000-0000-4000-8000-000000000010')
returns boolean language sql as $$
  select public.spend_from_sheet(p_campaign, '12640000-0000-4000-8000-000000000020', p_batch, p_slots, p_resources, p_innate)
$$;
create function pg_temp.slots() returns jsonb language sql as $$
  select spell_slots from public.party_members where id = '12640000-0000-4000-8000-000000000020'
$$;

-- ── Who may call it ─────────────────────────────────────────────────────────
-- Bug caught: a client able to spend any character's slots by naming them.
select ok(not has_function_privilege('authenticated', 'public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb)', 'execute'),
  'a signed-in client cannot call spend_from_sheet');
select ok(not has_function_privilege('anon', 'public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb)', 'execute'),
  'an anonymous client cannot call spend_from_sheet');
select ok(has_function_privilege('service_role', 'public.spend_from_sheet(uuid, uuid, text, jsonb, jsonb, jsonb)', 'execute'),
  'the server can call spend_from_sheet');

set local role service_role;

-- ── The bug: an edit between the fight's read and its write stands ────────────
-- The fight read the 1st-level slots at 0 used and cast with one; meanwhile the player marked one on their sheet.
update public.party_members set spell_slots = jsonb_set(spell_slots, '{0,used}', '1') where id = '12640000-0000-4000-8000-000000000020';
select ok(pg_temp.spend('batch-a', '[{"level":1,"pool":null,"count":1}]'), 'a first spend under a batch is applied');
select is((pg_temp.slots() -> 0 ->> 'used')::int, 2, 'the cast is taken off the sheet as it is now: the player''s marked slot and the cast are both spent');

-- ── Once per batch ──────────────────────────────────────────────────────────
select ok(not pg_temp.spend('batch-a', '[{"level":1,"pool":null,"count":1}]'), 'the same batch sent again reports it was already spent');
select is((pg_temp.slots() -> 0 ->> 'used')::int, 2, 'a retried spend takes nothing a second time');

-- ── Which slot ───────────────────────────────────────────────────────────────
select ok(pg_temp.spend('batch-b', '[{"level":3,"pool":"pact","count":1}]'), 'a pact spend is applied');
select is(array[(pg_temp.slots() -> 1 ->> 'used')::int, (pg_temp.slots() -> 2 ->> 'used')::int], array[0, 1],
  'a slot cast from the Pact Magic pool comes off that pool, not the first 3rd-level row');
select ok(pg_temp.spend('batch-c', '[{"level":3,"pool":"pact","count":2}]'), 'a spend larger than the pool left is applied');
select is(array[(pg_temp.slots() -> 1 ->> 'used')::int, (pg_temp.slots() -> 2 ->> 'used')::int], array[1, 2],
  'when the pool it was cast from is spent, the other pool at that level pays (as allySlotSpend picks)');
select ok(pg_temp.spend('batch-d', '[{"level":1,"pool":null,"count":1}]'), 'a spend at a level with nothing left is still recorded');
select is((pg_temp.slots() -> 0 ->> 'used')::int, 2, 'a level with no unspent slot takes nothing, never more than max');

-- ── Class resources and innate uses ─────────────────────────────────────────
select ok(pg_temp.spend('batch-e', '[]',
  '[{"key":"second_wind","count":3,"fresh":{"current":2,"max":2,"rest":"short"}},{"key":"action_surge","count":1,"fresh":{"current":1,"max":1,"rest":"short"}}]',
  '[{"spellRowId":"12640000-0000-4000-8000-000000000031","count":1}]'), 'resources and innate uses are spent');
select is((select class_resources from public.party_members where id = '12640000-0000-4000-8000-000000000020'),
  '{"second_wind":{"current":0,"max":2,"rest":"short"},"action_surge":{"current":0,"max":1,"rest":"short"}}'::jsonb,
  'a stored pool loses its uses as it stands, never below none, and a pool never stored starts full');
select is((select uses_remaining from public.character_spells where id = '12640000-0000-4000-8000-000000000031'), 1,
  'an innate grant loses a use from what it has now');

-- ── Another campaign's member ────────────────────────────────────────────────
-- Bug caught: a fight in one campaign spending from a sheet in another by naming its member.
select throws_ok($$ select pg_temp.spend('batch-f', '[{"level":3,"pool":null,"count":1}]', '[]', '[]', '12640000-0000-4000-8000-000000000011') $$,
  'spend_from_sheet: no such member in this campaign', 'a member of another campaign is refused');

reset role;
select * from finish();
rollback;
