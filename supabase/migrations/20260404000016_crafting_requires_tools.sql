-- Drop the policy that depends on is_player_visible, replace with grants-only
drop policy if exists "crafting_recipes_select_player" on crafting_recipes;

create policy "crafting_recipes_select_player" on crafting_recipes
  for select using (
    is_campaign_member(campaign_id) AND
    id IN (
      select recipe_id from crafting_recipe_grants
      where party_member_id in (
        select id from party_members
        where user_id = auth.uid() and campaign_id = crafting_recipes.campaign_id
      )
    )
  );

alter table crafting_recipes
  add column if not exists requires_tools boolean not null default false,
  drop column if exists is_player_visible;
