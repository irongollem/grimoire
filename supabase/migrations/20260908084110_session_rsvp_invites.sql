-- Migration: session_rsvp_invites
-- Per-recipient RSVP capability for a proposed session date, so a player can
-- answer from the invitation their mail app drew Accept/Decline on, or from a
-- one-click link in the same message, without signing in to Grimoire.
--
-- WHY THIS EXISTS. Availability lived behind a login on a settings page, and
-- the calendar feed carried confirmed sessions only. Between the two, a date
-- the DM suggested on Tuesday reached nobody until session day, which is after
-- the only window in which answering it changes anything. The feed change
-- (ical-feed) makes the suggestion visible; this makes it answerable from the
-- place the player is already standing — their mail client.
--
-- The capability is a per (proposal × player) uuid, the same shape and entropy
-- as campaigns.ical_token and pro_waitlist.unsubscribe_token, and it is used
-- two ways, both of which arrive with no session:
--
--   1. It is the local part of the ORGANIZER address on the emailed
--      METHOD:REQUEST invitation (rsvp+<token>@…). A mail app copies ORGANIZER
--      verbatim into its METHOD:REPLY, so the reply identifies itself — we
--      never have to trust a From header or match on an email address.
--   2. It is the token on the Yes / Can't-make-it links in the same message,
--      for clients that render no invitation UI at all.
--
-- Stored rather than derived (an HMAC over proposal+user) for the reason
-- 20260811221206 gives: an opaque per-row token keeps identifiers out of URLs
-- that travel through mail servers, proxies and logs, and it dies with the row.

-- ── The invitations ──────────────────────────────────────────────────────────
create table if not exists public.session_proposal_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  session_proposal_id uuid not null references public.session_proposals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  -- iTIP SEQUENCE. Bumped every time the invitation is re-issued, which is how
  -- a mail client knows a re-sent invitation for a moved date supersedes the
  -- copy already in its calendar rather than being a duplicate of it.
  sequence integer not null default 0,
  responded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (session_proposal_id, user_id)
);

create unique index session_proposal_invites_token_key
  on public.session_proposal_invites (token);
create index session_proposal_invites_campaign_idx
  on public.session_proposal_invites (campaign_id);
create index session_proposal_invites_user_id_idx
  on public.session_proposal_invites (user_id);

create trigger session_proposal_invites_updated_at
  before update on public.session_proposal_invites
  for each row execute procedure update_updated_at();

comment on table public.session_proposal_invites is
  'One RSVP capability token per (session proposal x player). Never readable by anon or authenticated: the token answers on that player''s behalf, so a DM who could read it could answer for their party. Reached only through the service_role RPCs below and the session-rsvp / session-rsvp-inbound Edge Functions.';

comment on column public.session_proposal_invites.token is
  'Capability token. Travels as the ORGANIZER local part (rsvp+<token>@) on the emailed invitation and as the ?token= on its one-click links.';

-- RLS on with no policies at all — deny-all for anon and authenticated, exactly
-- as on the *_embeddings tables. That absence IS the lockdown and must not be
-- "fixed" by adding the usual four policies: a select policy for the campaign
-- would hand every DM their players' answer tokens, and a self policy would
-- hand a player a token they already received by mail. Nothing in the browser
-- has any business reading this table.
alter table public.session_proposal_invites enable row level security;

-- ── Issuing (called by send-notification-email) ──────────────────────────────
-- Returns one token per recipient the proposal's campaign actually contains.
-- The caller passes ids as a hint; membership is re-derived here, so a bad or
-- stale id yields no row rather than an invitation to a stranger.
create or replace function public.issue_session_rsvp_invites(
  p_proposal_id uuid,
  p_user_ids uuid[]
)
returns table (user_id uuid, token uuid, sequence integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
-- (The directive above must lead the body.) The OUT parameters are named after
-- the columns they carry, which is what a caller reading the JSON wants and
-- also exactly the collision plpgsql resolves in favour of the variable by
-- default — `on conflict (session_proposal_id, user_id)` would otherwise bind
-- to the OUT parameter. This settles it the other way for the whole body; every
-- genuine variable here is v_/p_-prefixed, so nothing else changes meaning.
declare
  v_campaign_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'issue_session_rsvp_invites can only be called by service_role';
  end if;

  select sp.campaign_id into v_campaign_id
  from public.session_proposals sp
  where sp.id = p_proposal_id;

  if v_campaign_id is null then
    return;
  end if;

  return query
  insert into public.session_proposal_invites as spi (campaign_id, session_proposal_id, user_id)
  select v_campaign_id, p_proposal_id, cm.user_id
  from public.campaign_members cm
  where cm.campaign_id = v_campaign_id
    and cm.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
  on conflict (session_proposal_id, user_id) do update
    -- Re-issuing supersedes the copy already in the recipient's calendar; the
    -- token is deliberately NOT rotated, so a link from the first mail still
    -- works for someone who scrolled back to it.
    set sequence = spi.sequence + 1
  returning spi.user_id, spi.token, spi.sequence;
end;
$$;

comment on function public.issue_session_rsvp_invites(uuid, uuid[]) is
  'Mints (or re-issues) RSVP tokens for the named campaign members of one session proposal. service_role only — the send-notification-email Edge Function is its one caller.';

revoke execute on function public.issue_session_rsvp_invites(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.issue_session_rsvp_invites(uuid, uuid[]) to service_role;

-- ── Reading one invitation (renders the confirmation page) ───────────────────
-- Everything here is something the holder of the token was already mailed, so
-- the page can be honest about which evening it is about to answer for. It
-- deliberately does not return the player's name, email or user id: the page is
-- shown to whoever holds the link, and a leaked link should not also disclose
-- who it was issued to.
create or replace function public.get_session_rsvp_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'get_session_rsvp_invite can only be called by service_role';
  end if;

  if p_token is null then
    return null;
  end if;

  select c.name as campaign_name,
         sp.title, sp.proposed_date, sp.proposed_time, sp.status,
         sa.available
  into v_row
  from public.session_proposal_invites spi
  join public.session_proposals sp on sp.id = spi.session_proposal_id
  join public.campaigns c on c.id = spi.campaign_id
  left join public.session_availability sa
    on sa.session_proposal_id = spi.session_proposal_id and sa.user_id = spi.user_id
  where spi.token = p_token;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'campaign_name', v_row.campaign_name,
    'title', v_row.title,
    'proposed_date', v_row.proposed_date,
    'proposed_time', v_row.proposed_time,
    'status', v_row.status,
    'is_past', v_row.proposed_date < current_date,
    'available', v_row.available
  );
end;
$$;

comment on function public.get_session_rsvp_invite(uuid) is
  'Describes the session one RSVP token answers for, so the confirmation page can name it. service_role only; returns null for an unknown token.';

revoke execute on function public.get_session_rsvp_invite(uuid) from public, anon, authenticated;
grant execute on function public.get_session_rsvp_invite(uuid) to service_role;

-- ── Recording an answer ──────────────────────────────────────────────────────
-- Writes session_availability on the invitee's behalf. That is the whole point
-- and it is why the token never reaches the browser: possession of the token is
-- possession of the right to answer, the same bargain as the unsubscribe link
-- in 20260811221206.
--
-- A cancelled proposal is the one refusal. A confirmed one still accepts an
-- answer — "something came up, I can't make Thursday" is exactly the message a
-- DM needs — and so does a past one, which the caller is told about via is_past
-- rather than being silently dropped.
create or replace function public.record_session_rsvp(
  p_token uuid,
  p_available boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_status text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'record_session_rsvp can only be called by service_role';
  end if;

  if p_token is null or p_available is null then
    return null;
  end if;

  select spi.id, spi.campaign_id, spi.session_proposal_id, spi.user_id
  into v_invite
  from public.session_proposal_invites spi
  where spi.token = p_token;

  if not found then
    return null;
  end if;

  select sp.status into v_status
  from public.session_proposals sp
  where sp.id = v_invite.session_proposal_id;

  if v_status = 'cancelled' then
    return jsonb_build_object('recorded', false, 'reason', 'cancelled')
           || coalesce(public.get_session_rsvp_invite(p_token), '{}'::jsonb);
  end if;

  insert into public.session_availability (session_proposal_id, campaign_id, user_id, available)
  values (v_invite.session_proposal_id, v_invite.campaign_id, v_invite.user_id, p_available)
  on conflict (session_proposal_id, user_id) do update
    set available = excluded.available;

  update public.session_proposal_invites
     set responded_at = now()
   where id = v_invite.id;

  return jsonb_build_object('recorded', true, 'available', p_available)
         || coalesce(public.get_session_rsvp_invite(p_token), '{}'::jsonb);
end;
$$;

comment on function public.record_session_rsvp(uuid, boolean) is
  'Records one player''s availability for a proposed session from their RSVP token — the one-click link or the METHOD:REPLY their mail app sent. service_role only; null for an unknown token.';

revoke execute on function public.record_session_rsvp(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_session_rsvp(uuid, boolean) to service_role;
