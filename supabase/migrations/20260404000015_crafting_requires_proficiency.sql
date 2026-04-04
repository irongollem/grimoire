alter table crafting_recipes
  add column if not exists requires_proficiency boolean not null default false;
