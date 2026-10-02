-- A recipe ingredient may be a library item.
--
-- #819 (20260906185016) gave crafting_recipe_ingredients a library_item_id
-- column, taught craft_apply to consume it, and let the recipe editor write it.
-- It did not touch ingredient_item_or_tags, which predates the column and still
-- read "an owned item, or else tags". A library ingredient is neither, so
-- picking one (a Potion of Healing, say) made the save fail with a check
-- violation. The editor replaces a recipe's ingredients by deleting them all and
-- inserting the new set, so the failed save also left the recipe with none.
--
-- The rule the column comments already state: exactly one of an owned item, a
-- library item, or a non-empty tag list. That is narrower than the old rule in
-- one corner (a library item alongside tags used to pass), and production held
-- no such row on 2 Oct 2026: of 586 ingredients none had a library item at all,
-- which is this bug seen from the other side.

alter table public.crafting_recipe_ingredients
  drop constraint if exists ingredient_item_or_tags,
  add constraint ingredient_item_or_tags check (
    (num_nonnulls(item_id, library_item_id) = 1 and tags is null)
    or (num_nonnulls(item_id, library_item_id) = 0 and tags is not null and cardinality(tags) > 0)
  );
