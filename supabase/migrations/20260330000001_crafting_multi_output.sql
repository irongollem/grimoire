-- ─────────────────────────────────────────────────────────────────────────────
-- Crafting recipe outputs (replaces single output_item_id / output_quantity)
-- ─────────────────────────────────────────────────────────────────────────────
create table crafting_recipe_outputs (
  id         uuid    primary key default gen_random_uuid(),
  recipe_id  uuid    not null references crafting_recipes(id) on delete cascade,
  item_id    uuid    not null references items(id) on delete cascade,
  quantity   integer not null default 1
);

alter table crafting_recipe_outputs enable row level security;

create policy "crafting_recipe_outputs_select" on crafting_recipe_outputs
  for select using (
    recipe_id in (select id from crafting_recipes)
  );
create policy "crafting_recipe_outputs_insert" on crafting_recipe_outputs
  for insert with check (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );
create policy "crafting_recipe_outputs_delete" on crafting_recipe_outputs
  for delete using (
    recipe_id in (select id from crafting_recipes where user_id = auth.uid())
  );

-- Migrate existing single-output data into the new table
insert into crafting_recipe_outputs (recipe_id, item_id, quantity)
select id, output_item_id, output_quantity
from crafting_recipes
where output_item_id is not null;

-- Drop old columns
alter table crafting_recipes
  drop column if exists output_item_id,
  drop column if exists output_quantity;
