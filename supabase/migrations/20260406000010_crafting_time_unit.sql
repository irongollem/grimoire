-- Rename crafting_time_days to crafting_time and add a unit column
-- so recipes can specify minutes, hours, or days.

alter table crafting_recipes
  rename column crafting_time_days to crafting_time;

alter table crafting_recipes
  add column crafting_time_unit text not null default 'days';

alter table crafting_recipes
  add constraint crafting_time_unit_values
    check (crafting_time_unit in ('minutes', 'hours', 'days'));
