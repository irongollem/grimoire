-- Migration: drop_stray_spend_spell_slot_overload
-- The pre-pool spend_spell_slot(uuid, integer) overload was meant to be
-- dropped in 20260720000006 but survived on the remote, still SECURITY DEFINER
-- and executable by authenticated. It bypasses the pool/template rules that
-- 20260720000034 made server-owned, and nothing calls it — remove it.
drop function if exists public.spend_spell_slot(uuid, integer);
