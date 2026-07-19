-- Migration: release_stale_credit_holds
-- Safety net for leaked credit reservations (#463 residual). reserve_credits()
-- inserts PENDING negative ledger rows that every generator releases on both the
-- success and failure paths — but a hard kill of the Edge isolate (wall-clock
-- timeout, platform crash) bypasses those paths and the hold would reduce the
-- user's balance forever. Sweep pending rows well past the longest legitimate
-- hold: the Meshy sculpt pipeline re-stamps its staleness clock per phase at
-- 30 min each (STALE_SCULPT_MS), so 2 hours clears every real in-flight hold.
-- A late release_credits() on already-swept ids only deletes `pending = true`
-- rows, so double-release stays a safe no-op.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'release-stale-credit-holds') then
    perform cron.unschedule('release-stale-credit-holds');
  end if;
end $$;

select cron.schedule(
  'release-stale-credit-holds',
  '*/15 * * * *',  -- every 15 minutes
  $$
    delete from public.ai_credit_ledger
    where pending = true
      and created_at < now() - interval '2 hours';
  $$
);
