begin;
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- A pet is a companion that can never be combat-ready (#1115, 20261029073936):
-- every combat path reads `combat_ready`, so the row itself refuses a ready pet.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('97200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pet-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000001', 'Sothery');

select throws_ok(
  $$ insert into public.companions (user_id, campaign_id, name, companion_type, source_type, max_hp, current_hp, combat_ready)
     values ('97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Tea Mouse', 'pet', 'custom', 1, 1, true) $$,
  '23514', null, 'a pet cannot be stored ready for combat');

select lives_ok(
  $$ insert into public.companions (id, user_id, campaign_id, name, companion_type, source_type, max_hp, current_hp, combat_ready)
     values ('97200000-0000-4000-8000-000000000020', '97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Tea Mouse', 'pet', 'custom', 1, 1, false) $$,
  'a pet that stays out of combat is stored');

select throws_ok(
  $$ update public.companions set combat_ready = true where id = '97200000-0000-4000-8000-000000000020' $$,
  '23514', null, 'and cannot be toggled into the fight afterwards');

-- Positive control: the rule is about pets, not companions.
select lives_ok(
  $$ insert into public.companions (user_id, campaign_id, name, companion_type, source_type, max_hp, current_hp, combat_ready)
     values ('97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Academy Raven', 'familiar', 'custom', 3, 3, true) $$,
  'a familiar still joins combat');

select * from finish();
rollback;
