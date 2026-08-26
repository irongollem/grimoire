begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

-- Cover for the #771 backstop (20260825200052). Three properties are pinned,
-- and only the first is the obvious one:
--
--   1. A mini stranded by an absent poller is kept re-pollable, and terminally
--      collected only once Meshy has dropped the asset.
--   2. A poller that is ALIVE and retrying a failing download is left entirely
--      alone. This is the property the sweep is most likely to break, because
--      the two situations look identical in `updated_at` and want opposite
--      treatment: the poller deliberately does not re-stamp `download_started_at`
--      on retry ticks so it can give up at 30 minutes (STALE_SCULPT_MS), and a
--      sweep that nudged that row would make the download immortal instead.
--   3. The terminal write cannot undo a poller that came back mid-loop.
--   4. The sweep never writes `polled_at`. Asserted against the function body,
--      because an outcome test cannot see a statement nobody has written yet —
--      and the moment the sweep writes that column it is measuring itself, and
--      every liveness answer below silently becomes true forever.

select has_function('private', 'sweep_stranded_minis',
  'the stranded-mini sweep exists');

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- One DM, one source entity id reused throughout (minis do not FK it), and one
-- row per situation the sweep has an opinion about. `polled_at` is the only
-- liveness input, so it is varied deliberately against otherwise-similar rows.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('77100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'issue771-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.minis
  (id, user_id, source_table, source_id, format, status, meshy_task_id,
   glb_path, credits_spent, reservation_ids, sculpt_count,
   polled_at, sculpt_started_at, download_started_at)
values
  -- A: downloading, no poller for an hour → must be nudged.
  ('77100000-0000-4000-8000-00000000000a', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'downloading', 'task-a',
   null, 500, null, 0,
   now() - interval '1 hour', now() - interval '70 minutes', now() - interval '65 minutes'),

  -- B: downloading, poller polled a minute ago and has been retrying a failing
  -- download for 25 minutes → must be left to time out at 30.
  ('77100000-0000-4000-8000-00000000000b', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'downloading', 'task-b',
   null, 500, null, 0,
   now() - interval '1 minute', now() - interval '30 minutes', now() - interval '25 minutes'),

  -- C: sculpting, no poller for an hour → provider time, so NOT nudged.
  ('77100000-0000-4000-8000-00000000000c', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'sculpting', 'task-c',
   null, 500, null, 0,
   now() - interval '1 hour', now() - interval '70 minutes', null),

  -- D: first sculpt, four days old, no model → terminal fail, nothing charged.
  ('77100000-0000-4000-8000-00000000000d', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'sculpting', 'task-d',
   null, 500, '["77100000-0000-4000-8000-0000000000e1"]'::jsonb, 0,
   now() - interval '4 days', now() - interval '4 days', null),

  -- E: re-sculpt, four days old, previous model intact → back to ready, charge
  -- kept, free re-sculpts not consumed by our downtime.
  ('77100000-0000-4000-8000-00000000000e', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'downloading', 'task-e',
   'u/e/model.glb', 500, null, 1,
   now() - interval '4 days', now() - interval '4 days', now() - interval '4 days'),

  -- F: stylizing and long stale → backstopped elsewhere, never touched here.
  ('77100000-0000-4000-8000-00000000000f', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'stylizing', null,
   null, 0, null, 0,
   null, now() - interval '4 days', null),

  -- G: finished mini, older than every window → never touched.
  ('77100000-0000-4000-8000-000000000010', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'ready', null,
   'u/g/model.glb', 500, null, 1,
   now() - interval '4 days', now() - interval '4 days', now() - interval '4 days'),

  -- H: a sculpt that started 90 seconds ago and has not been claimed yet, so
  -- `polled_at` is still null. The coalesce fallback must not read that as
  -- stranded — otherwise every new mini is stranded the moment it is created.
  ('77100000-0000-4000-8000-000000000011', '77100000-0000-4000-8000-000000000001',
   'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'downloading', 'task-h',
   null, 500, null, 0,
   null, now() - interval '90 seconds', now() - interval '60 seconds');

-- A pending hold for D, of the shape reserve_credits writes.
insert into public.ai_credit_ledger (id, user_id, delta, reason, pending)
values ('77100000-0000-4000-8000-0000000000e1', '77100000-0000-4000-8000-000000000001',
        -500, 'mini_sculpt', true);

select private.sweep_stranded_minis();

-- ── The nudge ───────────────────────────────────────────────────────────────

select ok(
  (select download_started_at from public.minis where id = '77100000-0000-4000-8000-00000000000a')
    > now() - interval '1 minute',
  'a downloading mini nobody is polling has its phase clock kept fresh, so a recovered poller re-downloads instead of failing it');

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-00000000000a'),
  'downloading',
  'nudging does not change the status — the row stays exactly where the poller expects it');

-- The property most at risk. A live poller has to keep its own right to give up.
select ok(
  (select download_started_at from public.minis where id = '77100000-0000-4000-8000-00000000000b')
    < now() - interval '20 minutes',
  'a download the poller is actively retrying is never nudged, so it can still time out at STALE_SCULPT_MS');

-- Sculpt time is provider time: it elapses whether or not we were watching, and
-- leaving it immutable is what makes it a usable retention anchor below.
select ok(
  (select sculpt_started_at from public.minis where id = '77100000-0000-4000-8000-00000000000c')
    < now() - interval '60 minutes',
  'a stranded sculpting mini keeps its original phase clock — sculpt time is not ours to refund');

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-00000000000c'),
  'sculpting',
  'a stranded sculpting mini inside the retention window is not failed');

select ok(
  (select download_started_at from public.minis where id = '77100000-0000-4000-8000-000000000011')
    < now() - interval '30 seconds',
  'a just-started mini with no polled_at yet is not treated as stranded');

-- ── Terminal collection, past Meshy retention ───────────────────────────────

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-00000000000d'),
  'failed',
  'a first sculpt stranded past Meshy asset retention is finally failed');

select ok(
  (select error from public.minis where id = '77100000-0000-4000-8000-00000000000d')
    like '%start it again%',
  'the failure tells the DM what to do rather than naming our poller');

select is(
  (select credits_spent from public.minis where id = '77100000-0000-4000-8000-00000000000d'),
  0::numeric,
  'a first sculpt lost to our own downtime is not charged');

select ok(
  (select meshy_task_id from public.minis where id = '77100000-0000-4000-8000-00000000000d') is null,
  'the dead Meshy task id is cleared so nothing re-polls it');

select is(
  (select count(*)::integer from public.ai_credit_ledger
    where id = '77100000-0000-4000-8000-0000000000e1'),
  0,
  'the pending credit hold is released with the terminal failure');

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-00000000000e'),
  'ready',
  'a stranded RE-sculpt falls back to the model it already had');

select is(
  (select credits_spent from public.minis where id = '77100000-0000-4000-8000-00000000000e'),
  500::numeric,
  'that fallback keeps the charge for the sculpt the DM actually received');

select is(
  (select sculpt_count from public.minis where id = '77100000-0000-4000-8000-00000000000e'),
  1,
  'our downtime does not consume one of the free re-sculpts');

-- ── What it must leave alone ────────────────────────────────────────────────
--
-- `stylizing` is backstopped by fail-stale-image-jobs plus the
-- sync_failed_mini_style_job trigger (20260730000001). A second opinion here,
-- on a row whose actual job this function cannot see, would race that one.

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-00000000000f'),
  'stylizing',
  'a stylizing mini is never swept here, however stale — its backstop is the image job');

select is(
  (select status from public.minis where id = '77100000-0000-4000-8000-000000000010'),
  'ready',
  'a finished mini is never swept');

-- ── The mid-loop race ───────────────────────────────────────────────────────
--
-- The loop's cursor is a snapshot and each iteration costs a `release_credits`
-- round-trip, so under READ COMMITTED a poller returning after three days can
-- claim a row and complete it while the sweep is still working through earlier
-- ones. Keyed on `id` alone the terminal write would then apply the stale
-- snapshot over a finished, paid sculpt — `failed`, credits_spent 0, the fresh
-- glb_path orphaned — which is the one outcome this backstop exists to prevent.
--
-- Reproduced deterministically with a trigger that fires on the sweep's first
-- terminal write and completes every other row the loop had already snapshotted.
-- Whichever row goes first, exactly three must survive untouched.

insert into public.minis
  (id, user_id, source_table, source_id, format, status, meshy_task_id,
   glb_path, credits_spent, reservation_ids, sculpt_count,
   polled_at, sculpt_started_at, download_started_at)
select
  ('77100000-0000-4000-8000-00000000002' || n)::uuid,
  '77100000-0000-4000-8000-000000000001',
  'npcs', '77100000-0000-4000-8000-0000000000ff', 'print', 'downloading', 'task-race-' || n,
  null, 500, jsonb_build_array('77100000-0000-4000-8000-00000000003' || n), 0,
  now() - interval '4 days', now() - interval '4 days', now() - interval '4 days'
from generate_series(1, 4) as n;

insert into public.ai_credit_ledger (id, user_id, delta, reason, pending)
select ('77100000-0000-4000-8000-00000000003' || n)::uuid,
       '77100000-0000-4000-8000-000000000001', -500, 'mini_sculpt', true
from generate_series(1, 4) as n;

create function pg_temp.simulate_returning_poller() returns trigger
language plpgsql as $fn$
begin
  -- Once only: the update below re-enters this trigger for every row it touches.
  if current_setting('test.poller_returned', true) is not null then return new; end if;
  perform set_config('test.poller_returned', '1', true);
  update public.minis
     set status = 'ready', glb_path = 'u/recovered/model.glb'
   where id <> new.id
     and status in ('sculpting', 'downloading')
     and coalesce(sculpt_started_at, created_at) < now() - interval '3 days';
  return new;
end;
$fn$;

create trigger zz_simulate_returning_poller
  before update on public.minis
  for each row execute procedure pg_temp.simulate_returning_poller();

select private.sweep_stranded_minis();

drop trigger zz_simulate_returning_poller on public.minis;

select is(
  (select count(*)::integer from public.minis
    where glb_path = 'u/recovered/model.glb' and status <> 'ready'),
  0,
  'a mini a returning poller completed mid-sweep keeps its status — the stale snapshot never lands on it');

select is(
  (select count(*)::integer from public.minis
    where glb_path = 'u/recovered/model.glb' and credits_spent <> 500),
  0,
  'and keeps the charge for the sculpt the DM actually received');

select is(
  (select count(*)::integer from public.ai_credit_ledger
    where pending
      and id in (select (reservation_ids ->> 0)::uuid from public.minis
                  where glb_path = 'u/recovered/model.glb')),
  3,
  'the holds of a row the poller won are left for the poller to settle, not released underneath it');

-- ── Structural ──────────────────────────────────────────────────────────────

select ok(
  exists (select 1 from cron.job where jobname = 'sweep-stranded-minis' and active),
  'the sweep is actually scheduled');

-- Body-based on purpose. `polled_at` is poller-only by construction; the moment
-- this function writes it, the sweep is measuring its own writes and every
-- liveness check above passes forever without meaning anything.
select ok(
  pg_get_functiondef('private.sweep_stranded_minis()'::regprocedure) !~* 'polled_at\s*=',
  'the sweep reads polled_at but never writes it');

select * from finish();
rollback;
