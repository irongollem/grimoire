-- #1283 habitat ecology: clades, species, forms, links, yields, a habitat's species and the roll's per-form shares.
-- Every refusal sits beside the allowed write it is one mistake away from.
--
--   1 Dana (DM)   2 Pat (a player at Dana's table)   3 Rook (the DM of another campaign)

begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12830000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'eco-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-000000000001', 'The Marshes', 'dnd5e-2024'),
  ('12830000-0000-4000-8000-0000000000c2', '12830000-0000-4000-8000-000000000003', 'Elsewhere', 'dnd5e-2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-000000000002', 'player', 'Pat');
insert into public.monsters (id, user_id, campaign_id, name, monster_type) values
  ('12830000-0000-4000-8000-0000000000e1', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'False Crust', 'beast'),
  ('12830000-0000-4000-8000-0000000000e2', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'Old False Crust', 'beast'),
  ('12830000-0000-4000-8000-0000000000e3', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'Pith Piper', 'beast');
insert into public.campaign_habitats (id, user_id, campaign_id, name) values
  ('12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'Marmalade Marshes'),
  ('12830000-0000-4000-8000-0000000000a9', '12830000-0000-4000-8000-000000000003', '12830000-0000-4000-8000-0000000000c2', 'Far marsh');
insert into public.canon_entries (id, user_id, campaign_id, part, title, knowledge) values
  ('12830000-0000-4000-8000-0000000000f1', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'truth', 'Squillicks nest in autumn', 'all'),
  ('12830000-0000-4000-8000-0000000000f2', '12830000-0000-4000-8000-000000000001', '12830000-0000-4000-8000-0000000000c1', 'secret', 'The marsh is alive', null);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"12830000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set constraints all immediate;
set local role authenticated;
select pg_temp.as_user(1);

-- ── A habitat is written with the share check in force ──
select lives_ok($$
  insert into public.campaign_habitats (campaign_id, name) values ('12830000-0000-4000-8000-0000000000c1', 'Sippet Country')
$$, 'a new habitat saves with the hundred check running at once (it reads the habitat, not a life row)');

-- ── Clades ──
select lives_ok($$
  insert into public.campaign_clades (id, campaign_id, name, rank) values ('12830000-0000-4000-8000-0000000000b1', '12830000-0000-4000-8000-0000000000c1', 'Crustids', 'family');
  insert into public.campaign_clades (id, campaign_id, name, parent_id) values ('12830000-0000-4000-8000-0000000000b2', '12830000-0000-4000-8000-0000000000c1', 'Pseudocrusta', '12830000-0000-4000-8000-0000000000b1');
$$, 'the DM nests a genus in a family');
select throws_ok($$
  update public.campaign_clades set parent_id = '12830000-0000-4000-8000-0000000000b2' where id = '12830000-0000-4000-8000-0000000000b1'
$$, '23514', null, 'a clade is never inside itself, however far up');

-- ── Species and forms ──
select lives_ok($$
  insert into public.campaign_species (id, campaign_id, clade_id, name, scientific_name, lives_as, activity, seasons)
    values ('12830000-0000-4000-8000-0000000000d1', '12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000b2',
            'False Crust', 'Pseudocrusta lenta', 'alone', 'day', '{"autumn":{"away":false,"note":"Basks on the banks"}}');
  insert into public.campaign_species (id, campaign_id, name, lives_as) values
    ('12830000-0000-4000-8000-0000000000d2', '12830000-0000-4000-8000-0000000000c1', 'Pith Piper', 'colony'),
    ('12830000-0000-4000-8000-0000000000d3', '12830000-0000-4000-8000-0000000000c1', 'Grub-duster', null);
  update public.campaign_species set kingdom = 'plant' where id = '12830000-0000-4000-8000-0000000000d3';
$$, 'the DM writes three species, one in a clade with a Latin name, one a plant');
select throws_ok($$
  update public.campaign_species set seasons = '{"monsoon":{"away":true}}' where id = '12830000-0000-4000-8000-0000000000d1'
$$, '23514', null, 'a season is one of the four kinds the calendar knows');
select throws_ok($$
  update public.campaign_species set lives_as = 'swarmish' where id = '12830000-0000-4000-8000-0000000000d1'
$$, '23514', null, 'how a species lives is one of the words the code understands');
select lives_ok($$
  insert into public.campaign_species_forms (id, campaign_id, species_id, label, stage_order, monster_id) values
    ('12830000-0000-4000-8000-000000000011', '12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d1', 'Young', 1, '12830000-0000-4000-8000-0000000000e1'),
    ('12830000-0000-4000-8000-000000000012', '12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d1', 'Old', 2, '12830000-0000-4000-8000-0000000000e2'),
    ('12830000-0000-4000-8000-000000000021', '12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d2', 'Young', 1, null),
    ('12830000-0000-4000-8000-000000000022', '12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d2', 'Grown', 2, '12830000-0000-4000-8000-0000000000e3');
$$, 'forms: an age with a stat block, and a young pith piper with none');
select throws_ok($$
  insert into public.campaign_species_forms (campaign_id, species_id, label, monster_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d2', 'Odd', '12830000-0000-4000-8000-0000000000e1')
$$, '23505', null, 'a stat block is a form of one species only');

-- ── Links ──
select lives_ok($$
  insert into public.campaign_species_links (campaign_id, from_species_id, kind, to_species_id, to_form_id, note) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d1', 'eats', '12830000-0000-4000-8000-0000000000d2', '12830000-0000-4000-8000-000000000022', 'takes grown ones');
  insert into public.campaign_species_links (campaign_id, from_species_id, kind, from_form_id, to_species_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d3', 'lives_on', null, '12830000-0000-4000-8000-0000000000d1');
  insert into public.campaign_species_links (campaign_id, from_species_id, kind) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d2', 'shelters');
$$, 'a false crust eats grown pith pipers, a plant lives on it, and pith pipers shelter other animals');
select throws_ok($$
  insert into public.campaign_species_links (campaign_id, from_species_id, kind) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d1', 'eats')
$$, '23514', null, 'only sheltering and carrying may leave the other species out');
select throws_ok($$
  insert into public.campaign_species_links (campaign_id, from_species_id, kind, to_species_id, to_form_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000d1', 'eats', '12830000-0000-4000-8000-0000000000d3', '12830000-0000-4000-8000-000000000022')
$$, '23503', null, 'a link narrowed to a form names a form of that species');

-- ── A habitat's species and its roll ──
select lives_ok($$
  insert into public.campaign_habitat_species (campaign_id, habitat_id, species_id, abundance) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d1', 'uncommon'),
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d3', 'common');
  insert into public.campaign_habitat_life (campaign_id, habitat_id, species_id, form_id, percent) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d1', '12830000-0000-4000-8000-000000000011', null),
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d1', '12830000-0000-4000-8000-000000000012', 2);
$$, 'the false crust lives in the marsh: its young worked out, its old set by the DM');
select throws_ok($$
  insert into public.campaign_habitat_life (campaign_id, habitat_id, species_id, form_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d2', '12830000-0000-4000-8000-000000000022')
$$, '23503', null, 'a form is on a habitat''s roll only when its species lives there');
select throws_ok($$
  insert into public.campaign_habitat_life (campaign_id, habitat_id, species_id, form_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a1', '12830000-0000-4000-8000-0000000000d1', '12830000-0000-4000-8000-000000000022')
$$, '23503', null, 'a form on the roll is a form of the species named beside it');
select is((select name from public.campaign_habitat_life_named where form_id = '12830000-0000-4000-8000-000000000012'), 'Old False Crust',
  'the roll reads each form by its stat block''s name');
select is((select species_name from public.campaign_habitat_life_named where form_id = '12830000-0000-4000-8000-000000000012'), 'False Crust',
  'and by its species');
select lives_ok($$
  do $do$ begin
    update public.campaign_habitats set other_percent = 98 where id = '12830000-0000-4000-8000-0000000000a1';
  end $do$
$$, 'a worked-out share is never counted toward a hundred: 2 set plus 98 anything else is allowed');
select throws_ok($$
  do $do$ begin
    update public.campaign_habitats set other_percent = 99 where id = '12830000-0000-4000-8000-0000000000a1';
  end $do$
$$, '23514', null, 'the DM''s shares and anything else may not pass a hundred');
select is((select count(*)::int from public.campaign_habitat_life where species_id = '12830000-0000-4000-8000-0000000000d1'), 2,
  'both false crust forms are on the roll');
select lives_ok($$
  delete from public.campaign_habitat_species where species_id = '12830000-0000-4000-8000-0000000000d1'
$$, 'the DM takes the false crust out of the marsh');
select is((select count(*)::int from public.campaign_habitat_life where species_id = '12830000-0000-4000-8000-0000000000d1'), 0,
  'and its forms leave the roll with it');

-- ── A truth about a species ──
select lives_ok($$
  update public.canon_entries set species_id = '12830000-0000-4000-8000-0000000000d1' where id = '12830000-0000-4000-8000-0000000000f1'
$$, 'a truth may belong to a species');
select throws_ok($$
  update public.canon_entries set species_id = '12830000-0000-4000-8000-0000000000d1' where id = '12830000-0000-4000-8000-0000000000f2'
$$, '23514', null, 'only a truth belongs to a species');

-- ── Who may read and write ──
select throws_ok($$
  insert into public.campaign_habitat_species (campaign_id, habitat_id, species_id) values
    ('12830000-0000-4000-8000-0000000000c1', '12830000-0000-4000-8000-0000000000a9', '12830000-0000-4000-8000-0000000000d2')
$$, '23514', null, 'a habitat of another campaign is never written into this one');
select pg_temp.as_user(2);
select is_empty($$ select id from public.campaign_species where campaign_id = '12830000-0000-4000-8000-0000000000c1' $$,
  'a player reads none of the field guide: it is the DM''s');
select pg_temp.as_user(3);
select is_empty($$ select id from public.campaign_species_links where campaign_id = '12830000-0000-4000-8000-0000000000c1' $$,
  'another campaign''s DM reads none of it either');

select * from finish();
rollback;
