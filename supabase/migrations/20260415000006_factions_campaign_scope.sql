-- Migration: factions_campaign_scope
-- Add campaign_id to factions (and join tables) so factions are scoped per campaign

-- ── factions ──────────────────────────────────────────────────────────────────

alter table factions
  add column campaign_id uuid references campaigns(id) on delete cascade;

-- Drop old user_id-only DM policies and the player-visible policy
-- (factions_member_select from a later migration is left unchanged)
drop policy "factions_select"        on factions;
drop policy "factions_insert"        on factions;
drop policy "factions_update"        on factions;
drop policy "factions_delete"        on factions;
drop policy "factions_player_select" on factions;

-- New campaign-scoped DM policies
create policy "factions_select" on factions
  for select using (is_campaign_dm(campaign_id));

create policy "factions_insert" on factions
  for insert with check (is_campaign_dm(campaign_id));

create policy "factions_update" on factions
  for update using (is_campaign_dm(campaign_id));

create policy "factions_delete" on factions
  for delete using (is_campaign_dm(campaign_id));

-- Players can see factions explicitly shared with them (their party_member_id in
-- player_visible_to), scoped to the campaign they're a member of.
create policy "factions_player_select" on factions
  for select using (
    is_campaign_member(campaign_id)
    and player_visible_to is not null
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.role = 'player'
        and cm.party_member_id = any(factions.player_visible_to)
    )
  );

