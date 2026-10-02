-- The official class features (class_features rows with user_id null) are read
-- by every character sheet in the app. Until 20261002110236 any signed-in user
-- could rewrite them, and could turn a row of their own into an "official" one
-- by nulling its user_id.
--
--   1 Pia   an ordinary user          2 Ada   an app admin

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('94500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'official-features-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('94500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'official-features-2@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

insert into public.class_features (id, user_id, name, description) values
  ('94500000-0000-4000-8000-0000000000f1', null, 'Official Test Feature', 'official text'),
  ('94500000-0000-4000-8000-0000000000f2', '94500000-0000-4000-8000-000000000001', 'Pia''s Feature', 'hers');

-- Definer, so a check reads the row whoever is signed in.
create function pg_temp.feature(p_suffix text) returns public.class_features language sql security definer as $$
  select * from public.class_features where id = ('94500000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"94500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is_empty($$
  update public.class_features set name = 'Rewritten by a stranger'
   where id = '94500000-0000-4000-8000-0000000000f1' returning id
$$, 'an ordinary user cannot rewrite an official feature');
select is((pg_temp.feature('f1')).name, 'Official Test Feature', 'and it is unchanged');

select throws_ok($$
  update public.class_features set user_id = null where id = '94500000-0000-4000-8000-0000000000f2'
$$, '42501', 'new row violates row-level security policy for table "class_features"',
  'a user cannot turn their own feature into an official one');
select is((pg_temp.feature('f2')).user_id, '94500000-0000-4000-8000-000000000001'::uuid, 'it is still theirs');

select isnt_empty($$
  update public.class_features set name = 'Pia''s Feature, renamed'
   where id = '94500000-0000-4000-8000-0000000000f2' returning id
$$, 'control: a user still edits their own feature');
select isnt_empty($$ select id from public.class_features where id = '94500000-0000-4000-8000-0000000000f1' $$,
  'control: everyone can still read the official features');

select set_config('request.jwt.claims',
  '{"sub":"94500000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}', true);

select isnt_empty($$
  update public.class_features set name = 'Official Test Feature, corrected'
   where id = '94500000-0000-4000-8000-0000000000f1' returning id
$$, 'control: an app admin edits an official feature');

reset role;

-- Body-based: the policy must not grant the user_id-is-null arm to a caller
-- merely for being signed in, whatever else it says.
select is_empty($q$
  select polname::text
    from pg_policy
   where polrelid = 'public.class_features'::regclass
     and polcmd in ('w', 'a', 'd')
     and (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), ''))
         ~* 'user_id IS NULL'
     and (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), ''))
         !~* 'is_app_admin'
$q$, 'no write policy on class_features opens the official rows without the admin check');

select * from finish();
rollback;
