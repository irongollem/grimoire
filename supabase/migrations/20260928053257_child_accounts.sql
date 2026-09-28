-- Migration: child_accounts
-- Parent-managed accounts for players under 16 (#919): the parent link, the
-- pending parent requests, and the gates that keep a child account away from
-- AI, Pro and purchases.
--
-- Why parent-managed rather than a 16+ checkbox: a hard gate either locks
-- children out of their own player portals or teaches them to tick a box that
-- is not true. So an under-16 never self-registers. A parent with an ordinary
-- account creates the child's account (or approves a request the child sent
-- them), and that act is the recorded parental consent (COPPA; GDPR Art 8 and
-- UAVG art 5, whose 16 is the strictest EU threshold and the one designed for).
--
-- A child account has no email address of its own. It signs in with a login
-- name the parent chose, backed by an internal address on a reserved `.invalid`
-- domain that nothing ever mails (`_shared/childAccount.ts`). That is what makes
-- "no email to the child" a property rather than a filter.
--
-- Writes to both tables come only from the `child-account` and
-- `request-parental-consent` edge functions (service role). A client-writable
-- row here would let a child unlink themselves from their parent, or anyone
-- claim someone else's child, so no insert/update/delete policy exists on
-- purpose: RLS with no write policy is the lockdown.

-- ── The parent link ─────────────────────────────────────────────────────────

create table public.child_accounts (
  child_user_id   uuid primary key references auth.users (id) on delete cascade,
  -- restrict, not cascade: deleting the parent must never silently turn an
  -- under-16 into an unrestricted account. delete-account refuses a parent who
  -- still has child accounts, before it touches anything.
  parent_user_id  uuid not null references auth.users (id) on delete restrict,
  login_name      text not null unique
                  check (login_name ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  -- The first day this person counts as 16. Only this is stored, never the
  -- birth date: it is derived from a birth month and year and rounded up to the
  -- first of the following month, which is the least the gate needs to know.
  adult_on        date not null,
  consent_version text not null,
  consented_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint child_accounts_not_own_parent check (child_user_id <> parent_user_id)
);

comment on table public.child_accounts is
  'Parent-managed accounts for under-16 players (#919). Written only by the child-account edge function; a row past adult_on is swept daily, which is when the account becomes the young person''s own.';

create index child_accounts_parent_idx on public.child_accounts (parent_user_id);

create trigger child_accounts_updated_at
  before update on public.child_accounts
  for each row execute procedure update_updated_at();

alter table public.child_accounts enable row level security;

-- The parent sees their children; the child sees their own row (which is how
-- the app knows to present itself as a child account).
create policy "child_accounts_select" on public.child_accounts
  for select using ((select auth.uid()) in (child_user_id, parent_user_id));

-- ── Requests a child sends to a parent ──────────────────────────────────────
-- Holds the parent's email and nothing about the child beyond, for an existing
-- account, its id. Collecting a parent's address to ask for consent is the one
-- thing COPPA allows before consent exists, on condition it is deleted if
-- consent does not follow: expires_at, swept daily.

create table public.parental_consent_requests (
  id                    uuid primary key default gen_random_uuid(),
  token                 uuid not null unique default gen_random_uuid(),
  parent_email          text not null check (length(parent_email) between 3 and 320),
  -- The campaign invite the child arrived on, so the parent's "Add a child
  -- player" form can join the new account to that game. No FK: the invite may
  -- be revoked meanwhile, and then the child is simply created unjoined.
  campaign_invite_token uuid,
  -- Set when an account that already exists turned out to belong to an
  -- under-16 (the Terms gate asked). Approval converts it rather than creating
  -- a new one.
  child_user_id         uuid references auth.users (id) on delete cascade,
  expires_at            timestamptz not null default now() + interval '14 days',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.parental_consent_requests is
  'A child''s request for a parent to set up or approve their account (#919). Service-role only; expires after 14 days and is swept daily.';

create unique index parental_consent_requests_child_idx
  on public.parental_consent_requests (child_user_id) where child_user_id is not null;
create index parental_consent_requests_email_idx
  on public.parental_consent_requests (lower(parent_email), created_at);

create trigger parental_consent_requests_updated_at
  before update on public.parental_consent_requests
  for each row execute procedure update_updated_at();

-- No policies: the rows are capability tokens. Read only by the service-role
-- edge functions, like session_proposal_invites (20260908084110).
alter table public.parental_consent_requests enable row level security;

-- ── The predicate ───────────────────────────────────────────────────────────
-- Total by construction (exists is never NULL), so a negated call site cannot
-- fall through the way is_app_admin() once did (20260809144926).

create or replace function private.is_child_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.child_accounts c
    where c.child_user_id = p_user_id
      and c.adult_on > current_date
  );
$$;

revoke execute on function private.is_child_account(uuid) from public, anon, authenticated;

-- ── Gates ───────────────────────────────────────────────────────────────────

-- Paid AI: the one gate both reserve_credits and spend_credits delegate to.
-- A child's text and likeness would go to an AI provider, which the parent's
-- consent does not cover. Body otherwise identical to 20260628000005.
create or replace function public.assert_spend_allowed(p_user_id uuid, p_cost numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg      abuse_guard_config;
  v_age_days integer;
  v_window   numeric;
begin
  -- Account freeze — blocks all paid spend.
  if exists (
    select 1 from user_subscriptions
    where user_id = p_user_id and suspended_at is not null
  ) then
    return jsonb_build_object('ok', false, 'suspended', true);
  end if;

  -- Child accounts never generate (#919).
  if private.is_child_account(p_user_id) then
    return jsonb_build_object('ok', false, 'child_account', true);
  end if;

  -- New-account purchased-credit velocity cap (config-driven, off by default).
  select * into v_cfg from abuse_guard_config where id = 1;
  if v_cfg.enabled then
    select floor(extract(epoch from (now() - u.created_at)) / 86400)::int
      into v_age_days
      from auth.users u where u.id = p_user_id;

    if v_age_days is not null and v_age_days < v_cfg.young_account_days then
      -- Count settled AND pending purchased spend (held reservations count too,
      -- so a burst before holds settle can't slip past the cap). Read is under
      -- the caller's advisory lock, so concurrent reservations serialize.
      select coalesce(sum(-delta), 0)
        into v_window
        from ai_credit_ledger
       where user_id = p_user_id
         and bucket = 'purchased'
         and delta < 0
         and reason <> 'pack_refund'
         and created_at > now() - make_interval(hours => v_cfg.window_hours);

      if v_window + p_cost > v_cfg.max_purchased_spend_window then
        insert into abuse_guard_trips (user_id, attempted_cost, window_spend, account_age_days, enforced)
        values (p_user_id, p_cost, v_window, v_age_days, v_cfg.enforce);

        if v_cfg.enforce then
          return jsonb_build_object('ok', false, 'velocity', true);
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

-- Pro: a child account never ranks as Pro, whatever its plan row says. Pro is
-- what unlocks bring-your-own-key and its browser-only local mode, which never
-- touches the server, so this is the gate that closes AI on that path.
create or replace function public.is_user_pro(p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    (
      exists (
        select 1
        from user_subscriptions s
        where s.user_id = p_user_id
          and s.status in ('active', 'trialing')
          and s.plan_id in ('pro', 'tester')
      )
      or exists (
        -- App admins always rank as Pro, even without a subscription row.
        select 1
        from auth.users u
        where u.id = p_user_id
          and (u.raw_app_meta_data ->> 'role') = 'admin'
      )
    )
    and not private.is_child_account(p_user_id);
$function$;

-- ── Accepting the current Terms ─────────────────────────────────────────────
-- Until now terms_version was only ever written at signup, so a Terms revision
-- reached no existing account. The app's Terms gate calls this once the user
-- has accepted the current version (and answered the age question, which is
-- how accounts already used by children are found).
--
-- A child account cannot accept: its Terms were accepted by the parent, as part
-- of the consent recorded on child_accounts.

-- The current Terms version, for accept_terms to check against. Redefined by
-- the migration that accompanies every TERMS_VERSION bump; consent.test.ts
-- fails until the newest definition here equals the TypeScript constant.
create or replace function private.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-28'::text $$;

revoke execute on function private.current_terms_version() from public, anon, authenticated;

create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  -- Only the current version: recording any other would be consent metadata
  -- for a document nobody was shown.
  if p_version is distinct from private.current_terms_version() then
    raise exception 'Invalid terms version';
  end if;
  if private.is_child_account(v_uid) then
    raise exception 'A parent accepts the terms for a child account';
  end if;
  -- This account already told us it is under 16 and asked a parent. The age
  -- question is neutral and can be answered again in a fresh session, so the
  -- open request is what stops a second, different answer from reopening the
  -- account before the parent has decided. It expires with the request.
  if exists (
    select 1 from public.parental_consent_requests r
    where r.child_user_id = v_uid and r.expires_at > now()
  ) then
    raise exception 'Waiting for a parent to approve this account';
  end if;

  update public.user_subscriptions
     set terms_version = p_version,
         terms_accepted_at = now()
   where user_id = v_uid;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated, service_role;

-- ── Joining a campaign on someone else's behalf ─────────────────────────────
-- A parent who creates a child account from a campaign invite joins the child
-- to that campaign in the same step. join_campaign_via_invite keys on
-- auth.uid(), which in the edge function is nobody, so the membership half is
-- lifted into a private helper both paths call.

create or replace function private.consume_campaign_invite(p_token uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.campaign_invites%rowtype;
  v_inserted integer;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = p_user_id
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    p_user_id,
    v_invite.role,
    coalesce(
      (select username from public.profiles where user_id = p_user_id),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = p_user_id)), ''),
      '(unnamed player)'
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  -- Only count a use when a new membership row was actually created; a no-op
  -- re-join (existing member re-opening the link, or a page remount) must not
  -- decrement a capped invite's remaining uses.
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.campaign_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.campaign_id;
end;
$$;

revoke execute on function private.consume_campaign_invite(uuid, uuid) from public, anon, authenticated;

create or replace function public.join_campaign_via_invite(p_token uuid, p_party_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_campaign_id uuid;
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  v_campaign_id := private.consume_campaign_invite(p_token, auth.uid());

  -- Optionally bring a character from the caller's pool (#730). Idempotent
  -- across re-joins: a character already attached to *this* campaign is fine,
  -- one attached elsewhere is refused, and an existing active character is
  -- never clobbered.
  if p_party_member_id is not null then
    select * into v_pm from public.party_members where id = p_party_member_id;
    if not found then
      raise exception 'Character not found';
    end if;
    if v_pm.owner_user_id is distinct from auth.uid() then
      raise exception 'Only the character''s owner can bring it to a campaign';
    end if;
    if v_pm.campaign_id is not null and v_pm.campaign_id <> v_campaign_id then
      raise exception 'Character is already in another campaign';
    end if;

    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.party_members
       set campaign_id = v_campaign_id
     where id = p_party_member_id
       and campaign_id is null;

    update public.campaign_members
       set party_member_id = p_party_member_id
     where campaign_id = v_campaign_id
       and user_id = auth.uid()
       and party_member_id is null;
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end if;

  return v_campaign_id;
end;
$function$;

-- Service-role only: the child-account edge function has already verified the
-- caller is this child's parent. Not on the advisor's definer count, which
-- counts functions PostgREST lets a client reach.
create or replace function public.join_campaign_for_child(p_token uuid, p_child_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'join_campaign_for_child can only be called by service_role';
  end if;
  if not private.is_child_account(p_child_user_id) then
    raise exception 'Not a child account';
  end if;
  return private.consume_campaign_invite(p_token, p_child_user_id);
end;
$$;

revoke execute on function public.join_campaign_for_child(uuid, uuid) from public, anon, authenticated;
grant execute on function public.join_campaign_for_child(uuid, uuid) to service_role;

-- ── Daily sweep ─────────────────────────────────────────────────────────────
-- Expired parent requests go (the COPPA deletion condition above). A link
-- whose adult_on has passed goes too: from 16 the account is the young
-- person's own, the parent's controls end, and the Terms gate asks them to
-- accept the Terms themselves, since terms_version was never set for them.
-- is_child_account already stops counting the row at adult_on, so the sweep's
-- timing never widens anything; it only tidies.

create or replace function private.sweep_child_accounts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.parental_consent_requests where expires_at < now();
  delete from public.child_accounts where adult_on <= current_date;
end;
$$;

revoke execute on function private.sweep_child_accounts() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-child-accounts') then
    perform cron.unschedule('sweep-child-accounts');
  end if;
end $$;

select cron.schedule(
  'sweep-child-accounts',
  '17 3 * * *',
  $$ select private.sweep_child_accounts(); $$
);


-- ── Parent export and erasure ───────────────────────────────────────────────
-- A parent can download and delete their child's account (#919): delete is also
-- how consent is withdrawn. Both database functions learn a parent actor so the
-- DSR log records who asked, rather than logging a parent's request as the
-- child's own. The bodies are otherwise the production definitions verbatim
-- (checked byte-for-byte against production 28 Sep 2026).
--
-- export-my-data kept a caller-only target on purpose, because an admin export
-- path is a disclosure surface nobody needs. A parent is not that case: under
-- COPPA and GDPR Art 8 the parent is who exercises the child's rights, and an
-- export the parent cannot get is a right the child effectively does not have.

drop function public.export_user_data(uuid);

CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id uuid, p_parent_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rec record;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_identity jsonb;
  v_email text;
  v_select text[];
  v_redacted text[] := '{}';
  v_cols text[];
  v_where text;
begin
  -- Service-role only, exactly like prepare_user_erasure: this function reads
  -- every table in the database for an arbitrary uuid, so the browser must have
  -- no path to it at all. `authenticated` holding EXECUTE would also route
  -- around the edge function's rate limit, which is the only bound on how often
  -- a whole-account dump can be built.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'export_user_data can only be called by service_role';
  end if;

  if p_user_id is null then
    raise exception 'export_user_data: p_user_id is required';
  end if;

  -- A parent exporting their child's account (#919). The edge function has
  -- already checked the link; this re-checks it so the parent path cannot be
  -- reached by passing a parent id the function did not verify.
  if p_parent_user_id is not null and not exists (
    select 1 from public.child_accounts c
    where c.child_user_id = p_user_id
      and c.parent_user_id = p_parent_user_id
      and c.adult_on > current_date
  ) then
    raise exception 'export_user_data: not this account''s parent';
  end if;

  -- Identity comes from the authoritative auth row rather than profiles, and is
  -- deliberately narrow: the columns that answer "who is this account", not the
  -- whole GoTrue record. `encrypted_password` and the recovery/confirmation
  -- token columns on auth.users are credentials by the same reasoning as above.
  select u.email,
         jsonb_build_object(
           'user_id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'last_sign_in_at', u.last_sign_in_at,
           'email_confirmed_at', u.email_confirmed_at,
           'providers', u.raw_app_meta_data -> 'providers',
           'user_metadata', u.raw_user_meta_data
         )
    into v_email, v_identity
  from auth.users u
  where u.id = p_user_id;

  if v_identity is null then
    raise exception 'export_user_data: no such account';
  end if;

  -- ── 1. Every table reachable through the auth.users FK graph ───────────────
  -- One (table, column) pair per iteration: a table can be keyed to a person by
  -- more than one column and both are that person's data. party_members is the
  -- case that matters — `user_id` is the campaign owner and `owner_user_id` is
  -- the player whose character it is, so a player's own character sheet is
  -- reachable ONLY through the second column. An export keyed on `user_id`
  -- alone would hand a player everything about their account except the
  -- character they actually play, which is the single row they would look for
  -- first.
  --
  -- The columns are grouped into ONE query per table (`col_a = $1 or col_b = $1`)
  -- rather than one query per column. Querying per column and concatenating the
  -- results duplicates any row that matches on both — a DM who also plays their
  -- own character has `user_id` and `owner_user_id` equal, so their character
  -- sheet would appear twice, and a consumer re-importing the document (the
  -- point of Art. 20) would see two characters or a primary-key collision.
  for v_rec in
    with keyed as (
      select cls.relname::text as table_name,
             att.attname::text as column_name
      from pg_constraint con
      join pg_namespace  con_ns on con_ns.oid = con.connamespace
      join pg_class      cls    on cls.oid = con.conrelid
      join unnest(con.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute  att    on att.attrelid = con.conrelid and att.attnum = k.attnum
      where con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
        and con_ns.nspname = 'public'
        and cls.relkind = 'r'
        -- A composite FK into auth.users would make "the person column"
        -- ambiguous. None exists; this keeps the loop honest if one ever does.
        and array_length(con.conkey, 1) = 1

      union

      -- The user-keyed columns with NO FK, which the graph above cannot see.
      -- This is the half that can rot, so data_export.test.sql pins the set and
      -- asserts each member is named in both this function and
      -- prepare_user_erasure.
      --
      -- admin_audit_log.target_user_id is deliberately FK-less (§2) so the
      -- erasure receipt outlives its subject — which also made it invisible to
      -- an export keyed on the FK graph alone, even though a ban, freeze, plan
      -- change or credit grant recorded against someone is plainly data about
      -- them. `admin_user_id` on the same row is reached by the FK graph and is
      -- withheld by private.is_third_party_column: the operator's own id is not
      -- the subject's to receive.
      select *
      from (values
        ('rate_limit_events', 'user_id'),
        ('admin_audit_log',   'target_user_id')
      ) as extra(table_name, column_name)
    )
    select table_name,
           array_agg(column_name order by column_name) as columns
    from keyed
    group by table_name
    order by table_name
  loop
    -- Build the projection column by column so credential columns can be
    -- replaced in place. `format(%I)` over catalog-sourced identifiers is what
    -- makes the dynamic SQL safe.
    --
    -- Read from pg_attribute rather than information_schema.columns: the
    -- information_schema views filter by the current role's privileges, so a
    -- table the definer could not SELECT would yield no columns and this would
    -- build `select  from ...`. pg_catalog has no such filter, and `attisdropped`
    -- keeps dropped columns out of the projection.
    select array_agg(
             case
               when private.is_withheld_column(a.attname)
                 then format('case when t.%I is null then null else %L end as %I',
                             a.attname, '[redacted]', a.attname)
               else format('t.%I', a.attname)
             end
             order by a.attnum),
           array_agg(a.attname order by a.attnum)
             filter (where private.is_withheld_column(a.attname))
      into v_select, v_cols
    from pg_attribute a
    where a.attrelid = ('public.' || v_rec.table_name)::regclass
      and a.attnum > 0
      and not a.attisdropped;

    select string_agg(format('t.%I = $1', c), ' or ' order by c)
      into v_where
    from unnest(v_rec.columns) c;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb)
         from (select %s from public.%I t where %s) r',
      array_to_string(v_select, ', '), v_rec.table_name, v_where
    )
    into v_rows
    using p_user_id;

    if jsonb_array_length(v_rows) > 0 then
      v_tables := jsonb_set(v_tables, array[v_rec.table_name], v_rows);
      -- Recorded only for tables that actually contributed rows, so the list
      -- describes this export rather than the schema's redaction policy in the
      -- abstract.
      if v_cols is not null then
        v_redacted := array(
          select distinct e
          from unnest(v_redacted || array(
            select v_rec.table_name || '.' || c from unnest(v_cols) c
          )) e
          order by e
        );
      end if;
    end if;
  end loop;

  -- The subject's own request history (#643). Their record of what they asked
  -- for and when it was answered is their personal data as much as anyone's,
  -- and it is the one table here whose whole purpose is to be producible.
  --
  -- Matched on user_id OR the address, exactly as prepare_user_erasure matches
  -- it. Keying on user_id alone would leave an email-channel request logged
  -- before the account existed erasable but never exportable — the precise
  -- asymmetry between the two rights that data_export.test.sql exists to rule
  -- out. One query rather than two, so a row matching both conditions still
  -- appears once.
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
  from public.dsr_requests r
  where r.user_id = p_user_id
     or (v_email is not null and lower(r.subject_email) = lower(v_email));
  if jsonb_array_length(v_rows) > 0 then
    v_tables := jsonb_set(v_tables, '{dsr_requests}', v_rows);
  end if;

  -- ── 2. The request this call answers (#643) ───────────────────────────────
  -- Written here rather than by the edge function so there is no way to produce
  -- an export without producing its evidence. Logged as fulfilled in the same
  -- breath because self-serve access is instantaneous — there is no interval
  -- between receipt and answer to record. Deliberately AFTER the read above, so
  -- an export does not contain the record of itself and every document is a
  -- complete snapshot of the moment before it existed.
  perform private.log_dsr_request(
    'access_portability', 'self_serve', p_user_id,
    case when p_parent_user_id is null then 'authenticated_session' else 'parent_session' end,
    null, now(), 'fulfilled',
    case when p_parent_user_id is null
      then 'Self-serve export via export-my-data.'
      else 'Parent export of a child account via export-my-data.'
    end
  );

  return jsonb_build_object(
    'identity', v_identity,
    'tables', v_tables,
    'meta', jsonb_build_object(
      'exported_at', now(),
      'format', 'grimoire-account-export',
      'format_version', 1,
      -- Empty tables are omitted rather than emitted as `[]`. A player's export
      -- would otherwise be ~90 empty arrays around the dozen that hold
      -- anything, which makes the document harder to read for the person whose
      -- right it exists to serve. Absence means "no rows", and says so here.
      'omitted_when_empty', true,
      'redacted_columns', to_jsonb(v_redacted),
      'redaction_note',
        'Shown as "[redacted]": bearer credentials (BYOK API keys, invite and calendar-feed tokens), '
        'and identifiers belonging to someone else (which admin acted on an audit entry). '
        'A null stays null, so the export still records whether a value was set.'
    )
  );
end;
$function$;

revoke execute on function public.export_user_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.export_user_data(uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.prepare_user_erasure(p_user_id uuid, p_actor_id uuid, p_actor_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_erased_email text;
  v_ledger_rows integer;
  v_consent_rows integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'prepare_user_erasure can only be called by service_role';
  end if;

  -- coalesce: `NULL not in (...)` is NULL, which `if` treats as false, and a
  -- NULL actor would then slip past every actor check below (CLAUDE.md item 3).
  if coalesce(p_actor_kind, '') not in ('self', 'admin', 'parent') then
    raise exception 'prepare_user_erasure: actor_kind must be self, admin or parent, got %', p_actor_kind;
  end if;

  -- A parent erasing their child's account, which is also how a parent
  -- withdraws consent (#919). Re-checked here, not only in delete-account.
  if p_actor_kind = 'parent' and not exists (
    select 1 from public.child_accounts c
    where c.child_user_id = p_user_id
      and c.parent_user_id = p_actor_id
      and c.adult_on > current_date
  ) then
    raise exception 'prepare_user_erasure: a parent erasure must be performed by the child''s parent';
  end if;

  -- child_accounts.parent_user_id is ON DELETE RESTRICT, so the auth delete
  -- that follows this function would fail for a parent, after the work below
  -- had already committed. Refuse up front instead. A link past its adult_on
  -- no longer protects anyone and only awaits the daily sweep, so it goes now.
  delete from public.child_accounts
   where parent_user_id = p_user_id and adult_on <= current_date;
  if exists (select 1 from public.child_accounts where parent_user_id = p_user_id) then
    raise exception 'prepare_user_erasure: account still manages child accounts';
  end if;

  if p_actor_kind = 'self' and p_actor_id is distinct from p_user_id then
    raise exception 'prepare_user_erasure: a self erasure must be performed by its own account';
  end if;

  -- Read identity only after authorization and only from the authoritative auth
  -- row. A missing target remains safe: NULL cannot match a request address.
  select email into v_erased_email
  from auth.users
  where id = p_user_id;

  -- Counted before the auth delete, which is what actually nulls them.
  select count(*) into v_ledger_rows
  from public.ai_credit_ledger where user_id = p_user_id;

  select count(*) into v_consent_rows
  from public.purchase_consents where user_id = p_user_id;

  -- Written before the destructive work: a later failure rolls the audit row
  -- and every deletion back together.
  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    p_actor_id,
    'account_erasure',
    p_user_id,
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'ledger_rows_anonymized', v_ledger_rows,
      'consent_rows_anonymized', v_consent_rows
    )
  );

  -- The Art. 12(3) side of the same event (#643). admin_audit_log evidences the
  -- action; this evidences the request that prompted it. An admin-initiated
  -- erasure is still logged: the operator acting unilaterally is exactly the
  -- case where evidence of what was done, and on whose say-so, matters most.
  perform private.log_dsr_request(
    'erasure',
    case when p_actor_kind in ('self', 'parent') then 'self_serve' else 'email' end,
    p_user_id,
    case p_actor_kind
      when 'self' then 'authenticated_session'
      when 'parent' then 'parent_session'
      else 'admin_initiated'
    end,
    null, now(), 'fulfilled',
    format('Account erasure (%s).', p_actor_kind)
  );

  -- Anonymize this subject's earlier requests, rather than deleting them. Same
  -- reasoning as the ledger and consents (§2): the row keeps its type, its
  -- dates and its outcome — the whole of its evidentiary value — and loses only
  -- the link to a person. Deleting them would destroy the proof that earlier
  -- requests were answered on time at the moment the last one is honoured.
  --
  -- This runs AFTER the insert above, so the erasure entry just written is
  -- anonymized too: its user_id is a bare uuid pointing at an account that is
  -- about to stop existing, exactly like admin_audit_log.target_user_id.
  --
  -- Any request still OPEN is closed in the same statement, and it has to be:
  -- the guard refuses every update to an anonymized row, so stamping one
  -- without answering it would strand it as permanently unanswerable — showing
  -- in the admin tab's "Open" filter, accruing overdue days against a clock
  -- nobody could ever stop, in the one case where the erasure itself is why no
  -- answer is possible. coalesce rather than a blanket assignment so a request
  -- already answered keeps the date and outcome it was actually answered with.
  update public.dsr_requests
     set subject_email = null,
         anonymized_at = now(),
         fulfilled_at = coalesce(fulfilled_at, now()),
         outcome = coalesce(outcome, 'closed_account_erased')
   where anonymized_at is null
     and (user_id = p_user_id
          or (v_erased_email is not null and lower(subject_email) = lower(v_erased_email)));

  delete from public.rate_limit_events where user_id = p_user_id;

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$function$;
