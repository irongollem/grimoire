-- Migration: rate_limit_events
-- Per-user, per-action rate limiting (issue #466 — defense-in-depth follow-up to
-- the security review). The cost-drain and bug-report-injection EXPLOITS are
-- already closed (credit reservation; field fencing); this throttles abusive
-- BURST volume: a credit-holding user hammering the paid AI generators, or any
-- authenticated user spamming GitHub issues via the bug reporter.
--
-- An append-only event log + an advisory-locked check_rate_limit() RPC that
-- atomically counts events in the trailing window and records the new one. The
-- edge functions (service role) call it before doing paid/external work.

create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, action, created_at);

-- RLS on, NO policies: clients (anon/authenticated) get default-deny. Only the
-- service-role edge functions touch this table, via the SECURITY DEFINER RPC.
alter table public.rate_limit_events enable row level security;

-- Returns true and records the event if the user is under the limit for this
-- action in the trailing window; returns false (records nothing) when at/over.
create or replace function public.check_rate_limit(
  p_user_id        uuid,
  p_action         text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Serialize this user's checks for this action so concurrent requests can't
  -- both observe the same pre-insert count and slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0));

  select count(*) into v_count
    from rate_limit_events
   where user_id = p_user_id
     and action  = p_action
     and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_events (user_id, action) values (p_user_id, p_action);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

-- Keep the log small: purge events older than a day (longest window in use is
-- the bug-report daily cap). Idempotent reschedule, mirroring fail-stale-image-jobs.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-rate-limit-events') then
    perform cron.unschedule('purge-rate-limit-events');
  end if;
end $$;

select cron.schedule(
  'purge-rate-limit-events',
  '17 * * * *',  -- hourly, off the top of the hour
  $$ delete from public.rate_limit_events where created_at < now() - interval '25 hours'; $$
);
