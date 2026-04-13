-- Migration: backfill_npc_player_visible_to
-- Replace legacy null player_visible_to values:
--   shared_with_players = true  → populate with all current party member IDs for that campaign
--   shared_with_players = false → set to empty array (hidden)

-- Step 1: NPCs that were intentionally shared with the whole party
update npcs n
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from party_members pm
  where pm.campaign_id = n.campaign_id
)
where n.shared_with_players = true
  and n.player_visible_to is null;

-- Step 2: All remaining nulls were never shared — set to empty array
update npcs
set player_visible_to = '{}'
where player_visible_to is null;

-- Step 3: Drop RLS policies that reference shared_with_players
drop policy if exists "Campaign members see shared npcs" on npcs;
drop policy if exists "npcs_player_select" on npcs;

-- Step 4: Recreate npcs_player_select without shared_with_players
-- player_visible_to is now always an array; non-empty = visible to those party members
create policy "npcs_player_select" on npcs
  for select
  using (
    campaign_id in (
      select campaign_id from campaign_members
      where user_id = auth.uid()
    )
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = npcs.campaign_id
        and cm.party_member_id = any(npcs.player_visible_to)
    )
  );

-- Step 5: Drop the now-redundant shared_with_players column
alter table npcs drop column shared_with_players;
