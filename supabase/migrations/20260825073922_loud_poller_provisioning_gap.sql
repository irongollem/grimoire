-- Migration: loud_poller_provisioning_gap
--
-- `poll-meshy-jobs` has never polled anything, and nothing said so.
--
-- It is scheduled and `active` in production and has been since 18 July.
-- `cron.job_run_details` reports `succeeded` every minute. But the body added by
-- 20260718000007 reads two Vault secrets — `simulacrum_poller_url` and
-- `simulacrum_poller_token` — and returns silently if either is missing, and
-- production `vault.secrets` holds exactly one row (`marketing_deploy_hook`).
-- So every one of those successes was the job deciding it had nothing it could
-- do and saying nothing about it.
--
-- That is harmless today (Simulacrum is gated behind `simulacrum_mode` and there
-- are zero `minis` rows) and it is precisely the shape that is not harmless at
-- go-live: the Meshy subscription is paid for, a DM starts a sculpt, and the
-- mini sits in `sculpting` forever while every dashboard says the poller is
-- healthy. The three provisioning steps are manual and nothing verifies them.
--
-- The fix is not to provision them here — a migration cannot know the project's
-- own function URL, and a secret committed to a public repo is not a secret.
-- The fix is to make the gap audible. When there is genuinely nothing to poll
-- the job stays silent, exactly as before; when minis are waiting and the job
-- cannot act, it says which secret is missing, in the Postgres log, every time.
--
-- Everything else is byte-identical to 20260718000007, including the decision
-- that put the bearer in a header rather than the URL. Restated in full because
-- `cron.schedule` has no partial form.
--
-- The wider lesson, and the reason this is written down rather than just fixed:
-- a scheduled job whose failure mode is "looks scheduled, never runs" is not a
-- job. #769 declined this whole pattern on the evidence of this one, and put its
-- storage collection on a code path that cannot be left unprovisioned.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'poll-meshy-jobs') then
    perform cron.unschedule('poll-meshy-jobs');
  end if;
end $$;

select cron.schedule(
  'poll-meshy-jobs',
  '* * * * *',
  $$
    do $poll$
    declare
      hook_url text;
      hook_token text;
      waiting integer;
    begin
      -- Unchanged: no in-flight minis means no work and no Vault decrypt. This
      -- is why the warnings below cannot become log spam — they are only
      -- reachable when something is genuinely waiting on this job.
      select count(*) into waiting
        from public.minis
       where status in ('sculpting', 'downloading');

      if waiting = 0 then
        return;
      end if;

      select decrypted_secret into hook_url
        from vault.decrypted_secrets
       where name = 'simulacrum_poller_url'
       limit 1;

      select decrypted_secret into hook_token
        from vault.decrypted_secrets
       where name = 'simulacrum_poller_token'
       limit 1;

      -- Named individually rather than as one combined message: the go-live
      -- step that gets missed is the *second* Vault secret, because the feature
      -- doc described only the first until this was found. "One of two secrets
      -- is missing" would send whoever reads it back to the same wrong list.
      if hook_url is null then
        raise warning 'poll-meshy-jobs: vault secret simulacrum_poller_url is not set — % mini(s) are waiting and cannot be polled', waiting;
      end if;

      if hook_token is null then
        raise warning 'poll-meshy-jobs: vault secret simulacrum_poller_token is not set — % mini(s) are waiting and cannot be polled', waiting;
      end if;

      if hook_url is null or hook_token is null then
        return;
      end if;

      -- Bearer in a header, never the URL: pg_net, proxies and access logs all
      -- retain URLs. 20260718000007 exists for this, and the go-live checklist
      -- said `?token=` for a month after it.
      perform net.http_post(
        url     := hook_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || hook_token
        ),
        body    := '{}'::jsonb
      );
    end
    $poll$;
  $$
);
