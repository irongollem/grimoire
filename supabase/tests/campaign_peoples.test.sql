-- #1255 item 30: the peoples of a world are percentages on the campaign row, and the shape is held by the table.
-- Every refusal sits beside the valid shape it is one mistake away from.

begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12550000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'peoples-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12550000-0000-4000-8000-0000000000c1', '12550000-0000-4000-8000-000000000001', 'Elf country', 'dnd5e-2024');

select is((select peoples from public.campaigns where id = '12550000-0000-4000-8000-0000000000c1'), '[]'::jsonb,
  'a campaign starts with no peoples said, so every generator behaves as it did');

select ok(private.valid_peoples('[{"name": "Elf", "percent": 80}, {"name": "Human", "percent": 15}]'),
  'percentages that leave some over are valid: the rest is anyone else');
select ok(private.valid_peoples('[{"name": "Elf", "percent": 62.5}, {"name": "Human", "percent": 37.5}]'),
  'a share may be a fraction, and the shares may fill the hundred exactly');

-- A predicate used in a check constraint must answer false, never NULL: a NULL check passes.
select is(private.valid_peoples(null), false, 'no value is refused with false, not NULL');
select is(private.valid_peoples('{"Elf": 80}'), false, 'an object is refused: the list keeps the order the DM gave it');
select is(private.valid_peoples('[{"name": "Elf", "percent": 80}, {"name": "Human", "percent": 30}]'), false,
  'shares that pass a hundred are refused');
select is(private.valid_peoples('[{"name": "Elf", "percent": 80}, {"name": " elf", "percent": 5}]'), false,
  'a people listed twice is refused, whatever its case or spacing');
select is(private.valid_peoples('[{"name": "Elf", "percent": "80"}]'), false, 'a share written as text is refused, without a cast error');
select is(private.valid_peoples('[{"name": "  ", "percent": 10}]'), false, 'a people with no name is refused');
select is(private.valid_peoples('[{"name": "Elf", "percent": -1}]'), false, 'a negative share is refused');

select throws_ok(
  $$update public.campaigns set peoples = '[{"name": "Elf", "percent": 120}]' where id = '12550000-0000-4000-8000-0000000000c1'$$,
  '23514', null, 'the table itself refuses a share above a hundred');

select * from finish();
rollback;
