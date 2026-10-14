-- Account activity, and the retention period for an account nobody uses.
--
-- Until now the register (context/compliance/retention.md) kept an account and
-- everything in it "as long as the account exists", which for an account its
-- owner walked away from means forever. The decided period (14 Oct 2026): an
-- account unused for 12 months is sent a notice, and is deleted if it is still
-- unused 30 days after that notice. The deletion itself stays an admin action
-- through delete-account (the same erasure path as every other deletion), so an
-- irreversible step always has a person behind it; this migration only works
-- out who is due what.
--
-- WHY A TABLE OF OUR OWN. auth.users.last_sign_in_at moves only on a fresh
-- sign-in, and a refresh token keeps a session alive for months without one:
-- in production 25 of 36 accounts looked as if they had only ever been used on
-- the day they were made. auth.sessions knows more but is deleted on sign-out
-- and expiry. So the app stamps `last_active_at` itself, at most hourly, through
-- touch_account_activity(), and the backfill below takes the best guess the
-- existing signals allow.
--
-- WHY DENY-ALL. The table is written by touch_account_activity() (the caller's
-- own row, the time always now()) and by record_inactivity_notice() (service
-- role), and read by get_admin_users() and inactivity_notice_recipients(). An
-- own-row write policy would let an account set its own last_active_at to 2999
-- and opt out of the retention period, so there is deliberately no policy: the
-- same `rls_enabled_no_policy` shape as the embeddings tables, and named in
-- CLAUDE.md's list of them.

create table public.account_activity (
  user_id                     uuid primary key references auth.users (id) on delete cascade,
  last_active_at              timestamptz not null,
  inactivity_notice_sent_at   timestamptz,
  inactivity_notice_failed_at timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger account_activity_updated_at
  before update on public.account_activity
  for each row execute procedure update_updated_at();

alter table public.account_activity enable row level security;

revoke all on public.account_activity from anon, authenticated;

-- Backfill: the latest of every signal that already exists. A campaign's
-- updated_at counts because editing it is unambiguous use of the account.
insert into public.account_activity (user_id, last_active_at)
select
  u.id,
  greatest(
    u.created_at,
    u.last_sign_in_at,
    (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = u.id),
    (select max(c.updated_at) from public.campaigns c where c.user_id = u.id)
  )
from auth.users u
on conflict (user_id) do nothing;

-- ── Stamping ────────────────────────────────────────────────────────────────
-- Called by the app whenever it has a session (src/lib/account/accountActivity.ts),
-- which already gates itself to once an hour per tab; the `where` makes a
-- burst of tabs cost one write per hour as well. Activity after a notice needs
-- no clearing: the state below compares the notice to the last activity, so a
-- notice older than the latest visit simply stops counting.
create or replace function public.touch_account_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  insert into public.account_activity (user_id, last_active_at)
  values (v_uid, now())
  on conflict (user_id) do update
    set last_active_at = now()
    where public.account_activity.last_active_at < now() - interval '1 hour';
end;
$$;

revoke execute on function public.touch_account_activity() from public, anon;
grant execute on function public.touch_account_activity() to authenticated, service_role;

-- ── The retention state of every account ────────────────────────────────────
-- One definition, read by the admin list and by the notice sender, so the two
-- can never disagree about who is due what.
--
-- exempt_reason, first match wins (null = the period applies):
--   plan     on Pro or Tester (paying, or given the plan by hand on purpose),
--            or an app admin. public.is_user_pro() answers exactly that for an
--            arbitrary account, so this reads it rather than becoming a second
--            reader of the role claim (CLAUDE.md, migration rule 4).
--   parent   still parents a child account; delete-account refuses it
--            (has_child_accounts), and the child's account hangs off it
--   banned   locked out by an admin, so a "sign in to keep it" notice would be
--            a lie; deleting it is the admin's call from the row
--   seated   plays in a campaign whose DM has been active within the period:
--            their character is part of a game that is still going
--
-- retention_state:
--   exempt       an exempt_reason applies
--   kept         active within the last 12 months
--   notice_due   unused 12 months, and no notice since the last activity
--   notice_sent  notice sent, less than 30 days ago, nothing since
--   deletable    notice sent 30+ days ago and still nothing since
create or replace function private.account_retention()
returns table (
  user_id                   uuid,
  last_active_at            timestamptz,
  inactivity_notice_sent_at timestamptz,
  exempt_reason             text,
  retention_state           text
)
language sql
stable
security definer
set search_path = ''
as $$
  with activity as (
    select
      u.id,
      coalesce(a.last_active_at, greatest(u.created_at, u.last_sign_in_at)) as last_active_at,
      a.inactivity_notice_sent_at
    from auth.users u
    left join public.account_activity a on a.user_id = u.id
  ),
  classified as (
    select
      act.id,
      act.last_active_at,
      act.inactivity_notice_sent_at,
      case
        when public.is_user_pro(act.id) then 'plan'
        when exists (
          select 1 from public.child_accounts ca
          where ca.parent_user_id = act.id and ca.adult_on > current_date
        ) then 'parent'
        when exists (
          select 1 from auth.users bu
          where bu.id = act.id and bu.banned_until is not null and bu.banned_until > now()
        ) then 'banned'
        when exists (
          select 1
          from public.campaign_members m
          join public.campaigns c on c.id = m.campaign_id
          join activity dm on dm.id = c.user_id
          where m.user_id = act.id
            and c.user_id <> act.id
            and dm.last_active_at >= now() - interval '12 months'
        ) then 'seated'
      end as exempt_reason
    from activity act
  )
  select
    c.id,
    c.last_active_at,
    c.inactivity_notice_sent_at,
    c.exempt_reason,
    case
      when c.exempt_reason is not null then 'exempt'
      when c.last_active_at >= now() - interval '12 months' then 'kept'
      when c.inactivity_notice_sent_at is not null and c.inactivity_notice_sent_at > c.last_active_at then
        case when c.inactivity_notice_sent_at <= now() - interval '30 days' then 'deletable' else 'notice_sent' end
      else 'notice_due'
    end
  from classified c;
$$;

revoke execute on function private.account_retention() from public, anon, authenticated;

-- ── The admin list ──────────────────────────────────────────────────────────
-- Same body as 20260809222131 plus the activity and retention columns. The
-- return type changes, so drop and recreate, and restate the grant the live
-- ACL had (authenticated + service_role; anon reaches nothing).
drop function public.get_admin_users();

create function public.get_admin_users()
returns table (
  user_id                   uuid,
  email                     text,
  display_name              text,
  created_at                timestamptz,
  plan_id                   text,
  status                    text,
  ai_credits                bigint,
  suspended_at              timestamptz,
  banned                    boolean,
  last_active_at            timestamptz,
  campaigns_owned           integer,
  campaigns_playing         integer,
  is_child                  boolean,
  exempt_reason             text,
  retention_state           text,
  inactivity_notice_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id                                          as user_id,
    u.email::text                                 as email,
    (u.raw_user_meta_data ->> 'display_name')     as display_name,
    u.created_at                                  as created_at,
    coalesce(s.plan_id, 'free')                   as plan_id,
    coalesce(s.status,  'active')                 as status,
    coalesce(b.balance, 0)::bigint                as ai_credits,
    s.suspended_at                                as suspended_at,
    (u.banned_until is not null and u.banned_until > now()) as banned,
    r.last_active_at                              as last_active_at,
    -- The demo copy and the demo template are not something the DM made.
    (select count(*)::integer from campaigns c
      where c.user_id = u.id and c.demo_source is null and not coalesce(c.demo_template, false))
                                                  as campaigns_owned,
    (select count(*)::integer from campaign_members m join campaigns c on c.id = m.campaign_id
      where m.user_id = u.id and c.user_id <> u.id)
                                                  as campaigns_playing,
    private.is_child_account(u.id)                as is_child,
    r.exempt_reason                               as exempt_reason,
    r.retention_state                             as retention_state,
    r.inactivity_notice_sent_at                   as inactivity_notice_sent_at
  from auth.users u
  left join user_subscriptions s on s.user_id = u.id
  left join ai_credit_balance   b on b.user_id = u.id
  join private.account_retention() r on r.user_id = u.id
  order by u.created_at desc;
end;
$$;

revoke execute on function public.get_admin_users() from public, anon;
grant execute on function public.get_admin_users() to authenticated, service_role;

-- ── The notice sender's two calls (service role only) ───────────────────────
-- send-inactivity-notice has already checked the caller is an admin; these run
-- under its service-role client, the same split as join_campaign_for_child.
--
-- A child account's login email is a reserved `.invalid` address nobody reads,
-- and the person who answers for the account is the parent, so a child's notice
-- goes to the parent's address.
create or replace function public.inactivity_notice_recipients()
returns table (
  user_id        uuid,
  email          text,
  is_child       boolean,
  last_active_at timestamptz,
  failed_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'inactivity_notice_recipients can only be called by service_role';
  end if;

  return query
  select
    r.user_id,
    coalesce(
      (select pu.email::text from public.child_accounts ca join auth.users pu on pu.id = ca.parent_user_id
        where ca.child_user_id = r.user_id),
      u.email::text
    ),
    private.is_child_account(r.user_id),
    r.last_active_at,
    a.inactivity_notice_failed_at
  from private.account_retention() r
  join auth.users u on u.id = r.user_id
  left join public.account_activity a on a.user_id = r.user_id
  where r.retention_state = 'notice_due'
  -- Never tried first; a failed address goes to the back of the queue.
  order by a.inactivity_notice_failed_at asc nulls first, r.last_active_at asc;
end;
$$;

revoke execute on function public.inactivity_notice_recipients() from public, anon, authenticated;
grant execute on function public.inactivity_notice_recipients() to service_role;

-- Records one send attempt. Inserts the row if the account never had one (an
-- account made before this migration ran is backfilled, but this does not rely
-- on that), using the same fallback activity the state above uses, so recording
-- a notice can never itself look like activity.
create or replace function public.record_inactivity_notice(p_user_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'record_inactivity_notice can only be called by service_role';
  end if;

  update public.account_activity
     set inactivity_notice_sent_at   = case when p_sent then now() else inactivity_notice_sent_at end,
         inactivity_notice_failed_at = case when p_sent then null else now() end
   where user_id = p_user_id;
  if found then
    return;
  end if;

  -- Update first rather than `on conflict`: Postgres checks NOT NULL on the
  -- proposed row before it looks for a conflict, so an insert-first shape would
  -- need a last_active_at even for the row that already has one.
  insert into public.account_activity (user_id, last_active_at, inactivity_notice_sent_at, inactivity_notice_failed_at)
  select
    u.id,
    greatest(u.created_at, u.last_sign_in_at),
    case when p_sent then now() end,
    case when p_sent then null else now() end
  from auth.users u
  where u.id = p_user_id;
end;
$$;

revoke execute on function public.record_inactivity_notice(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_inactivity_notice(uuid, boolean) to service_role;

-- ── Audit ───────────────────────────────────────────────────────────────────
-- One admin_audit_log row per send run, like terms_notice_sent.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (
  action = any (array[
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze',
    'account_ban', 'account_unban', 'credit_grant', 'credit_pack_refund',
    'dsr_request_logged', 'dsr_request_answered', 'terms_notice_sent',
    'inactivity_notice_sent'
  ])
);
