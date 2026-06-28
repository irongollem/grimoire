-- Migration: lock_down_trigger_function_execute
-- enforce_byok_pro_only is a trigger function and must never be REST-callable.
-- Trigger functions are invoked by the trigger system, which does not check
-- EXECUTE privilege, so revoking it from all client roles has no functional
-- impact and removes it from the exposed PostgREST RPC surface.

revoke execute on function public.enforce_byok_pro_only() from public, anon, authenticated;
