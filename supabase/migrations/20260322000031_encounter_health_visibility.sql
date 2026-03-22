-- DM-controlled health visibility mode for live encounters.
-- Controls how much health info players see during combat.
--   strategic: PCs see exact HP; allies see bar only; enemies see stage label + bar
--   immersive: no bars — all non-PCs show a status word only (Healthy/Injured/Bloodied/Critical/Dead)
--   unknown:   no health info shown for non-PCs at all

alter table public.encounter_state
  add column if not exists health_visibility text not null default 'strategic';
