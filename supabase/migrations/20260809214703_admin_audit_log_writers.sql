-- Migration: admin_audit_log_writers
--
-- #642, part two. `20260808000001` created `admin_audit_log` and its first
-- writer (`prepare_user_erasure`, action `account_erasure`) because #631 needed
-- a record of who destroyed an account. This migration adds the writers for the
-- rest of the admin powers that ticket enumerates — plan changes, soft freezes,
-- credit grants — and pins the action vocabulary now that there is more than one
-- value in it.
--
-- THE POINT THAT DECIDES THE SHAPE. Three of those actions were, until this
-- migration, direct table writes issued by the browser:
--
--   supabase.from('user_subscriptions').update({ plan_id })   -- setPlan
--   supabase.from('user_subscriptions').update({ suspended_at })  -- setSuspended
--   supabase.from('ai_credit_ledger').insert({ delta, reason })   -- grantCredits
--
-- permitted by the `user_subscriptions_update_admin` and
-- `ai_credit_ledger_admin_insert` policies from `20260506000003`. Bolting a
-- log-writing call onto the client beside each of those would produce a log the
-- actor can simply not write — open devtools, issue the same PostgREST request,
-- leave no trace. An audit log that records only the actions taken through the
-- UI records nothing about the case it exists for.
--
-- So each action becomes one SECURITY DEFINER RPC that performs the mutation and
-- writes its audit entry in the same transaction, and the two direct-write
-- policies are dropped. After this migration `authenticated` — admin or not —
-- has no PostgREST path to `user_subscriptions.plan_id`, to `suspended_at`, or
-- to an `ai_credit_ledger` insert at all. The entry cannot be skipped because
-- there is no longer a way to do the work without it, and it cannot be forged
-- because the log still has no INSERT policy: the definer's privileges are what
-- write it, not the caller's.
--
-- SECURITY DEFINER rule (CLAUDE.md): each function's first act is authorization,
-- via `private.is_app_admin()` — which is total since `20260809144926`, so the
-- negated form used here answers false rather than NULL for an ordinary user.
-- The target is a caller-supplied argument, which is correct and necessary
-- (an admin acts on *other* accounts); what is never taken from the caller is
-- the actor, always `auth.uid()`.

-- ── 1. Pin the action vocabulary ─────────────────────────────────────────────
-- Suggested on #642 while there was still exactly one value: cheaper to fix the
-- spelling now than after a viewer's filters have been written against drift.
-- A new action is a deliberate act — extend this constraint in the migration
-- that adds its writer.
alter table public.admin_audit_log
  add constraint admin_audit_log_action_check check (action in (
    'account_erasure',    -- prepare_user_erasure (20260808000001)
    'plan_change',        -- admin_set_user_plan
    'account_freeze',     -- admin_set_user_suspended (soft freeze: paid actions)
    'account_unfreeze',
    'account_ban',        -- admin-set-user-ban edge function (GoTrue lock-out)
    'account_unban',
    'credit_grant',       -- admin_grant_credits
    'credit_pack_refund'  -- admin-refund-credit-pack edge function
  ));

-- The table carries the Supabase default grants, so `anon` and `authenticated`
-- hold INSERT/UPDATE/DELETE privileges that only the absence of an RLS policy
-- is stopping. That is sufficient today, but it means the table's ACL states
-- the opposite of its intent, and the next policy anyone adds here inherits a
-- write grant they did not choose. Take the privilege away too — the SECURITY
-- DEFINER writers run as the definer and service_role keeps its own grants, so
-- nothing that legitimately writes this table notices.
revoke insert, update, delete, truncate on public.admin_audit_log from anon, authenticated;

-- ── 2. Plan changes ──────────────────────────────────────────────────────────
create or replace function public.admin_set_user_plan(
  p_user_id uuid,
  p_plan_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_plan text;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  -- Read-then-write inside one transaction so the entry can say what the plan
  -- was, not merely what it became. `for update` keeps a concurrent admin from
  -- interleaving and producing two entries that both claim the same predecessor.
  select plan_id into v_previous_plan
  from public.user_subscriptions
  where user_id = p_user_id
  for update;

  -- Every account gets a free subscription from the signup trigger, so a missing
  -- row means the id is wrong or the account is gone. The client's bare update
  -- silently affected zero rows here and reported success.
  if not found then
    raise exception 'No subscription row for user %', p_user_id;
  end if;

  update public.user_subscriptions
  set plan_id = p_plan_id,
      status = 'active'
  where user_id = p_user_id;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'plan_change',
    p_user_id,
    jsonb_build_object('from', v_previous_plan, 'to', p_plan_id)
  );
end;
$$;

revoke execute on function public.admin_set_user_plan(uuid, text) from public, anon;
grant execute on function public.admin_set_user_plan(uuid, text) to authenticated, service_role;

-- ── 3. Soft freeze ───────────────────────────────────────────────────────────
-- Blocks paid actions (credit spend, purchases); login still works. The hard
-- lock-out is the GoTrue ban, which lives in the admin-set-user-ban edge
-- function and logs from there.
create or replace function public.admin_set_user_suspended(
  p_user_id uuid,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already_suspended boolean;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  select suspended_at is not null into v_already_suspended
  from public.user_subscriptions
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'No subscription row for user %', p_user_id;
  end if;

  update public.user_subscriptions
  set suspended_at = case when p_suspended then now() else null end,
      suspension_reason = case when p_suspended then coalesce(nullif(trim(p_reason), ''), 'admin') else null end
  where user_id = p_user_id;

  -- Only when the state actually changes. Re-freezing an already-frozen account
  -- is a no-op, and an entry for it would be a record of nothing having happened
  -- sitting in a log read as a record of things that did.
  if p_suspended is distinct from v_already_suspended then
    insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
    values (
      auth.uid(),
      case when p_suspended then 'account_freeze' else 'account_unfreeze' end,
      p_user_id,
      case when p_suspended
        then jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'admin'))
        else '{}'::jsonb
      end
    );
  end if;
end;
$$;

revoke execute on function public.admin_set_user_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_user_suspended(uuid, boolean, text) to authenticated, service_role;

-- ── 4. Credit grants ─────────────────────────────────────────────────────────
-- A hand-written ledger row moving real spendable balance, so it is the one
-- admin action with a direct monetary effect that Stripe never sees. `bucket`
-- and `pending` are left to their defaults ('purchased', false) — exactly what
-- the client insert produced, so existing grants and new ones project the same
-- way through computePackLots.
create or replace function public.admin_grant_credits(
  p_user_id uuid,
  p_delta numeric,
  p_reason text default 'admin_grant'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'admin_grant');
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  -- A zero-credit grant writes a ledger row that changes no balance and an audit
  -- entry for an action with no effect. Negative deltas stay allowed: taking
  -- credits back by hand is a real admin action, and this is exactly the kind of
  -- one that most needs the record.
  if p_delta = 0 then
    raise exception 'admin_grant_credits: delta must be non-zero';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such user %', p_user_id;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, is_byok)
  values (p_user_id, p_delta, v_reason, false);

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'credit_grant',
    p_user_id,
    jsonb_build_object('delta', p_delta, 'reason', v_reason)
  );
end;
$$;

revoke execute on function public.admin_grant_credits(uuid, numeric, text) from public, anon;
grant execute on function public.admin_grant_credits(uuid, numeric, text) to authenticated, service_role;

-- ── 5. Close the direct-write paths the RPCs replace ─────────────────────────
-- These are what made the log optional. `20260506000003` added both so the admin
-- panel could write from the browser; the panel now goes through the functions
-- above, and no other caller exists (the Stripe webhook, the spend gate and the
-- clawback RPC all run as service_role or SECURITY DEFINER and bypass RLS
-- entirely, so none of them is affected).
--
-- Note that `user_subscriptions_update_admin` had a USING clause and no WITH
-- CHECK, so it also let an admin rewrite any column of any subscription row —
-- stripe_customer_id, current_period_end — to any value. Dropping it narrows
-- that to the two fields the RPCs actually change.
drop policy if exists "user_subscriptions_update_admin" on public.user_subscriptions;
drop policy if exists "ai_credit_ledger_admin_insert" on public.ai_credit_ledger;

comment on table public.admin_audit_log is
  'Append-only record of privileged admin actions (#642). Writers are SECURITY '
  'DEFINER functions and service_role edge functions only; there is no INSERT '
  'policy and no write grant for anon/authenticated. Adding an action means '
  'extending admin_audit_log_action_check in the same migration as its writer.';
