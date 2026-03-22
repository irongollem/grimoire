-- Move health_visibility from per-encounter to per-campaign setting.
-- The DM sets it once in campaign settings; all players in the campaign see encounters accordingly.

alter table public.encounter_state
  drop column if exists health_visibility;

alter table public.campaigns
  add column if not exists health_visibility text not null default 'strategic';
