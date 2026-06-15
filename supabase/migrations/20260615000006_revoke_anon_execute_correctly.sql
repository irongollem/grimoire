-- Migration: revoke_anon_execute_correctly
-- Correct the EXECUTE lockdown that 20260615000002 / 20260615000004 botched.
--
-- Those migrations used `revoke execute ... from public`, assuming anon/
-- authenticated inherited EXECUTE via the PUBLIC grant. They do NOT: Supabase
-- grants EXECUTE to `anon` and `authenticated` EXPLICITLY (via ALTER DEFAULT
-- PRIVILEGES) on every new function in the public schema. So `revoke from
-- public` was a no-op and `anon` retained a direct EXECUTE grant (confirmed via
-- pg_proc.proacl and the security advisor). The right move is an explicit
-- `revoke ... from anon` (and from authenticated where it isn't needed).

-- is_user_pro: only the BYOK trigger (SECURITY DEFINER, runs as owner) and the
-- service-role edge functions call it. No client RPC needs it; revoking
-- authenticated also stops an authed user from probing arbitrary users' Pro
-- status by uuid. service_role retains EXECUTE (granted in 20260615000002).
revoke execute on function public.is_user_pro(uuid) from anon, authenticated;

-- Invite RPCs act on auth.uid(), so they require a real session. anon has no
-- business calling them. authenticated keeps EXECUTE: join_campaign_via_invite
-- is called by the client (useCampaignMembers); consume_app_invite is now driven
-- server-side by the signup trigger but authenticated access is harmless.
revoke execute on function public.consume_app_invite(uuid) from anon;
revoke execute on function public.join_campaign_via_invite(uuid) from anon;

-- enforce_byok_pro_only is a trigger function — it can only run as a trigger,
-- never as a direct RPC. Remove the pointless anon/authenticated EXECUTE grants
-- (the trigger fires regardless of caller EXECUTE privilege).
revoke execute on function public.enforce_byok_pro_only() from anon, authenticated;
