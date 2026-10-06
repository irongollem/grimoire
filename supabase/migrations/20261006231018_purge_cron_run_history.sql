-- #999 story 3.1: keep a week of pg_cron run history, not all of it.
--
-- pg_cron logs every run in cron.job_run_details and never prunes it. With
-- poll-meshy-jobs every minute, fail-stale/sweep jobs every five, and each row
-- carrying the job's full command text, the table had reached ~204k rows and
-- ~379 MB by 7 Oct 2026: more than half of the whole database, on an instance
-- with little memory to spare. A week is plenty to debug a failing job from.
--
-- The first run does the large delete. It is left to the schedule (04:41 UTC,
-- the quiet hours the other daily purges use) rather than run inline here, so a
-- deploy never waits on a delete of that size. Same unschedule-then-schedule
-- shape as purge-rate-limit-events (20260621000008), so a replay is idempotent.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-cron-run-history') then
    perform cron.unschedule('purge-cron-run-history');
  end if;
end $$;

select cron.schedule(
  'purge-cron-run-history',
  '41 4 * * *',  -- daily, after the 04:00-04:20 retention purges
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $$
);
