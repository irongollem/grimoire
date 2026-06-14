-- Migration: security_hardening
-- Grab-bag of lower-severity security/perf hardening from the pre-launch audit.

-- ── 1. craft_apply: pin search_path ──────────────────────────────────────────
-- craft_apply is SECURITY INVOKER (RLS still applies), but it lacked a fixed
-- search_path — an unqualified table reference with a mutable search_path is a
-- latent footgun. Pin it. (Flagged by the Supabase linter: function_search_path_mutable.)
alter function public.craft_apply(uuid[], text, jsonb, jsonb) set search_path = public;

-- ── 2. store_items_insert: wrap auth.uid() in a scalar subquery ──────────────
-- The rest of the schema was normalized to (select auth.uid()) so the auth call
-- is evaluated once per statement instead of once per row (auth_rls_initplan).
-- This policy was added later and missed the treatment. Same predicate, faster plan.
drop policy if exists store_items_insert on store_items;
create policy store_items_insert on store_items
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from locations l
      where l.id = location_id and l.user_id = (select auth.uid())
    )
  );

-- ── 3. Admin-plan invites must be bounded ────────────────────────────────────
-- consume_app_invite() grants app-admin via app_metadata when granted_plan =
-- 'admin'. Admin invites are only creatable by existing admins and use 122-bit
-- uuid tokens, so this isn't currently exploitable — but an unbounded
-- (never-expiring, unlimited-use) admin invite link is a standing liability if
-- it ever leaks. Force every admin invite to be time-boxed and use-capped.
-- Verified zero existing rows violate this.
alter table public.app_invites
  add constraint app_invites_admin_bounded
  check (
    granted_plan <> 'admin'
    or (expires_at is not null and max_uses is not null)
  );

-- ── 4. Revoke anon EXECUTE on identity-requiring invite RPCs ─────────────────
-- These are SECURITY DEFINER and act on auth.uid(); they already no-op for anon
-- (auth.uid() is null), but the unauthenticated role has no business calling
-- privilege-affecting RPCs. Defense in depth — keep them to authenticated only.
revoke execute on function public.consume_app_invite(uuid) from anon;
revoke execute on function public.join_campaign_via_invite(uuid) from anon;
