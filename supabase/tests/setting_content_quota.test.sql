-- Content Grimoire ships must not count against a user's free-tier quota
-- (migration 20260818081308).
--
-- This is worth a regression test rather than a comment because the failure is
-- silent from the inside. `check_quota` returns a plausible number either way —
-- nothing errors, nothing logs — and the damage only appears at the moment a
-- free user presses "Populate Setting" and gets a paywall instead of the world
-- we promised them. Free caps are 5 factions, 5 deities and 3 pantheons;
-- populating Faerûn inserts 15, 112 and 13. So the gap between "counted" and
-- "not counted" is the difference between the button working and the button
-- being a dead end, and no test above the database can see which one is live.
--
-- Asserted on both sides for all three tables: a row the user made still counts
-- (otherwise the cap means nothing), and a row we seeded does not. The
-- `enforce_quota` trigger is exercised too, because `check_quota` returning the
-- right number is only half of it — the trigger is what actually refuses the
-- insert.

begin;

create extension if not exists pgtap with schema extensions;
-- Scoped to a fixture id throughout. `supabase db reset` seeds from a local
-- `seed.sql` that CI does not have, so an unscoped count passes in CI and fails
-- on a developer's machine.
select plan(21);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('63910000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'setting-quota@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('63910000-0000-4000-8000-0000000000c1', '63910000-0000-4000-8000-000000000001', 'Setting Quota');

-- ── The column exists and defaults to "the user made this" ──────────────────
--
-- Null is the load-bearing value: it is what an ordinary create leaves behind,
-- and therefore what has to keep counting. A default of anything else would
-- silently make every row free.
select col_is_null('public', 'factions',  'setting_source', 'factions.setting_source is nullable');
select col_is_null('public', 'deities',   'setting_source', 'deities.setting_source is nullable');
select col_is_null('public', 'pantheons', 'setting_source', 'pantheons.setting_source is nullable');
select col_is_null('public', 'locations', 'setting_source', 'locations.setting_source is nullable');

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'factions' and column_name = 'setting_source'),
  null,
  'a plain insert leaves setting_source null, so user rows keep counting'
);

-- ── Impersonate a plain free-plan user ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"63910000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Four of each, none marked: the user's own content.
insert into public.factions (user_id, campaign_id, name)
select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1', 'Mine ' || i
  from generate_series(1, 4) i;
insert into public.pantheons (user_id, campaign_id, name)
select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1', 'Mine ' || i
  from generate_series(1, 2) i;
insert into public.deities (user_id, campaign_id, name)
select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1', 'Mine ' || i
  from generate_series(1, 4) i;
insert into public.locations (user_id, campaign_id, name, location_type)
select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1', 'Mine ' || i, 'city'
  from generate_series(1, 4) i;

select is(
  (public.check_quota('factions') ->> 'current')::int, 4,
  'a user''s own factions count against the cap'
);
select is(
  (public.check_quota('pantheons') ->> 'current')::int, 2,
  'a user''s own pantheons count against the cap'
);
select is(
  (public.check_quota('deities') ->> 'current')::int, 4,
  'a user''s own deities count against the cap'
);

select is(
  (public.check_quota('locations') ->> 'current')::int, 4,
  'a user''s own locations count against the cap'
);

-- The UI draws its counters and raises its paywall from check_all_quotas, so
-- the two have to agree. They are the same rule written twice, and the
-- soundboard doc records what happened last time only one of them was changed.
select is(
  ((public.check_all_quotas() -> 'factions') ->> 'current')::int, 4,
  'check_all_quotas agrees before the rows are attributed'
);

-- ── The same rows, attributed to a setting ──────────────────────────────────
reset role;
update public.factions  set setting_source = 'faerun' where campaign_id = '63910000-0000-4000-8000-0000000000c1';
update public.pantheons set setting_source = 'faerun' where campaign_id = '63910000-0000-4000-8000-0000000000c1';
update public.deities   set setting_source = 'faerun' where campaign_id = '63910000-0000-4000-8000-0000000000c1';
update public.locations set setting_source = 'faerun' where campaign_id = '63910000-0000-4000-8000-0000000000c1';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"63910000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.check_quota('factions') ->> 'current')::int, 0,
  'factions we shipped do not count against the cap'
);
select is(
  (public.check_quota('pantheons') ->> 'current')::int, 0,
  'pantheons we shipped do not count against the cap'
);
select is(
  (public.check_quota('deities') ->> 'current')::int, 0,
  'deities we shipped do not count against the cap'
);

select is(
  (public.check_quota('locations') ->> 'current')::int, 0,
  'locations we shipped do not count against the cap'
);

select is(
  ((public.check_all_quotas() -> 'factions') ->> 'current')::int, 0,
  'check_all_quotas exempts them too, so the counter matches the trigger'
);
select is(
  ((public.check_all_quotas() -> 'locations') ->> 'current')::int, 0,
  'check_all_quotas exempts seeded locations as well'
);

-- ── The trigger, not just the count ─────────────────────────────────────────
--
-- The free faction cap is 5 and Faerûn ships 15. With the seeded rows excluded,
-- inserting well past the cap has to succeed — that insert is literally what
-- the Populate Setting button does.
select lives_ok(
  $$insert into public.factions (user_id, campaign_id, name, setting_source)
    select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1',
           'Shipped ' || i, 'faerun' from generate_series(1, 15) i$$,
  'populating a setting past the cap is allowed when the rows are ours'
);

-- And the cap still bites for content the user makes themselves, with 19 of our
-- rows already sitting in the table.
select lives_ok(
  $$insert into public.factions (user_id, campaign_id, name)
    select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1',
           'Own ' || i from generate_series(1, 5) i$$,
  'a free user still gets their full allowance of their own factions'
);

select throws_ok(
  $$insert into public.factions (user_id, campaign_id, name)
    values ('63910000-0000-4000-8000-000000000001',
            '63910000-0000-4000-8000-0000000000c1', 'One too many')$$,
  'quota_exceeded',
  'the cap still refuses the sixth faction the user makes themselves'
);

-- The Atlas is the worst case: every one of the nine settings ships more
-- locations than the free cap of 10 (Faerûn 35), and "Populate Planes" adds 20
-- more under a `planar` source that belongs to no setting. Both have to pass.
select lives_ok(
  $$insert into public.locations (user_id, campaign_id, name, location_type, setting_source)
    select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1',
           'Seeded Place ' || i, 'city', 'faerun' from generate_series(1, 35) i$$,
  'populating a setting''s 35 locations is allowed against a cap of 10'
);

select lives_ok(
  $$insert into public.locations (user_id, campaign_id, name, location_type, setting_source)
    select '63910000-0000-4000-8000-000000000001', '63910000-0000-4000-8000-0000000000c1',
           'Plane ' || i, 'plane', 'planar' from generate_series(1, 20) i$$,
  'the standard planes are exempt under their own source key'
);

select * from finish();
rollback;
