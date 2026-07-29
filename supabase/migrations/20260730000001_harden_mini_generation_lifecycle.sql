-- Mini generation lifecycle hardening:
-- * retain the active 2D style job on its mini, so an in-flight render can be
--   resumed instead of started again;
-- * give the Meshy poller a short, recoverable lease so overlapping pg_net
--   invocations cannot download, settle, or charge the same sculpt twice;
-- * keep phase timestamps separate from updated_at (lease renewals are normal
--   writes and must not prevent a genuinely stuck provider job timing out).

alter table public.minis
  add column if not exists stylize_job_id uuid references public.image_generation_jobs(id) on delete set null,
  add column if not exists sculpt_started_at timestamptz,
  add column if not exists download_started_at timestamptz,
  add column if not exists poll_lease_id uuid,
  add column if not exists poll_lease_until timestamptz,
  add column if not exists poll_last_error text;

-- Existing in-flight rows predate phase timestamps. Their last meaningful
-- update is the best available start point and preserves the former timeout
-- behaviour after this migration.
update public.minis
set sculpt_started_at = updated_at
where status in ('sculpting', 'downloading')
  and sculpt_started_at is null;

update public.minis
set download_started_at = updated_at
where status = 'downloading'
  and download_started_at is null;

create index if not exists minis_poll_claim_idx
  on public.minis (status, poll_lease_until, sculpt_started_at)
  where status in ('sculpting', 'downloading');

create unique index if not exists minis_active_stylize_job_idx
  on public.minis (stylize_job_id)
  where stylize_job_id is not null;

-- The generic stale-image-job sweep only knows about the job row. Keep the
-- mini's visible state in lockstep when that job terminally fails, otherwise a
-- reopened forge would display "Stylizing" forever despite a retry being safe.
create or replace function public.sync_failed_mini_style_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed'
     and new.target_table = 'minis'
     and new.target_id is not null then
    update public.minis
    set stylize_job_id = null,
        status = case when stylized_image_url is null then 'failed' else 'image_ready' end,
        error = coalesce(new.error, 'Stylize failed')
    where stylize_job_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists image_job_sync_failed_mini_style on public.image_generation_jobs;
create trigger image_job_sync_failed_mini_style
  after update of status on public.image_generation_jobs
  for each row
  when (new.status = 'failed')
  execute function public.sync_failed_mini_style_job();

revoke execute on function public.sync_failed_mini_style_job() from public, anon, authenticated;
