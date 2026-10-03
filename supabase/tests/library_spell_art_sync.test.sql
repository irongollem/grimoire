-- #947: spell art has one source (library_spell_art_canonical), a spell without
-- a row of its own takes its namesake's, library_art_defaults holds items only,
-- and item-images gains the admin-only srd/ prefix.
--
--   1 Ada (app admin)   2 Ben (ordinary user)
-- Fixture spells are all named 'Zzgrim ...' so no real row can collide.

begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('94700000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'spell-art-sync-' || n || '@example.invalid', '',
       case when n = 1 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.library_spells
  (id, name, level, school, casting_time, range, duration, conceptual_key, ruleset,
   source_document_key, source_record_key, image_url)
values
  -- Orb: the 2014 copy has canonical art, the 2024 copy has none of its own.
  ('zzgrim_orb_2014', 'Zzgrim Orb', 1, 'evocation', '1 action', '60 feet', 'Instant', 'zzgrim-orb', '2014', 'zzgrim', 'orb14', null),
  ('zzgrim_orb_2024', 'Zzgrim Orb', 1, 'evocation', '1 action', '60 feet', 'Instant', 'zzgrim-orb', '2024', 'zzgrim', 'orb24', null),
  -- Veil: both copies have canonical art of their own, which must not be swapped.
  ('zzgrim_veil_2014', 'Zzgrim Veil', 1, 'illusion', '1 action', 'Self', 'Instant', 'zzgrim-veil', '2014', 'zzgrim', 'veil14', null),
  ('zzgrim_veil_2024', 'Zzgrim Veil', 1, 'illusion', '1 action', 'Self', 'Instant', 'zzgrim-veil', '2024', 'zzgrim', 'veil24', null),
  -- Lone: no canonical row by id or by name.
  ('zzgrim_lone', 'Zzgrim Lone', 1, 'evocation', '1 action', 'Self', 'Instant', 'zzgrim-lone', '2014', 'zzgrim', 'lone', 'https://example.invalid/keep.webp');

insert into public.library_spell_art_canonical (entry_id, image_url, portrait_focal_point) values
  ('zzgrim_orb_2014', 'https://example.invalid/orb.webp', '{"x":10,"y":20}'),
  ('zzgrim_veil_2014', 'https://example.invalid/veil14.webp', null),
  ('zzgrim_veil_2024', 'https://example.invalid/veil24.webp', null);

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"94700000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"94700000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

-- The bucket may not exist in a fresh local stack (dev:buckets creates it).
insert into storage.buckets (id, name, public) values ('item-images', 'item-images', true)
on conflict (id) do nothing;

set local role authenticated;

select pg_temp.as_user(2);
select throws_ok($$ select public.sync_library_spell_art() $$, 'Unauthorized',
  'a non-admin cannot run the spell art sync');

select pg_temp.as_user(1, true);
select lives_ok($$ select public.sync_library_spell_art() $$, 'the admin can run the sync');

select is((select image_url from public.library_spells where id = 'zzgrim_orb_2014'),
  'https://example.invalid/orb.webp', 'a spell gets its own canonical art');
select is((select image_url from public.library_spells where id = 'zzgrim_orb_2024'),
  'https://example.invalid/orb.webp', 'a same-named spell with no row of its own gets the namesake''s art');
select is((select image_focal_point from public.library_spells where id = 'zzgrim_orb_2024'),
  '{"x":10,"y":20}'::jsonb, 'and the namesake''s focal point with it');
select is((select image_url from public.library_spells where id = 'zzgrim_veil_2014'),
  'https://example.invalid/veil14.webp', 'a spell with its own row keeps it (2014)');
select is((select image_url from public.library_spells where id = 'zzgrim_veil_2024'),
  'https://example.invalid/veil24.webp', 'a spell with its own row is not overwritten by a namesake''s (2024)');
select is((select image_url from public.library_spells where id = 'zzgrim_lone'),
  'https://example.invalid/keep.webp', 'a spell with no art by id or name is left alone');

-- library_art_defaults is items only.
select throws_ok(
  $$ insert into public.library_art_defaults (content_type, content_name, image_url)
     values ('spell', 'zzgrim orb', 'https://example.invalid/x.webp') $$,
  '23514', null, 'a spell default is refused by the check constraint');
select lives_ok(
  $$ insert into public.library_art_defaults (content_type, content_name, image_url)
     values ('item', 'zzgrim lantern', 'https://example.invalid/x.webp') $$,
  'an item default is accepted');

-- item-images/srd/ is admin-only to write.
select pg_temp.as_user(2);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('item-images', 'srd/zzgrim.webp') $$,
  '42501', null, 'a non-admin cannot write under item-images/srd/');
select pg_temp.as_user(1, true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('item-images', 'srd/zzgrim.webp') $$,
  'the admin can write under item-images/srd/');

select * from finish();
rollback;
