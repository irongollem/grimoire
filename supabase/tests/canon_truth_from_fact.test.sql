-- #1255 item 22: a truth remembers the table fact it was made from, and a fact is made a truth once.

begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12552200-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'fact-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12552200-0000-4000-8000-0000000000c1', '12552200-0000-4000-8000-000000000001', 'The Salt Road', 'dnd5e-2024');

insert into public.story_facts (id, campaign_id, user_id, body, known_to_player, source) values
  ('12552200-0000-4000-8000-0000000000f1', '12552200-0000-4000-8000-0000000000c1', '12552200-0000-4000-8000-000000000001',
   'The ferryman is blind in one eye.', true, 'table');

select lives_ok($$
  insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title, from_fact_id) values
    ('12552200-0000-4000-8000-0000000000a1', '12552200-0000-4000-8000-000000000001', '12552200-0000-4000-8000-0000000000c1',
     'truth', 'all', 'The ferryman is blind in one eye.', '12552200-0000-4000-8000-0000000000f1')
$$, 'a truth is filed from a table fact');

select throws_ok($$
  insert into public.canon_entries (user_id, campaign_id, part, knowledge, title, from_fact_id) values
    ('12552200-0000-4000-8000-000000000001', '12552200-0000-4000-8000-0000000000c1',
     'truth', 'all', 'The ferryman is half blind.', '12552200-0000-4000-8000-0000000000f1')
$$, '23505', null, 'the same fact cannot be made a truth twice');

select throws_ok($$
  insert into public.canon_entries (user_id, campaign_id, part, title, from_fact_id) values
    ('12552200-0000-4000-8000-000000000001', '12552200-0000-4000-8000-0000000000c1',
     'secret', 'The ferryman sees with the other eye.', '12552200-0000-4000-8000-0000000000f1')
$$, '23514', null, 'only a truth is made from a fact');

delete from public.story_facts where id = '12552200-0000-4000-8000-0000000000f1';
select is((select count(*)::int from public.canon_entries where id = '12552200-0000-4000-8000-0000000000a1'), 1,
  'deleting the fact leaves the truth standing');
select is((select from_fact_id from public.canon_entries where id = '12552200-0000-4000-8000-0000000000a1'), null,
  'and the truth then points nowhere');

select * from finish();
rollback;
