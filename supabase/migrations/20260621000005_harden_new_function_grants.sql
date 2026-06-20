-- Migration: harden_new_function_grants
-- Match the established hardening pattern (20260609000005): functions that are
-- only invoked internally should not be directly executable by client roles.
--   - guard_campaign_member_self_update(): a trigger function, never called directly.
--   - is_user_app_admin(uuid): only used inside SECURITY DEFINER sync RPCs (which
--     run as owner), so it needs no client EXECUTE grant.

revoke execute on function public.guard_campaign_member_self_update() from public, anon, authenticated;
revoke execute on function public.is_user_app_admin(uuid)            from public, anon, authenticated;
