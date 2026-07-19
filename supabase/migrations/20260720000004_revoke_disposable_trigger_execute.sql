-- Migration: revoke_disposable_trigger_execute
-- Advisor follow-up to 20260720000003: reject_disposable_waitlist_email() is a
-- trigger function and never needs a client EXECUTE grant (the trigger system
-- bypasses that check), so take it off the PostgREST RPC surface.

revoke execute on function public.reject_disposable_waitlist_email()
  from public, anon, authenticated;
