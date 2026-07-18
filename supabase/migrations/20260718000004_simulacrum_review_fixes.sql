-- Migration: simulacrum_review_fixes
-- Code-review fixes: (1) the mini-models bucket's allowed_mime_types rejected
-- the very formats the pipeline uploads (usdz/3mf/obj), wedging every real
-- sculpt in 'downloading'; (2) the poller cron decrypted the Vault secret every
-- minute BEFORE the far cheaper "any in-flight minis?" existence check.

update storage.buckets
set allowed_mime_types = array[
  'model/gltf-binary',
  'model/stl',
  'model/vnd.usdz+zip',
  'model/3mf',
  'text/plain',            -- .obj
  'application/octet-stream',
  'image/webp'
]
where id = 'mini-models';

-- Reschedule the poller with the guards reordered cheapest-first: the partial
-- index minis_active_status_idx makes the existence check ~free, and in steady
-- state (no in-flight minis) it short-circuits before any Vault decrypt.
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
    begin
      if not exists (select 1 from public.minis where status in ('sculpting', 'downloading')) then
        return;
      end if;

      select decrypted_secret
        into hook_url
        from vault.decrypted_secrets
       where name = 'simulacrum_poller_url'
       limit 1;

      if hook_url is null then
        return;
      end if;

      perform net.http_post(
        url     := hook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := '{}'::jsonb
      );
    end
    $poll$;
  $$
);
