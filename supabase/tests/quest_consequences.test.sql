-- One rule engine replacing two (story #794): a condition (a beat, an edge, an
-- objective becoming a status, or the quest's ledger settling), a delay, and
-- an action. This file replaces quest_objective_effects.test.sql, carrying
-- forward the two behaviours that predate this migration (a beat/edge rule
-- fires on arrival; stepping back reverses it) and adding cover for what only
-- exists now: the ledger settling on an edge rather than a level, the
-- once-per-transition guard, the bounded cascade, assert_quest_objective_status
-- seeding the engine directly, the closed status column, delayed vs. immediate
-- actions, undo-by-handle, the DM-only event log, and both CHECK constraints.
begin;

create extension if not exists pgtap with schema extensions;
select plan(44);

-- Six scenarios, six DM fixtures. request.jwt.claim.sub survives both a role
-- change and a scenario boundary, so a later scenario's fixture inserts (run
-- as postgres, before that scenario sets its own sub) would otherwise be
-- quota-checked against whichever sub the PREVIOUS scenario last set —
-- occasionally that user's own real campaign count, tripping the free-tier
-- limit on a fixture that has nothing to do with quotas.
set local grimoire.bypass_quota = 'on';

select col_type_is('public', 'quest_objectives', 'status', 'text', 'an objective has a real outcome, not a done flag');
select hasnt_column('public', 'quest_objectives', 'is_done', 'a boolean could not say an objective failed');

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario A — a beat/edge rule fires on arrival, stepping back reverses it,
-- a delayed world action is logged but not performed, undo deletes what
-- reached the world by handle, the status column is closed to clients, and
-- players cannot read the DM-only event log.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('79400000-0000-4000-8000-000000a00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('79400000-0000-4000-8000-000000a00002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000a00010', '79400000-0000-4000-8000-000000a00001', 'Consequences');

-- The owner is enrolled as DM by the campaign's own trigger; the player needs
-- a membership row of their own.
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('79400000-0000-4000-8000-000000a00010', '79400000-0000-4000-8000-000000a00002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000a00030', '79400000-0000-4000-8000-000000a00001', '79400000-0000-4000-8000-000000a00010', 'Two roads', 'active');

insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, sort_order) values
  ('79400000-0000-4000-8000-000000a00051', '79400000-0000-4000-8000-000000a00030', 'Save the caravan', 'pending', false, 1),
  ('79400000-0000-4000-8000-000000a00052', '79400000-0000-4000-8000-000000a00030', 'Keep the bridge standing', 'pending', true, 2);

insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79400000-0000-4000-8000-000000a00041', '79400000-0000-4000-8000-000000a00030', '79400000-0000-4000-8000-000000a00010', 'The fork'),
  ('79400000-0000-4000-8000-000000a00043', '79400000-0000-4000-8000-000000a00030', '79400000-0000-4000-8000-000000a00010', 'The burning bridge');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('79400000-0000-4000-8000-000000a00062', '79400000-0000-4000-8000-000000a00030', '79400000-0000-4000-8000-000000a00010',
   '79400000-0000-4000-8000-000000a00041', '79400000-0000-4000-8000-000000a00043', 'Cross the bridge');

-- Arriving at the fork reveals the caravan objective.
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79400000-0000-4000-8000-000000a00071', '79400000-0000-4000-8000-000000a00030',
        '79400000-0000-4000-8000-000000a00041', 'reveal', '79400000-0000-4000-8000-000000a00051');

-- Taking the bridge fails it — the branch, not the beat.
insert into public.quest_consequences (id, quest_id, on_edge_id, action, target_objective_id)
values ('79400000-0000-4000-8000-000000a00072', '79400000-0000-4000-8000-000000a00030',
        '79400000-0000-4000-8000-000000a00062', 'fail', '79400000-0000-4000-8000-000000a00052');

-- ...and, five in-world days later, the crossing is remembered on the calendar.
-- A world action carries no target_objective_id.
insert into public.quest_consequences (id, quest_id, on_edge_id, action, after_days, action_payload)
values ('79400000-0000-4000-8000-000000a00073', '79400000-0000-4000-8000-000000a00030',
        '79400000-0000-4000-8000-000000a00062', 'create_calendar_event', 5,
        '{"title":"The bridge is gone","description":"Reinforcements can no longer cross.","event_type":"campaign"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000a00001', true);

select lives_ok($$select public.transition_quest_runtime(
  '79400000-0000-4000-8000-000000a00010', '79400000-0000-4000-8000-000000a00030', 'start', 0,
  '79400000-0000-4000-8000-000000a00041')$$,
  'entering the fork runs the beat''s consequences');

select is(
  (select is_player_visible from public.quest_objectives where id = '79400000-0000-4000-8000-000000a00051'),
  true,
  'arriving at a beat reveals the objective its rule targets'
);

select is(
  (select status from public.quest_objectives where id = '79400000-0000-4000-8000-000000a00052'),
  'pending',
  'a branch rule stays quiet until that branch is actually taken'
);

-- The column-level grant closes the second writer: the checklist click can no
-- longer set status directly, which is what makes an objective-became
-- condition detectable at all.
select throws_ok(
  $$update public.quest_objectives set status = 'complete' where id = '79400000-0000-4000-8000-000000a00052'$$,
  '42501', null,
  'status is no longer client-writable — the column grant was revoked'
);
select lives_ok(
  $$update public.quest_objectives set description = 'Keep the bridge standing (annotated)' where id = '79400000-0000-4000-8000-000000a00052'$$,
  'description remains client-writable after the status grant was revoked'
);

select lives_ok($$select public.transition_quest_runtime(
  '79400000-0000-4000-8000-000000a00010', '79400000-0000-4000-8000-000000a00030', 'advance', 1, null,
  '79400000-0000-4000-8000-000000a00062')$$,
  'taking the branch runs the edge''s consequences');

select is(
  (select status from public.quest_objectives where id = '79400000-0000-4000-8000-000000a00052'),
  'failed',
  'an objective can be failed by the road the party chose'
);

select is(
  (select performed_at from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000a00073'),
  null,
  'a delayed action is logged at the moment it is earned...'
);

select is(
  (select count(*)::integer from public.calendar_events where linked_quest_id = '79400000-0000-4000-8000-000000a00030'),
  0,
  '...but not performed — the client is the calendar oracle, not the trigger'
);

select lives_ok(
  $$select public.perform_quest_consequence(
      (select id from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000a00073'),
      1495, 1, 6)$$,
  'the DM can perform a due delayed consequence once the client has named the date'
);

select ok(
  (select performed_at is not null and calendar_event_id is not null
     from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000a00073'),
  'performing it stamps performed_at and the handle of what it created'
);

select is(
  (select count(*)::integer from public.calendar_events where linked_quest_id = '79400000-0000-4000-8000-000000a00030'),
  1,
  'performing it actually wrote the calendar row'
);

-- Stepping back at a table is a correction, so what the step forward decided
-- must come undone with it, not linger as a state the DM cannot see.
select lives_ok($$select public.transition_quest_runtime(
  '79400000-0000-4000-8000-000000a00010', '79400000-0000-4000-8000-000000a00030', 'previous', 2)$$,
  'stepping back is allowed after a consequence fired');

select is(
  (select status from public.quest_objectives where id = '79400000-0000-4000-8000-000000a00052'),
  'pending',
  'stepping back over a branch undoes what that branch decided'
);

select is(
  (select count(*)::integer from public.calendar_events where linked_quest_id = '79400000-0000-4000-8000-000000a00030'),
  0,
  'undo reverses what reached the world, by handle — the calendar row is deleted'
);

select is(
  (select count(*)::integer from public.quest_consequence_events
    where transition_id = (select transition_id from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000a00072')
      and undone_at is not null),
  2,
  'undo sets undone_at on every event the reversed arrival produced'
);

select is(
  (select count(*)::integer from public.quest_consequence_events where campaign_id = '79400000-0000-4000-8000-000000a00010'),
  3,
  'undo appends the opposite rather than erasing the record — all three events still exist'
);

select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000a00002', true);
select is(
  (select count(*)::integer from public.quest_consequence_events where campaign_id = '79400000-0000-4000-8000-000000a00010'),
  0,
  'a player cannot read the DM-only consequence log, even for their own campaign'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario B — the ledger settles on an edge, not a level. Two objectives
-- pending plus one dormant (ignored); completing one fires nothing; resolving
-- the last (by FAILING it — failed counts as settled too) fires the settled
-- rule exactly once; changing a third objective afterward fires it again zero
-- times, because the ledger was already settled before that change.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79400000-0000-4000-8000-000000b00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-settle-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000b00010', '79400000-0000-4000-8000-000000b00001', 'Settling');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000b00030', '79400000-0000-4000-8000-000000b00001', '79400000-0000-4000-8000-000000b00010', 'Branching', 'active');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('79400000-0000-4000-8000-000000b00051', '79400000-0000-4000-8000-000000b00030', 'Path one', 'pending', 1),
  ('79400000-0000-4000-8000-000000b00052', '79400000-0000-4000-8000-000000b00030', 'Path two', 'pending', 2),
  ('79400000-0000-4000-8000-000000b00053', '79400000-0000-4000-8000-000000b00030', 'Untaken branch', 'dormant', 3);

insert into public.quest_consequences (id, quest_id, on_quest_settled, action)
values ('79400000-0000-4000-8000-000000b00071', '79400000-0000-4000-8000-000000b00030', true, 'send_broadcast');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000b00001', true);

select lives_ok(
  $$select public.assert_quest_objective_status('79400000-0000-4000-8000-000000b00051', 'complete')$$,
  'completing one of two pending objectives does not settle a branching quest');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000b00071'),
  0,
  'the settled rule does not fire while a sibling objective is still pending'
);

select lives_ok(
  $$select public.assert_quest_objective_status('79400000-0000-4000-8000-000000b00052', 'failed')$$,
  'failing the last pending objective still resolves the ledger — failed counts as settled');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000b00071'),
  1,
  'the settled rule fires exactly once, on the edge into settled'
);

select lives_ok(
  $$select public.assert_quest_objective_status('79400000-0000-4000-8000-000000b00053', 'complete')$$,
  'a dormant objective may still be asserted straight to a resolved status');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000b00071'),
  1,
  'a quest already settled does not re-fire the settled rule when a third objective resolves afterward'
);

select ok(
  (select performed_at is not null and message_id is not null
     from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000b00071'),
  'an immediate (after_days=0) world action performs inside the same transition rather than only logging'
);

select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '79400000-0000-4000-8000-000000b00010' and type = 'system'),
  1,
  'the broadcast actually reached the campaign''s chat'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario C — a rule fires at most once per transition. An on_objective_status
-- condition stays true after it fires, so without the transition-scoped guard
-- the same rule would re-fire every cascade round.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79400000-0000-4000-8000-000000c00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-once-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000c00010', '79400000-0000-4000-8000-000000c00001', 'Once');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000c00030', '79400000-0000-4000-8000-000000c00001', '79400000-0000-4000-8000-000000c00010', 'Persistent', 'active');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79400000-0000-4000-8000-000000c00041', '79400000-0000-4000-8000-000000c00030', '79400000-0000-4000-8000-000000c00010', 'Start');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('79400000-0000-4000-8000-000000c00051', '79400000-0000-4000-8000-000000c00030', 'A', 'pending', 1),
  ('79400000-0000-4000-8000-000000c00052', '79400000-0000-4000-8000-000000c00030', 'B', 'pending', 2);

-- Arriving reveals A. A's status stays 'pending' — reveal never changes status
-- for a non-dormant objective — so the rule below's condition is true both
-- before and after it fires.
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79400000-0000-4000-8000-000000c00071', '79400000-0000-4000-8000-000000c00030',
        '79400000-0000-4000-8000-000000c00041', 'reveal', '79400000-0000-4000-8000-000000c00051');

-- A permanently-true condition: A is, and remains, 'pending'.
insert into public.quest_consequences (id, quest_id, on_objective_id, on_objective_status, action, target_objective_id)
values ('79400000-0000-4000-8000-000000c00072', '79400000-0000-4000-8000-000000c00030',
        '79400000-0000-4000-8000-000000c00051', 'pending', 'reveal', '79400000-0000-4000-8000-000000c00052');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000c00001', true);

select lives_ok($$select public.transition_quest_runtime(
  '79400000-0000-4000-8000-000000c00010', '79400000-0000-4000-8000-000000c00030', 'start', 0,
  '79400000-0000-4000-8000-000000c00041')$$,
  'the cascade runs the beat rule, then the objective-became rule it unlocks');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '79400000-0000-4000-8000-000000c00072'),
  1,
  'the once-per-transition guard stops a persistently-true condition from refiring every round'
);

select is(
  (select is_player_visible from public.quest_objectives where id = '79400000-0000-4000-8000-000000c00052'),
  true,
  'the single fire still cascaded to reveal the second objective'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario D — the cascade is bounded. A chain of nine rules, each unlocked by
-- the last, raises rather than applying half of it: nothing in the chain
-- survives once the round limit trips, because the whole transition rolls
-- back atomically.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79400000-0000-4000-8000-000000d00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-bound-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000d00010', '79400000-0000-4000-8000-000000d00001', 'Chained');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000d00030', '79400000-0000-4000-8000-000000d00001', '79400000-0000-4000-8000-000000d00010', 'Long chain', 'active');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79400000-0000-4000-8000-000000d00041', '79400000-0000-4000-8000-000000d00030', '79400000-0000-4000-8000-000000d00010', 'Start');

-- Nine objectives, O0..O8, all pending.
insert into public.quest_objectives (id, quest_id, description, status, sort_order)
select ('79400000-0000-4000-8000-000000d000' || lpad((50 + n)::text, 2, '0'))::uuid,
       '79400000-0000-4000-8000-000000d00030', 'Link ' || n, 'pending', n
from generate_series(0, 8) n;

-- The beat completes O0...
insert into public.quest_consequences (id, quest_id, on_beat_id, action, target_objective_id)
values ('79400000-0000-4000-8000-000000d00070', '79400000-0000-4000-8000-000000d00030',
        '79400000-0000-4000-8000-000000d00041', 'complete', '79400000-0000-4000-8000-000000d00050');

-- ...and each completion completes the next: O0 completes O1, O1 completes O2,
-- and so on through O7 completing O8 — nine hops, one more than the eight the
-- engine allows.
insert into public.quest_consequences (id, quest_id, on_objective_id, on_objective_status, action, target_objective_id)
select ('79400000-0000-4000-8000-000000d000' || lpad((80 + n)::text, 2, '0'))::uuid,
       '79400000-0000-4000-8000-000000d00030',
       ('79400000-0000-4000-8000-000000d000' || lpad((49 + n)::text, 2, '0'))::uuid,
       'complete', 'complete',
       ('79400000-0000-4000-8000-000000d000' || lpad((50 + n)::text, 2, '0'))::uuid
from generate_series(1, 8) n;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000d00001', true);

select throws_ok(
  $$select public.transition_quest_runtime(
      '79400000-0000-4000-8000-000000d00010', '79400000-0000-4000-8000-000000d00030', 'start', 0,
      '79400000-0000-4000-8000-000000d00041')$$,
  'consequence cascade exceeded 8 rounds on quest 79400000-0000-4000-8000-000000d00030 — check for a rule loop',
  'a DM-authored rule loop raises rather than running forever'
);

select is(
  (select status from public.quest_objectives where id = '79400000-0000-4000-8000-000000d00055'),
  'pending',
  'the whole transition rolled back — nothing halfway down the chain survives'
);

select is(
  (select count(*)::integer from public.quest_consequence_events where quest_id = '79400000-0000-4000-8000-000000d00030'),
  0,
  'a rolled-back cascade leaves no partial event log behind either'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario E — assert_quest_objective_status seeds the engine. The RPC changes
-- the objective's status itself, before the runtime ever reads it, so it must
-- hand the engine the objective it just changed — there is no beat or edge to
-- infer it from, and no runtime session even needs to exist.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79400000-0000-4000-8000-000000e00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-assert-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000e00010', '79400000-0000-4000-8000-000000e00001', 'Prep time');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000e00030', '79400000-0000-4000-8000-000000e00001', '79400000-0000-4000-8000-000000e00010', 'Ticking clock', 'active');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('79400000-0000-4000-8000-000000e00051', '79400000-0000-4000-8000-000000e00030', 'A', 'pending', 1),
  ('79400000-0000-4000-8000-000000e00052', '79400000-0000-4000-8000-000000e00030', 'B', 'pending', 2);

insert into public.quest_consequences (id, quest_id, on_objective_id, on_objective_status, action, target_objective_id)
values ('79400000-0000-4000-8000-000000e00071', '79400000-0000-4000-8000-000000e00030',
        '79400000-0000-4000-8000-000000e00051', 'complete', 'reveal', '79400000-0000-4000-8000-000000e00052');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000e00001', true);

select lives_ok(
  $$select public.assert_quest_objective_status('79400000-0000-4000-8000-000000e00051', 'complete', 'DM prep note')$$,
  'asserting a status works with no runtime session or beat graph at all');

select is(
  (select status from public.quest_objectives where id = '79400000-0000-4000-8000-000000e00051'),
  'complete',
  'the assertion itself lands'
);

select is(
  (select is_player_visible from public.quest_objectives where id = '79400000-0000-4000-8000-000000e00052'),
  true,
  'the assertion seeds the engine, which cascades into the objective-became rule'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario G — both CHECK constraints. Exactly one condition family; a ledger
-- verb requires a target and a world action must not have one; and the
-- self-reference guard must not reject a world action, where both sides of
-- the comparison are null by definition.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79400000-0000-4000-8000-000000f00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cons-check-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79400000-0000-4000-8000-000000f00010', '79400000-0000-4000-8000-000000f00001', 'Checks');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00001', '79400000-0000-4000-8000-000000f00010', 'Rules quest', 'active');

insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('79400000-0000-4000-8000-000000f00041', '79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00010', 'Beat one'),
  ('79400000-0000-4000-8000-000000f00042', '79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00010', 'Beat two');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('79400000-0000-4000-8000-000000f00061', '79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00010',
        '79400000-0000-4000-8000-000000f00041', '79400000-0000-4000-8000-000000f00042');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('79400000-0000-4000-8000-000000f00051', '79400000-0000-4000-8000-000000f00030', 'X', 'pending', 1),
  ('79400000-0000-4000-8000-000000f00052', '79400000-0000-4000-8000-000000f00030', 'Y', 'pending', 2);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79400000-0000-4000-8000-000000f00001', true);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, on_edge_id, action, target_objective_id)
    values ('79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00041', '79400000-0000-4000-8000-000000f00061', 'raise', '79400000-0000-4000-8000-000000f00051')$$,
  '23514', null,
  'a rule fires from a beat or a branch, never both'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, action, target_objective_id)
    values ('79400000-0000-4000-8000-000000f00030', 'raise', '79400000-0000-4000-8000-000000f00051')$$,
  '23514', null,
  'a rule with no condition at all can never fire'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_quest_settled, action)
    values ('79400000-0000-4000-8000-000000f00030', true, 'complete')$$,
  '23514', null,
  'a ledger verb without a target can never resolve anything'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_quest_settled, action, target_objective_id)
    values ('79400000-0000-4000-8000-000000f00030', true, 'create_calendar_event', '79400000-0000-4000-8000-000000f00051')$$,
  '23514', null,
  'a world action must not carry a target — there is no objective to update'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_objective_id, action, target_objective_id)
    values ('79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00051', 'raise', '79400000-0000-4000-8000-000000f00052')$$,
  '23514', null,
  'a status is meaningless without the objective it describes'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_objective_id, on_objective_status, action, target_objective_id)
    values ('79400000-0000-4000-8000-000000f00030', '79400000-0000-4000-8000-000000f00051', 'pending', 'raise', '79400000-0000-4000-8000-000000f00051')$$,
  '23514', null,
  'a rule that fires itself is refused as a one-link loop'
);

-- The fix this migration shipped with: `null is distinct from null` is FALSE,
-- so a naive `on_objective_id is distinct from target_objective_id` rejects
-- every world action, where both sides are null by definition. Two such rows
-- — sharing the same on_quest_settled condition — must both be accepted.
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_quest_settled, action) values
      ('79400000-0000-4000-8000-000000f00030', true, 'create_calendar_event'),
      ('79400000-0000-4000-8000-000000f00030', true, 'send_broadcast')$$,
  'two world actions with no objective on either side of the self-reference check are both accepted'
);

select * from finish();
rollback;
