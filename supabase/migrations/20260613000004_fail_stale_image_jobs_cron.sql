-- Migration: fail_stale_image_jobs_cron
-- Safety net for stuck async image_generation_jobs: a pg_cron sweep that flips
-- any job still 'pending' well past the longest realistic render (10 min) to
-- 'failed'. The worker (generate-chronicle-image) runs in an Edge isolate via
-- EdgeRuntime.waitUntil(); if that isolate is killed before it writes the
-- result, the row would otherwise sit 'pending' forever. This guarantees every
-- job reaches a terminal state so the UI never spins indefinitely.

create extension if not exists pg_cron;

-- Idempotent (re)schedule: unschedule a prior incarnation if present, then add.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fail-stale-image-jobs') then
    perform cron.unschedule('fail-stale-image-jobs');
  end if;
end $$;

select cron.schedule(
  'fail-stale-image-jobs',
  '*/5 * * * *',  -- every 5 minutes
  $$
    update public.image_generation_jobs
    set status       = 'failed',
        error        = 'Generation timed out — the image worker did not finish in time. Please try again.',
        completed_at  = now()
    where status = 'pending'
      and created_at < now() - interval '10 minutes';
  $$
);
