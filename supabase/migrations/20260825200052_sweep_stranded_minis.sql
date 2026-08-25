-- Migration: sweep_stranded_minis
--
-- Closes #771. `minis` is its own job table and the only thing that advances or
-- fails a row is `poll-meshy-jobs`. Staleness is evaluated *inside* that poller
-- (`isStale`, `sculptPhaseStartedAt` in `_shared/simulacrum.ts`), so the worker
-- is also its own watchdog: if it stops, a mini sits in `sculpting` or
-- `downloading` forever with the UI showing progress that will never arrive.
-- Every sibling job table already has a SQL-only liveness sweep that does not
-- depend on its worker being alive — `fail-stale-image-jobs` (20260613000004),
-- `fail-stale-ai-generation-jobs` (20260730000002),
-- `sweep-stranded-document-imports` (20260825003319). This is the one for minis.
--
-- Not hypothetical: `poll-meshy-jobs` was scheduled, `active`, and never ran a
-- single poll between 18 July and 25 Aug 2026 because two Vault secrets were
-- never provisioned (20260825073922). Had a sculpt been started in that window
-- it would still be `sculpting` today.
--
-- ── #771 said this needed the Meshy subscription first. It does not ──────────
--
-- The issue deferred this because the obvious sweep — "`sculpting` for more
-- than N hours → `failed`" — destroys paid work, and choosing N needs a real
-- p99 sculpt. That is true of *that* sweep. It is avoidable by not writing it:
-- nothing below asks how long a sculpt takes, whether an unpolled Meshy task is
-- still queryable, or whether `cancel` refunds (all three still Phase 4 items).
-- Instead there are two clocks, both already known, neither a guess:
--
--   poller liveness   →  15 minutes. Derived from OUR cron cadence (1 min) and
--                        OUR lease (POLL_LEASE_MS, 10 min), not from Meshy.
--   asset retention   →  3 days. Meshy's published non-Enterprise lifetime.
--                        Past it there is nothing left to collect, so failing
--                        the row destroys nothing.
--
-- ── Why `polled_at` has to exist ────────────────────────────────────────────
--
-- #771 said "measure liveness from `updated_at`", which is what the #769 sweep
-- does. It does not work here, for two independent reasons:
--
--   1. That sweep writes once, terminally. This one nudges repeatedly, and its
--      own write bumps `updated_at` via the `minis_updated_at` trigger — so the
--      signal would be measuring the sweep, not the poller.
--   2. A poller that is alive and legitimately retrying a failing download is
--      indistinguishable from an absent one by `updated_at` alone, and the two
--      need opposite treatment: the first must be allowed to give up at 30
--      minutes (the poller deliberately does not re-stamp `download_started_at`
--      on retry ticks, precisely so it can), the second must not count at all.
--
-- So the poller stamps `polled_at` on every claim and the sweep never writes
-- it. This still does not depend on the edge function being reachable — the
-- *absence* of writes is the signal. It also makes "is the poller running?" a
-- question SQL can answer, which is the operator signal #771 says is missing.
alter table public.minis
  add column if not exists polled_at timestamptz;

comment on column public.minis.polled_at is
  'Last time poll-meshy-jobs claimed this row. Written only by the poller; the liveness signal private.sweep_stranded_minis() reads. Stale or null while a mini is in flight means no poller is looking at it.';

-- ── The sweep ───────────────────────────────────────────────────────────────
--
-- `sculpting` is never nudged and `downloading` always is. That asymmetry is
-- the whole design, and it is not an oversight in either direction:
--
--   `sculpting` is PROVIDER time. It elapses whether or not we are watching, so
--   an outage does not entitle the task to more of it. Nothing is lost by
--   leaving it: `resolveSculptOutcome` returns "complete" for SUCCEEDED
--   *before* it consults `stale`, so a returning poller still collects a task
--   that finished while we were down. Only a task genuinely still IN_PROGRESS
--   hours later gets failed, which is the correct answer. Leaving it untouched
--   also keeps `sculpt_started_at` immutable, which is what makes it a usable
--   retention anchor below.
--
--   `downloading` is OUR time. It only elapses while we are actually trying,
--   and the poller's own message for exhausting it says so — "Model download
--   failed repeatedly". After an outage that is a lie, and an expensive one:
--   the row is a sculpt Meshy has already SUCCEEDED and would still hand us,
--   and the poller's stale short-circuit fails it *before* re-polling. Nudging
--   the phase clock while nobody is polling is exactly #771's "prefer nudging
--   the row back into a re-pollable state over failing it".
create or replace function private.sweep_stranded_minis()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_stranded integer;
  v_mini record;
  v_reservations uuid[];
begin
  -- Counted before anything is collected, so the warning reports the full
  -- extent of the outage rather than what happens to survive this pass.
  select count(*) into v_stranded
    from public.minis
   where status in ('sculpting', 'downloading')
     and coalesce(polled_at, sculpt_started_at, created_at) < now() - interval '15 minutes';

  -- Silent when there is nothing waiting, exactly like 20260825073922 — which
  -- is why this cannot become log spam. It is deliberately broader than that
  -- job's two Vault checks: this fires for *any* reason the poller is not
  -- polling, including the third go-live value (`SIMULACRUM_POLLER_TOKEN` on
  -- the function, whose absence 503s the call that pg_net reports as sent) and
  -- a function that was never deployed. Those are invisible to a Vault check.
  if v_stranded > 0 then
    raise warning 'sweep-stranded-minis: % mini(s) in flight have not been polled in over 15 minutes — poll-meshy-jobs is not running. Check all three values in the Phase 4 go-live checklist (vault simulacrum_poller_url, vault simulacrum_poller_token, edge secret SIMULACRUM_POLLER_TOKEN) and that the function is deployed', v_stranded;
  end if;

  -- ── Terminal collection, and only past the point where Meshy has dropped
  -- the asset anyway. Anchored on `sculpt_started_at` (set by forge-mini at
  -- task creation and never moved by this function), so it means "3 days since
  -- the Meshy task existed" rather than "3 days since we last wrote a row".
  --
  -- With a healthy poller this is unreachable: `isStale` terminates an
  -- in-flight row at 30 minutes. Getting here means the poller has been absent
  -- for three days, which is what the warning above has been saying every five
  -- minutes since minute fifteen.
  for v_mini in
    select id, glb_path, credits_spent, reservation_ids
      from public.minis
     where status in ('sculpting', 'downloading')
       and coalesce(sculpt_started_at, created_at) < now() - interval '3 days'
  loop
    -- `reservation_ids` is jsonb; release_credits takes uuid[]. The typeof
    -- guard keeps a malformed value from aborting the whole sweep.
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_reservations
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_mini.reservation_ids) = 'array'
             then v_mini.reservation_ids
             else '[]'::jsonb end
      );

    -- Mirrors the poller's own failMini: a failed FIRST sculpt has no model to
    -- fall back to and is not charged (credits_spent 0, hold released — "our
    -- tooling giving up" is refundable under the documented policy); a failed
    -- RE-sculpt keeps the previous model and its charge. `sculpt_count` is left
    -- alone in both cases, so a retry is still allowed and free re-sculpts are
    -- not consumed by our own downtime.
    update public.minis
       set status          = case when v_mini.glb_path is not null then 'ready' else 'failed' end,
           error           = case
                               when v_mini.glb_path is not null
                                 then 'This re-sculpt was lost while the model service was unreachable. Your existing model is unchanged — you can try again.'
                                 else 'This sculpt was lost while the model service was unreachable. Nothing was charged — you can start it again.'
                             end,
           credits_spent   = case when v_mini.glb_path is not null then v_mini.credits_spent else 0 end,
           meshy_task_id   = null,
           reservation_ids = null,
           poll_lease_id   = null,
           poll_lease_until = null,
           poll_last_error = 'Stranded: no poller claimed this mini before Meshy dropped the asset'
     where id = v_mini.id;

    -- After the conditional write, never before: releasing first could drop a
    -- reservation a live worker still owns. Re-releasing already-swept ids is a
    -- safe no-op (release_credits deletes only `pending = true` rows), which
    -- matters because release-stale-credit-holds has cleared these at 2 hours
    -- long before three days — credits were never the exposure here.
    if cardinality(v_reservations) > 0 then
      perform public.release_credits(v_reservations);
    end if;
  end loop;

  -- ── The nudge. Only `downloading`, only while no poller is looking.
  --
  -- Re-armed at most every 10 minutes against the poller's 30-minute window
  -- (STALE_SCULPT_MS), which leaves two thirds of the window as headroom for a
  -- poller returning between passes while keeping the write — and the Realtime
  -- broadcast it triggers — off every five-minute tick.
  update public.minis
     set download_started_at = now()
   where status = 'downloading'
     and coalesce(polled_at, sculpt_started_at, created_at) < now() - interval '15 minutes'
     and coalesce(download_started_at, sculpt_started_at, created_at) < now() - interval '10 minutes';
end;
$$;

comment on function private.sweep_stranded_minis() is
  'Backstop for minis stranded by an absent poll-meshy-jobs (#771): warns while any in-flight mini has gone unpolled, keeps downloading rows re-pollable so a recovered poller can still collect a succeeded sculpt, and terminally fails a row only once Meshy has dropped the asset. Called every 5 minutes by the sweep-stranded-minis cron.';

revoke execute on function private.sweep_stranded_minis() from public;

-- `stylizing` is deliberately absent from all three passes above. It is not
-- unbackstopped: the render is an `image_generation_jobs` row swept by
-- fail-stale-image-jobs, and 20260730000001's `sync_failed_mini_style_job`
-- trigger drags the mini to `image_ready`/`failed` with it. Adding it here
-- would be a second opinion on a row this function cannot see.

-- ── Schedule ────────────────────────────────────────────────────────────────
-- Every 5 minutes, matching the three sibling liveness sweeps. Unschedule then
-- schedule so re-running the migration is idempotent (20260613000004).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-stranded-minis') then
    perform cron.unschedule('sweep-stranded-minis');
  end if;
end $$;

select cron.schedule(
  'sweep-stranded-minis',
  '*/5 * * * *',
  $$ select private.sweep_stranded_minis(); $$
);
