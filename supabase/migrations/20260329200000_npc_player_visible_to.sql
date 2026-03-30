-- Add per-player visibility to NPCs (replaces all-or-nothing shared_with_players for sharing control)
-- shared_with_players is kept for backwards compat but player_visible_to takes precedence when set.
-- null = not shared; empty array = not shared; uuid[] = specific party members; use shared_with_players=true + player_visible_to=null for whole party.

alter table npcs add column if not exists player_visible_to uuid[] default null;

-- Drop old player SELECT policy
drop policy if exists "npcs_player_select" on npcs;

-- New player SELECT policy: shared with whole party (shared_with_players=true AND player_visible_to IS NULL)
-- OR shared with this specific player (their party_member_id is in player_visible_to)
create policy "npcs_player_select" on npcs
  for select
  using (
    campaign_id in (
      select campaign_id from campaign_members
      where user_id = auth.uid()
    )
    and (
      -- whole-party share
      (shared_with_players = true and player_visible_to is null)
      -- per-player share: check if current user's linked party_member_id is in the array
      or (
        player_visible_to is not null
        and exists (
          select 1 from campaign_members cm
          where cm.user_id = auth.uid()
            and cm.campaign_id = npcs.campaign_id
            and cm.party_member_id = any(npcs.player_visible_to)
        )
      )
    )
  );
