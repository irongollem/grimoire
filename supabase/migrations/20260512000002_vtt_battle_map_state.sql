-- Migration: vtt_battle_map_state
-- Adds storage for VTT battle map state: per-encounter-run fog-of-war mask
-- and per-location grid calibration. Token positions live inside the existing
-- combatants_live jsonb on encounter_state — no schema change needed for those.

alter table encounter_state
  add column if not exists fog_mask text;

alter table locations
  add column if not exists grid_calibration jsonb;
