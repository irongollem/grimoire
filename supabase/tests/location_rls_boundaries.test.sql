begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- Phase 1 of epic #780, written after an audit found three RLS defects that
-- every existing test passed straight through — because they all run as
-- `postgres`, where RLS does not apply. This file runs as `authenticated` with
-- real JWT claims, which is the only way any of these assertions mean anything.
--
-- The underlying fact that caused all three: `public.locations` SELECT is
-- owner-only, so every policy that reaches locations through a subquery is
-- filtered *before* its campaign-DM test is ever evaluated.

-- u1 owns the campaign. u2 is a co-DM who authors content in it.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('7ff00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-owner@example.invalid',  '', '{}'::jsonb, '{}'::jsonb),
  ('7ff00000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-codm@example.invalid',   '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('7ff00000-0000-4000-8000-000000000010', '7ff00000-0000-4000-8000-000000000001', 'Shared'),
  ('7ff00000-0000-4000-8000-000000000011', '7ff00000-0000-4000-8000-000000000002', 'Strangers');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('7ff00000-0000-4000-8000-000000000010', '7ff00000-0000-4000-8000-000000000001', 'dm', 'Owner'),
  ('7ff00000-0000-4000-8000-000000000010', '7ff00000-0000-4000-8000-000000000002', 'dm', 'Co-DM'),
  ('7ff00000-0000-4000-8000-000000000011', '7ff00000-0000-4000-8000-000000000002', 'dm', 'Stranger')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Authored by the CO-DM, inside the owner's campaign. The owner cannot see this
-- row through `locations`' own SELECT policy — that is the whole problem.
insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('7ff00000-0000-4000-8000-000000000020', '7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000010', 'Vault the co-DM drew', 'dungeon');
-- And one in the stranger's own campaign, for the repoint test.
insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('7ff00000-0000-4000-8000-000000000021', '7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000011', 'Their own place', 'dungeon');

-- ── F1: a party must always be able to move ────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7ff00000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- The arrival trigger inserts under RLS, and the owner cannot see the co-DM's
-- location, so the insert is denied. Before the fix that 42501 propagated and
-- rolled back the whole UPDATE: an opaque failure, and the party could not
-- move at all. The log row is a courtesy; the move is not.
select lives_ok(
  $$update public.campaigns set current_location_id = '7ff00000-0000-4000-8000-000000000020'
     where id = '7ff00000-0000-4000-8000-000000000010'$$,
  'the party can move to a location the mover does not own'
);

select is(
  (select current_location_id from public.campaigns where id = '7ff00000-0000-4000-8000-000000000010'),
  '7ff00000-0000-4000-8000-000000000020'::uuid,
  'and the move actually committed rather than silently rolling back'
);

-- ── F2: durable site state is shared between a campaign''s DMs ─────────────
reset role;
insert into public.location_state_events (user_id, location_id, fact, value, note)
values ('7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000020', 'looted', true, 'We got here first');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7ff00000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- The point of #787: the place remembers, not the quest — and not one DM's
-- private copy. The original predicate reached `locations` directly, so it was
-- filtered away before is_campaign_dm ran and this returned 0.
select is(
  (select count(*)::integer from public.location_state_events
    where location_id = '7ff00000-0000-4000-8000-000000000020'),
  1,
  'a campaign DM sees state another DM asserted'
);

select is(
  (select value from public.location_state
    where location_id = '7ff00000-0000-4000-8000-000000000020' and fact = 'looted'),
  true,
  'and sees it through the view, so the vault is not looted for one DM and pristine for the other'
);

-- ── F3: an update may not repoint a row into someone else''s place ─────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7ff00000-0000-4000-8000-000000000002","role":"authenticated"}', true);

reset role;
insert into public.traps (id, user_id, campaign_id, name)
values ('7ff00000-0000-4000-8000-000000000030', '7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000011', 'Their trap');
insert into public.location_placements (id, user_id, location_id, trap_id)
values ('7ff00000-0000-4000-8000-000000000040', '7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000021', '7ff00000-0000-4000-8000-000000000030');

-- A location the stranger has no path to. Deliberately GLOBAL (campaign_id
-- null) rather than in a third campaign: the campaign quota refuses a third,
-- and a global location is the sharper test anyway. The policy's own predicate
-- says `campaign_id is null OR is_campaign_dm(...)`, so the null branch reads
-- as permissive — and it is not, because the surrounding `exists` runs under
-- `locations`' owner-only SELECT and never finds the row at all. Which is the
-- same mechanism that made F1 and F2 defects, working correctly here.
insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('7ff00000-0000-4000-8000-000000000022', '7ff00000-0000-4000-8000-000000000001', null, 'Off limits', 'dungeon');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"7ff00000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Creating one there is refused, as it always was. The hole was that USING was
-- reused as the check, so `user_id` was pinned and the pointer was not: create
-- on your own site, then repoint. Exactly what 20260828210805 exists to close.
select throws_ok(
  $$insert into public.location_placements (user_id, location_id, trap_id)
    values ('7ff00000-0000-4000-8000-000000000002', '7ff00000-0000-4000-8000-000000000022', '7ff00000-0000-4000-8000-000000000030')$$,
  '42501',
  null,
  'a placement cannot be created on a location you may not write'
);

select throws_ok(
  $$update public.location_placements set location_id = '7ff00000-0000-4000-8000-000000000022'
     where id = '7ff00000-0000-4000-8000-000000000040'$$,
  '42501',
  null,
  'and it cannot be repointed there afterwards either'
);

select is(
  (select location_id from public.location_placements where id = '7ff00000-0000-4000-8000-000000000040'),
  '7ff00000-0000-4000-8000-000000000021'::uuid,
  'the row still points where it was created'
);

select * from finish();
rollback;
