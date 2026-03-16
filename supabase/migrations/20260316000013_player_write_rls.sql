-- Phase 4: player write permissions
-- Allows players to update their own linked party_member and manage inventory

-- ── party_members: players can update their own linked record ─────────────────
-- (DM full-access is already covered by the existing FOR ALL owner policy)

create policy "party_members_player_update" on public.party_members
  for update using (
    campaign_id is not null
    and exists (
      select 1 from public.campaign_members
      where campaign_members.campaign_id = party_members.campaign_id
        and campaign_members.user_id     = auth.uid()
        and campaign_members.party_member_id = party_members.id
    )
  );


-- ── party_inventory: players can insert and delete ───────────────────────────
-- SELECT + UPDATE already granted in 20260315000009_player_portal.sql

create policy "party_inventory_member_insert" on public.party_inventory
  for insert with check (is_campaign_member(campaign_id));

create policy "party_inventory_member_delete" on public.party_inventory
  for delete using (is_campaign_member(campaign_id));
