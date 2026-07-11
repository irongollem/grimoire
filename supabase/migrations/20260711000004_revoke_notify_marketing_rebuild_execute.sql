-- Migration: revoke_notify_marketing_rebuild_execute
-- notify_marketing_rebuild is a SECURITY DEFINER trigger function and must never
-- be REST-callable. Trigger functions are invoked by the trigger system, which
-- does not check EXECUTE privilege, so revoking it from all client roles has no
-- functional impact and removes it from the exposed PostgREST RPC surface.
-- (Sibling trigger fns already do this — see 20260629000003; this closes the gap
-- for the fn added in 20260629000004 and clears advisor lint 0028/0029.)

revoke execute on function public.notify_marketing_rebuild() from public, anon, authenticated;
