-- A quest declares its entry beat; a bridge names where the party comes in
-- (20260909194207). The database defaults the entry to the first beat,
-- reassigns it when that beat is archived or deleted, refuses a beat of
-- another quest or a tombstone, and lets an unlock_quest rule name a beat of
-- the quest it unlocks — and only of that quest.
begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79600000-0000-4000-8000-000000a00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'entry-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79600000-0000-4000-8000-000000a00010', '79600000-0000-4000-8000-000000a00001', 'Entry');

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00001', '79600000-0000-4000-8000-000000a00010', 'The bridge', 'active'),
  ('79600000-0000-4000-8000-000000a00031', '79600000-0000-4000-8000-000000a00001', '79600000-0000-4000-8000-000000a00010', 'The sequel', 'undiscovered');

select is(
  (select entry_beat_id from public.quests where id = '79600000-0000-4000-8000-000000a00030'),
  null,
  'a quest with no beats has no entry yet');

-- The first beat becomes the entry on its own.
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00041', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', 'The rumor');

select is(
  (select entry_beat_id from public.quests where id = '79600000-0000-4000-8000-000000a00030'),
  '79600000-0000-4000-8000-000000a00041'::uuid,
  'the first beat written becomes the entry');

-- A second beat does not displace it.
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00042', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', 'The docks');

select is(
  (select entry_beat_id from public.quests where id = '79600000-0000-4000-8000-000000a00030'),
  '79600000-0000-4000-8000-000000a00041'::uuid,
  'a later beat leaves the entry alone');

-- The DM may move it to any live beat of the same quest.
select lives_ok(
  $$update public.quests set entry_beat_id = '79600000-0000-4000-8000-000000a00042' where id = '79600000-0000-4000-8000-000000a00030'$$,
  'the DM can name another beat of the quest as the entry');

-- …but not a beat of another quest.
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00051', '79600000-0000-4000-8000-000000a00031', '79600000-0000-4000-8000-000000a00010', 'Sequel opening');

select throws_ok(
  $$update public.quests set entry_beat_id = '79600000-0000-4000-8000-000000a00051' where id = '79600000-0000-4000-8000-000000a00030'$$,
  '23503',
  null,
  'a beat of another quest cannot be this quest''s entry');

-- …and not a tombstone.
insert into public.quest_beats (id, quest_id, campaign_id, title, kind)
values ('79600000-0000-4000-8000-000000a00043', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', 'Old draft', 'archived');

select throws_ok(
  $$update public.quests set entry_beat_id = '79600000-0000-4000-8000-000000a00043' where id = '79600000-0000-4000-8000-000000a00030'$$,
  '23514',
  null,
  'an archived beat cannot be the entry');

-- Archiving the entry reassigns it: roots first, oldest first. "The docks"
-- (the entry) has a route into it from "The rumor", so the rumor is the root.
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
values ('79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', '79600000-0000-4000-8000-000000a00041', '79600000-0000-4000-8000-000000a00042');

update public.quest_beats set kind = 'archived' where id = '79600000-0000-4000-8000-000000a00042';

select is(
  (select entry_beat_id from public.quests where id = '79600000-0000-4000-8000-000000a00030'),
  '79600000-0000-4000-8000-000000a00041'::uuid,
  'archiving the entry hands it to the oldest root');

-- Deleting the entry does the same, through the FK''s set-null and the trigger.
delete from public.quest_beats where id = '79600000-0000-4000-8000-000000a00041';

select is(
  (select entry_beat_id from public.quests where id = '79600000-0000-4000-8000-000000a00030'),
  null,
  'deleting the last live beat leaves the quest without an entry rather than pointing at a tombstone');

-- A bridge: the sequel's unlock rule names where the party comes in.
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00052', '79600000-0000-4000-8000-000000a00031', '79600000-0000-4000-8000-000000a00010', 'Sequel side door');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00044', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', 'The bridge beat');

select lives_ok(
  $$insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_quest_id, entry_beat_id)
    values ('79600000-0000-4000-8000-000000a00071', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00044', 'unlock_quest', '79600000-0000-4000-8000-000000a00031', '79600000-0000-4000-8000-000000a00052')$$,
  'an unlock rule names a beat of the quest it unlocks');

-- A second bridge beat, so the dedupe key (beat, action, target) does not
-- answer before the FK gets to.
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79600000-0000-4000-8000-000000a00045', '79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00010', 'Another bridge');

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_quest_id, entry_beat_id)
    values ('79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00045', 'unlock_quest', '79600000-0000-4000-8000-000000a00031', '79600000-0000-4000-8000-000000a00044')$$,
  '23503',
  null,
  'the entry must belong to the unlocked quest, not the bridge');

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, action_payload, entry_beat_id)
    values ('79600000-0000-4000-8000-000000a00030', '79600000-0000-4000-8000-000000a00044', 'grant_knowledge', '{"text": "x"}', '79600000-0000-4000-8000-000000a00052')$$,
  '23514',
  null,
  'only unlock_quest carries an entry beat');

-- Deleting the named side door falls back to "the target''s own entry".
delete from public.quest_beats where id = '79600000-0000-4000-8000-000000a00052';

select is(
  (select entry_beat_id from public.quest_consequences where id = '79600000-0000-4000-8000-000000a00071'),
  null,
  'losing the side door leaves the rule pointing at the sequel''s own entry');

-- The players' quest RPC is `returns setof quests`; a column added to quests
-- broke it once (16 selected, 17 declared — 42804 for every player). The
-- structure is checked when RETURN QUERY runs, rows or no rows, so calling it
-- as the DM (who sees nothing through the player predicate) is enough.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79600000-0000-4000-8000-000000a00001', true);
select lives_ok(
  $$select * from public.get_player_visible_quests('79600000-0000-4000-8000-000000a00010')$$,
  'the player quest RPC still matches the quests row after entry_beat_id was added');

select * from finish();
rollback;
