-- Replace single `tag` column with `tags text[]` to support multi-tag combos.
-- An ingredient that was "any meat" becomes ["meat"]; "any [glass + container]"
-- requires an item to have ALL tags in the array.

-- Drop the old constraint first
alter table crafting_recipe_ingredients
  drop constraint ingredient_item_or_tag;

-- Migrate existing single-tag rows
alter table crafting_recipe_ingredients
  add column tags text[];

update crafting_recipe_ingredients
  set tags = array[tag]
  where tag is not null;

alter table crafting_recipe_ingredients
  drop column tag;

-- Restore constraint: exactly one of (item_id, tags) must be set
alter table crafting_recipe_ingredients
  add constraint ingredient_item_or_tags check (
    (item_id is not null and tags is null)
    or
    (item_id is null and tags is not null and cardinality(tags) > 0)
  );
