-- A recipe ingredient is exactly one of: an owned item, a library item, or a
-- non-empty tag list.
--
-- The library branch is the one that broke. #819 added the column and the
-- editor wrote it, but the older ingredient_item_or_tags check still refused
-- any row without an owned item or tags, so saving a recipe with a library
-- ingredient failed for every DM (20261002112421).

begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10020000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recipe-ingredient-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('10020000-0000-4000-8000-000000000010', '10020000-0000-4000-8000-000000000001', 'Workshop');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('10020000-0000-4000-8000-000000000010', '10020000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.items (id, user_id, campaign_id, name)
values ('10020000-0000-4000-8000-000000000020', '10020000-0000-4000-8000-000000000001', '10020000-0000-4000-8000-000000000010', 'Sack of sugar');

-- Its own library row: a fresh local stack has none, and a subselect that
-- returns NULL would turn the library case into the "nothing set" case.
insert into public.library_items (id, name, item_type, rarity, requires_attunement, properties, description, tags, is_arcane_focus, source_document_key, source_record_key, provenance)
values ('srd_test_recipe_ingredient_vial', 'Test vial', 'gear', 'common', false, '{}', 'A vial.', '{}', false, 'srd-2014', 'test-recipe-ingredient-vial', '{}'::jsonb);

insert into public.crafting_recipes (id, user_id, campaign_id, name)
values ('10020000-0000-4000-8000-000000000030', '10020000-0000-4000-8000-000000000001', '10020000-0000-4000-8000-000000000010', 'Syrup');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10020000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', '10020000-0000-4000-8000-000000000020', null, null, 1)$$,
  'an owned item is an ingredient'
);

select lives_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', null, 'srd_test_recipe_ingredient_vial', null, 1)$$,
  'a library item is an ingredient, as the DM whose recipe it is'
);

select lives_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', null, null, array['sugar'], 1)$$,
  'a tag list is an ingredient'
);

select throws_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', null, null, null, 1)$$,
  '23514', null,
  'an ingredient that names nothing is refused'
);

select throws_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', null, null, '{}'::text[], 1)$$,
  '23514', null,
  'an empty tag list names nothing either'
);

select throws_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', null, 'srd_test_recipe_ingredient_vial', array['sugar'], 1)$$,
  '23514', null,
  'a library item and a tag list together are refused'
);

select throws_ok(
  $$insert into public.crafting_recipe_ingredients (recipe_id, item_id, library_item_id, tags, quantity)
    values ('10020000-0000-4000-8000-000000000030', '10020000-0000-4000-8000-000000000020', 'srd_test_recipe_ingredient_vial', null, 1)$$,
  '23514', null,
  'an owned item and a library item together are refused'
);

select * from finish();
rollback;
