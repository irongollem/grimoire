-- Migration: revoke_anon_get_player_visible_puzzles
-- 20260711000009 created get_player_visible_puzzles and did `revoke all ... from
-- public; grant ... to authenticated`. But Supabase's ALTER DEFAULT PRIVILEGES
-- grants EXECUTE on new public functions directly to `anon` (not via PUBLIC), so
-- revoking PUBLIC left anon with a direct EXECUTE — flagged by the security
-- advisor (anon_security_definer_function_executable). The function gates on
-- private.is_campaign_member(auth.uid()) so anon gets 0 rows regardless, but per
-- the project convention (login-only RPCs revoke anon explicitly) keep it off the
-- anon RPC surface. Idempotent on a fresh reset.

revoke execute on function public.get_player_visible_puzzles(uuid, uuid) from anon;
grant  execute on function public.get_player_visible_puzzles(uuid, uuid) to authenticated, service_role;
