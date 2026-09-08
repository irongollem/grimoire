begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Story #787 (epic #780). The log is append-only and the view is the answer.
-- Both halves matter: undo is an appended reversal, and the current state is
-- derived so it cannot drift from the history it came from.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78700000-0000-4000-8000-000000000010', '78700000-0000-4000-8000-000000000001', 'Durable state');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78700000-0000-4000-8000-000000000010', '78700000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('78700000-0000-4000-8000-000000000020', '78700000-0000-4000-8000-000000000001', '78700000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
values ('78700000-0000-4000-8000-000000000021', '78700000-0000-4000-8000-000000000001', '78700000-0000-4000-8000-000000000010', '78700000-0000-4000-8000-000000000020', 'Reliquary', 'room');

-- Never asserted is not the same as asserted false. The view must be silent
-- rather than answering `false`, or a DM cannot tell "we have not been there"
-- from "we went and it was empty".
select is(
  (select count(*)::integer from public.location_state where location_id = '78700000-0000-4000-8000-000000000021'),
  0,
  'a location nobody has said anything about has no state rows'
);

insert into public.location_state_events (user_id, location_id, fact, value, note)
values ('78700000-0000-4000-8000-000000000001', '78700000-0000-4000-8000-000000000021', 'looted', true, 'The Drowned Bell party got here first');

select is(
  (select value from public.location_state
    where location_id = '78700000-0000-4000-8000-000000000021' and fact = 'looted'),
  true,
  'an assertion shows up as the current state'
);

select is(
  (select asserted_note from public.location_state
    where location_id = '78700000-0000-4000-8000-000000000021' and fact = 'looted'),
  'The Drowned Bell party got here first',
  'provenance travels with the answer'
);

-- Undo is an append. The original stays.
insert into public.location_state_events (user_id, location_id, fact, value)
values ('78700000-0000-4000-8000-000000000001', '78700000-0000-4000-8000-000000000021', 'looted', false);

select is(
  (select value from public.location_state
    where location_id = '78700000-0000-4000-8000-000000000021' and fact = 'looted'),
  false,
  'the newest assertion wins'
);

select is(
  (select count(*)::integer from public.location_state_events
    where location_id = '78700000-0000-4000-8000-000000000021' and fact = 'looted'),
  2,
  'taking a claim back keeps the claim that was taken back'
);

select is(
  (select count(*)::integer from public.location_state
    where location_id = '78700000-0000-4000-8000-000000000021'),
  1,
  'the view collapses a fact to exactly one row however often it was asserted'
);

-- Facts are independent: asserting one must not answer for another.
insert into public.location_state_events (user_id, location_id, fact, value)
values ('78700000-0000-4000-8000-000000000001', '78700000-0000-4000-8000-000000000021', 'explored', true);

select results_eq(
  $$select fact, value from public.location_state
     where location_id = '78700000-0000-4000-8000-000000000021' order by fact$$,
  $$values ('explored', true), ('looted', false)$$,
  'facts are tracked independently, and cleared stays unasserted'
);

-- A view without security_invoker executes as its owner and hands every caller
-- every DM's rows. view_security_invoker.test.sql asserts this structurally for
-- every view; this pins it for the one this migration adds.
select is(
  (select 'security_invoker=true' = any(c.reloptions)
     from pg_class c where c.oid = 'public.location_state'::regclass),
  true,
  'location_state is security_invoker, so RLS is evaluated against the caller'
);

-- The regression this file caught before it shipped: both events above were
-- written in one transaction, so their `created_at` is identical. Ordering by
-- timestamp alone left the winner to a random uuid tiebreak, and "the newest
-- assertion wins" passed or failed by coin flip. The view orders by `seq`.
select is(
  (select count(distinct created_at)::integer from public.location_state_events
    where location_id = '78700000-0000-4000-8000-000000000021' and fact = 'looted'),
  1,
  'both assertions share a timestamp, so only the sequence can order them'
);

select * from finish();
rollback;
