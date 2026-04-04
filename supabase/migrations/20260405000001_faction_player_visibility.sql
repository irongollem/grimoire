-- Replace binary is_player_visible on factions with per-player sharing pattern
-- (shared_with_players + player_visible_to) to match Atlas/NPCs pattern.

alter table factions
  add column shared_with_players boolean not null default false,
  add column player_visible_to    uuid[]  default null;

-- Migrate existing is_player_visible → shared_with_players
update factions set shared_with_players = true where is_player_visible = true;

-- Drop old column
alter table factions drop column is_player_visible;

-- Drop old player SELECT policy and recreate with per-player support
drop policy "factions_player_select" on factions;

create policy "factions_player_select" on factions for select using (
  shared_with_players = true
  and (
    -- Whole party: player_visible_to is null means all players in same campaign
    (
      player_visible_to is null
      and user_id in (
        select cm_dm.user_id from campaign_members cm_player
        join campaign_members cm_dm
          on cm_player.campaign_id = cm_dm.campaign_id and cm_dm.role = 'dm'
        where cm_player.user_id = auth.uid() and cm_player.role = 'player'
      )
    )
    or
    -- Per-player: current user's linked party_member_id is in player_visible_to
    (
      player_visible_to is not null
      and exists (
        select 1 from campaign_members cm
        join campaign_members cm_dm
          on cm.campaign_id = cm_dm.campaign_id and cm_dm.role = 'dm'
        where cm.user_id = auth.uid()
          and cm.role = 'player'
          and cm_dm.user_id = factions.user_id
          and cm.party_member_id = any(factions.player_visible_to)
      )
    )
  )
);
