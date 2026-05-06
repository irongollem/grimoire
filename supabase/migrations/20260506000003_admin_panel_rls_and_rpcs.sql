-- Migration: admin_panel_rls_and_rpcs
-- Lock down plans + user_subscriptions with RLS, add admin write policies, and create admin RPCs

-- ── 1. plans — enable RLS (currently GRANT ALL with no RLS = anyone can write) ──

alter table plans enable row level security;

create policy "plans_select"
  on plans for select using (true);

create policy "plans_update_admin"
  on plans for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 2. user_subscriptions — enable RLS ───────────────────────────────────────

alter table user_subscriptions enable row level security;

create policy "user_subscriptions_select_own"
  on user_subscriptions for select
  using (auth.uid() = user_id);

create policy "user_subscriptions_select_admin"
  on user_subscriptions for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "user_subscriptions_update_admin"
  on user_subscriptions for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 3. ai_credit_ledger — admin insert (for manual credit grants) ─────────────

create policy "ai_credit_ledger_admin_insert"
  on ai_credit_ledger for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── 4. get_admin_users() — lists all users with subscription + credit balance ──
-- SECURITY DEFINER so it can read auth.users (not accessible via normal RLS).
-- Admin-only: raises exception if caller is not an app admin.

create or replace function get_admin_users()
returns table (
  user_id   uuid,
  email     text,
  display_name text,
  created_at   timestamptz,
  plan_id   text,
  status    text,
  ai_credits bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
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
    coalesce(b.balance, 0)::bigint                as ai_credits
  from auth.users u
  left join user_subscriptions s on s.user_id = u.id
  left join ai_credit_balance   b on b.user_id = u.id
  order by u.created_at desc;
end;
$$;
