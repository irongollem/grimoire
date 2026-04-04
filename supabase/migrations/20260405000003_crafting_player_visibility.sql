-- Replace the dual-system (is_player_visible + crafting_recipe_grants) with the
-- unified per-player sharing pattern (shared_with_players + player_visible_to).

alter table crafting_recipes
  add column shared_with_players boolean not null default false,
  add column player_visible_to    uuid[]  default null;

-- Migrate is_player_visible=true → shared with whole party
update crafting_recipes
  set shared_with_players = true, player_visible_to = null
  where is_player_visible = true;

-- Migrate per-player grants → player_visible_to (only for recipes not already shared with all)
update crafting_recipes r
  set shared_with_players = true,
      player_visible_to = (
        select array_agg(distinct g.party_member_id)
        from crafting_recipe_grants g
        where g.recipe_id = r.id
      )
  where is_player_visible = false
    and exists (select 1 from crafting_recipe_grants g where g.recipe_id = r.id);

-- Drop old column
alter table crafting_recipes drop column is_player_visible;

-- Update player RLS policy to use new columns
drop policy "crafting_recipes_select_player" on crafting_recipes;
create policy "crafting_recipes_select_player" on crafting_recipes
  for select using (
    shared_with_players = true
    and campaign_id is not null
    and is_campaign_member(campaign_id)
    and (
      -- Whole party
      player_visible_to is null
      or
      -- Per-player: current user's linked party_member_id is in the array
      exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.campaign_id = crafting_recipes.campaign_id
          and cm.party_member_id = any(crafting_recipes.player_visible_to)
      )
    )
  );

-- Drop the grants table (no longer needed)
drop table crafting_recipe_grants;
