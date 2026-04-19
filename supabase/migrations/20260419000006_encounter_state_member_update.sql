-- Migration: encounter_state_member_update
-- Allow campaign members to update encounter_state so player-side patches (wildshape, conditions) can write through RLS

-- Players need UPDATE to patch combatants_live (conditions, wildshape) in real time.
-- The DM policy already grants full access; this adds UPDATE for regular members.
create policy "encounter_state_member_update" on public.encounter_state
  for update using (is_campaign_member(campaign_id))
  with check (is_campaign_member(campaign_id));

