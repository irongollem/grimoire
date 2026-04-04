-- Replace binary is_player_visible on quests with per-player sharing pattern
-- (shared_with_players + player_visible_to) to match Atlas/NPCs pattern.
-- quest_objectives and quest_refs keep their binary is_player_visible (sub-item toggles).

alter table quests
  add column shared_with_players boolean not null default false,
  add column player_visible_to    uuid[]  default null;

-- Migrate existing is_player_visible → shared_with_players
update quests set shared_with_players = true where is_player_visible = true;

-- Drop old column
alter table quests drop column is_player_visible;

-- Add player SELECT policy (previously quests had no player-facing RLS)
create policy "quests_player_select" on quests for select using (
  shared_with_players = true
  and campaign_id is not null
  and (
    -- Whole party
    (
      player_visible_to is null
      and is_campaign_member(campaign_id)
    )
    or
    -- Per-player: current user's linked party_member_id is in player_visible_to
    (
      player_visible_to is not null
      and exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.campaign_id = quests.campaign_id
          and cm.party_member_id = any(quests.player_visible_to)
      )
    )
  )
);

-- Update quest_refs player select policy to reference new column name
drop policy "quest_refs_player_select" on quest_refs;
create policy "quest_refs_player_select" on quest_refs for select using (
  is_player_visible = true
  and exists (
    select 1 from quests
    where quests.id = quest_refs.quest_id
      and quests.shared_with_players = true
      and quests.campaign_id is not null
      and is_campaign_member(quests.campaign_id)
  )
);
