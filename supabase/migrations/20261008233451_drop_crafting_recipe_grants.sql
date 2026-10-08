-- crafting_recipe_grants is a surpassed path (#1033).
--
-- Recipes have reached a character through crafting_recipes.player_visible_to
-- since the sharing pattern was unified across modules (5 Apr 2026). Nothing
-- read the grants table after that: not the crafting_recipes select policy,
-- not get_craftable_output_items, not the Workshop. Only the campaign backup
-- and the dev fixture still wrote it, and production held no rows. Found while
-- routing every campaign table onto the live channel: there was nothing for a
-- doorbell to refresh.
--
-- private.owns_crafting_recipe existed only for the grants policies.

delete from private.demo_campaign_tables where table_name = 'crafting_recipe_grants';

drop table public.crafting_recipe_grants;

drop function private.owns_crafting_recipe(uuid);
