-- Migration 20260405000003 was recorded as applied but the columns were never
-- actually created on the remote DB. This migration adds them idempotently.

alter table crafting_recipes
  add column if not exists shared_with_players boolean not null default false,
  add column if not exists player_visible_to   uuid[]  default null;

-- Recreate the player select policy using the new columns (drop first in case it exists)
drop policy if exists "crafting_recipes_select_player" on crafting_recipes;

create policy "crafting_recipes_select_player" on crafting_recipes
  for select using (
    shared_with_players = true
    and campaign_id is not null
    and is_campaign_member(campaign_id)
    and (
      player_visible_to is null
      or exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.campaign_id = crafting_recipes.campaign_id
          and cm.party_member_id = any(crafting_recipes.player_visible_to)
      )
    )
  );
