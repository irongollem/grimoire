-- Two trigger functions kept the default EXECUTE grant (#1033 security pass).
--
-- 20260730000003 created private.signal_encounter_npc_identity_change() and
-- private.sync_encounter_state_player_update() as SECURITY DEFINER without the
-- revoke every other trigger function carries, so anon and authenticated could
-- execute them. They sit in `private`, which PostgREST does not publish, and a
-- trigger function cannot be called outside a trigger anyway, so nothing was
-- reachable; but a definer with an open grant is the shape every audit has to
-- re-prove harmless. The trigger system never checks EXECUTE, so the triggers
-- keep firing. trigger_functions_not_callable.test.sql now holds the line.

revoke execute on function private.signal_encounter_npc_identity_change() from public, anon, authenticated;
revoke execute on function private.sync_encounter_state_player_update() from public, anon, authenticated;
