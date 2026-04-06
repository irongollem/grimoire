-- Allow recipe ingredients to match by tag instead of a specific item.
-- item_id becomes nullable; a new `tag` column holds the tag string.
-- Exactly one of (item_id, tag) must be set per row.

alter table crafting_recipe_ingredients
  alter column item_id drop not null,
  add column tag text;

alter table crafting_recipe_ingredients
  add constraint ingredient_item_or_tag check (
    (item_id is not null and tag is null)
    or
    (item_id is null and tag is not null)
  );
