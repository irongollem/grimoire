-- #1203: when the server picks a monster's turn and the monster has a DM's note, encounter-command asks TypeSafe's
-- Jev, of each turn on offer, whether taking it goes against the note. Free to users, like the other judgments:
-- it is recorded through recordFreeGeneration() as 'tactics_note_judgment' at delta 0, so the spend is real and ours.
--
-- The ledger insert needs no row here. This row exists so the spend shows in the admin cost breakdown, which renders
-- one line per ai_generation_credit_costs entry (same reasoning as 20261115114855's 'entity_judgment'). The price of
-- 'jev-latest' is already in ai_model_pricing from that migration.

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('tactics_note_judgment', 'Monster Note Check (infrastructure)', 0, 52)
on conflict (generation_type) do nothing;
