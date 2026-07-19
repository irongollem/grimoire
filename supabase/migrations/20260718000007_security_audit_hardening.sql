-- Migration: security_audit_hardening
-- Close the remaining trust-boundary gaps in the Simulacrum and waitlist work.

-- `minis` is a server-owned job/state table. Allowing clients to insert or
-- update rows lets a caller forge `status`, `sculpt_count`, and image URLs, then
-- invoke the free resculpt path without ever reserving credits. All mutations
-- already go through forge-mini (service role), including delete/set_base.
drop policy if exists "minis_insert" on public.minis;
drop policy if exists "minis_update" on public.minis;
drop policy if exists "minis_delete" on public.minis;

revoke insert, update, delete on table public.minis from anon, authenticated;

-- Mini artifacts are DM work product. The previous campaign-member branch also
-- included players, exposing secret NPC/monster sculpts through direct REST
-- queries even though the player UI has no minis route.
drop policy if exists "minis_select" on public.minis;
create policy "minis_select" on public.minis
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
  );

-- This table currently has one deliberately supported key. Leaving it as
-- arbitrary text lets any account bypass the per-(user, feature) uniqueness
-- guard and create an unbounded number of rows.
alter table public.feature_interest
  add constraint feature_interest_known_feature_check
  check (feature in ('simulacrum'));

-- Bound anonymous waitlist input so a public PostgREST insert cannot create
-- oversized TOAST values. The email regex remains the format check.
alter table public.pro_waitlist
  add constraint pro_waitlist_email_length_check
    check (char_length(email) between 3 and 320),
  add constraint pro_waitlist_source_length_check
    check (source is null or char_length(source) between 1 and 64);

-- Keep the poller bearer credential out of URLs, which are routinely retained
-- in pg_net/proxy/access logs. Go-live provisioning must store the function URL
-- (without a token query parameter) as `simulacrum_poller_url` and the same
-- high-entropy value used by the Edge Function as `simulacrum_poller_token`.
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
    begin
      if not exists (select 1 from public.minis where status in ('sculpting', 'downloading')) then
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

      if hook_url is null or hook_token is null then
        return;
      end if;

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
