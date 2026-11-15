-- #1182: storage accounting and the quiet per-account ceiling.
--
-- Free is held to 250 MB and a paid plan to 10 GB (maintainer, 12 Nov 2026). Each refusal sits beside a
-- positive control, so a function that refused everything, or nothing, cannot pass. Fixture ids carry the
-- 1182 prefix.
--
--   ..01 free   ..02 pro   ..03 pro parent   ..04 free parent
--   ..11 child of the pro parent   ..12 child of the free parent   ..09 no such account

begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11820000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'pgtap-1182-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
  from unnest(array[1, 2, 3, 4, 11, 12]) n;

update public.user_subscriptions set plan_id = 'pro', status = 'active'
 where user_id in ('11820000-0000-4000-8000-000000000002', '11820000-0000-4000-8000-000000000003');

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version, created_at)
values
  ('11820000-0000-4000-8000-000000000011', '11820000-0000-4000-8000-000000000003', 'pgtap-1182-k11', current_date + 400, '2026-09-28', now()),
  ('11820000-0000-4000-8000-000000000012', '11820000-0000-4000-8000-000000000004', 'pgtap-1182-k12', current_date + 400, '2026-09-28', now());

-- One file of p_size bytes at <account>/<name> in npc-portraits.
create function pg_temp.reserve(p_id text, p_name text, p_size bigint, p_enforce boolean default true)
returns jsonb language sql as $$
  select public.reserve_storage(
    ('11820000-0000-4000-8000-0000000000' || p_id)::uuid,
    'npc-portraits',
    jsonb_build_array(jsonb_build_object(
      'path', '11820000-0000-4000-8000-0000000000' || p_id || '/' || p_name, 'size', p_size)),
    p_enforce);
$$;

create function pg_temp.used(p_id text) returns bigint language sql as $$
  select bytes from public.storage_usage where user_id = ('11820000-0000-4000-8000-0000000000' || p_id)::uuid;
$$;

-- 250 MB = 262144000 bytes.

-- ── A free account, up to the ceiling and not past it ────────────────────────
select is(pg_temp.reserve('01', 'a.webp', 262143000) ->> 'allowed', 'true',
  'a free account under 250 MB may store a file');
select is(pg_temp.used('01'), 262143000::bigint, 'the total is the file''s size');

select is(pg_temp.reserve('01', 'b.webp', 1000) ->> 'allowed', 'true',
  'a file that lands exactly on 250 MB is allowed');
select is(pg_temp.reserve('01', 'c.webp', 1) ->> 'allowed', 'false',
  'one byte past 250 MB is refused');
select is(pg_temp.used('01'), 262144000::bigint, 'a refused file is not counted');
select is(
  (select count(*)::int from public.stored_objects
    where path = '11820000-0000-4000-8000-000000000001/c.webp'),
  0, 'a refused file leaves no row');

-- All-or-nothing: an original that fits with a variant that does not records neither.
delete from public.stored_objects where path = '11820000-0000-4000-8000-000000000001/b.webp';
select is(
  public.reserve_storage('11820000-0000-4000-8000-000000000001', 'npc-portraits',
    '[{"path": "11820000-0000-4000-8000-000000000001/d.webp", "size": 600},
      {"path": "11820000-0000-4000-8000-000000000001/d_w400.webp", "size": 600}]'::jsonb, true) ->> 'allowed',
  'false', 'a set that only fits in part is refused whole');
select is(pg_temp.used('01'), 262143000::bigint, 'and none of that set is counted');

-- ── Writing over a key ───────────────────────────────────────────────────────
select is(pg_temp.reserve('01', 'a.webp', 262144000) ->> 'allowed', 'true',
  'writing over a file counts the difference, not the sum');
select is(pg_temp.used('01'), 262144000::bigint, 'the total holds the new size once');

-- Over the ceiling (a downgrade, or the backfill finding the account there): shrinking still works.
select is(pg_temp.reserve('01', 'e.webp', 5000, false) ->> 'allowed', 'true',
  'a write nothing should refuse is recorded past the ceiling');
select is(pg_temp.used('01'), 262149000::bigint, 'and it is counted');
select is(pg_temp.reserve('01', 'e.webp', 5000) ->> 'allowed', 'true',
  'an account over its ceiling may write over a file with the same bytes');
select is(pg_temp.reserve('01', 'e.webp', 5001) ->> 'allowed', 'false',
  'but may not grow one');

-- ── Paid plans, and the young players who inherit them ───────────────────────
select is(pg_temp.reserve('02', 'a.webp', 262144001) ->> 'allowed', 'true',
  'a Pro account may pass 250 MB');
select is(pg_temp.reserve('02', 'b.webp', 10737418240) ->> 'allowed', 'false',
  'a Pro account is refused past 10 GB');
select is(pg_temp.reserve('11', 'a.webp', 262144001) ->> 'allowed', 'true',
  'a young player of a Pro parent inherits the Pro ceiling');
select is(pg_temp.reserve('12', 'a.webp', 262144001) ->> 'allowed', 'false',
  'a young player of a free parent keeps the free ceiling');

-- ── Deleting gives the room back, to that account only ───────────────────────
-- A signed URL works for fifteen minutes. These files were signed longer ago than that.
create function pg_temp.age(p_id text, p_name text) returns void language sql as $$
  update public.stored_objects set signed_at = now() - interval '17 minutes'
   where path = '11820000-0000-4000-8000-0000000000' || p_id || '/' || p_name;
$$;

select pg_temp.age('01', 'e.webp');
select public.release_storage('npc-portraits', array[
  '11820000-0000-4000-8000-000000000001/e.webp', '11820000-0000-4000-8000-000000000001/never-recorded.webp']);
select is(pg_temp.used('01'), 262144000::bigint,
  'releasing a file subtracts it, and a path that was never recorded is no error');
select is(pg_temp.used('02'), 262144001::bigint, 'another account''s total is untouched');

-- ── A signature that can still be used keeps its bytes on the books ──────────
-- Sign large, delete, then send the large body to the first URL: the total must not have forgotten it.
select pg_temp.reserve('01', 'f.webp', 100, false);
select public.release_storage('npc-portraits', array['11820000-0000-4000-8000-000000000001/f.webp']);
select is(pg_temp.used('01'), 262144100::bigint,
  'a file deleted while its upload URL still works keeps counting');

-- Once the URL has expired, the account's next upload stops counting it.
select pg_temp.age('01', 'f.webp');
select pg_temp.reserve('01', 'g.webp', 1, false);
select is(pg_temp.used('01'), 262144001::bigint,
  'and stops counting once that URL has expired');
select is(
  (select count(*)::int from public.stored_objects where path = '11820000-0000-4000-8000-000000000001/f.webp'),
  0, 'its row is gone by then');

-- Sign large, sign the same key small, then send the large body to the first URL.
select pg_temp.reserve('02', 'a.webp', 1);
select is(pg_temp.used('02'), 262144001::bigint,
  'signing a key again, smaller, does not shrink it while the first URL still works');
select pg_temp.age('02', 'a.webp');
select pg_temp.reserve('02', 'a.webp', 1);
select is(pg_temp.used('02'), 1::bigint, 'and does once that URL has expired');

-- ── A file is recorded for the account whose folder it is in ─────────────────
select throws_ok(
  $$ select public.reserve_storage('11820000-0000-4000-8000-000000000001', 'npc-portraits',
       '[{"path": "11820000-0000-4000-8000-000000000002/a.webp", "size": 1}]'::jsonb, false) $$,
  '22023', null, 'a path in another account''s folder cannot be recorded for this one');

-- ── An account that does not exist ───────────────────────────────────────────
select is(pg_temp.reserve('09', 'a.webp', 10) ->> 'skipped', 'true',
  'a folder whose account is gone is skipped, not an error');

-- ── Deleting the account takes its rows with it ──────────────────────────────
select lives_ok(
  $$ delete from auth.users where id = '11820000-0000-4000-8000-000000000002' $$,
  'an account with stored files can be deleted');
select is(
  (select count(*)::int from public.stored_objects where user_id = '11820000-0000-4000-8000-000000000002'),
  0, 'and its rows go with it');
select is(
  (select count(*)::int from public.storage_usage where user_id = '11820000-0000-4000-8000-000000000002'),
  0, 'and so does its total');

-- ── No client role reaches any of it ─────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11820000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.reserve_storage('11820000-0000-4000-8000-000000000001', 'npc-portraits',
       '[{"path": "11820000-0000-4000-8000-000000000001/x.webp", "size": 1}]'::jsonb, false) $$,
  '42501', null, 'a signed-in user cannot record storage, their own included');
select throws_ok(
  $$ select public.release_storage('npc-portraits', array['11820000-0000-4000-8000-000000000001/a.webp']) $$,
  '42501', null, 'a signed-in user cannot release storage');
select throws_ok(
  $$ select bytes from public.storage_usage $$,
  '42501', null, 'a signed-in user cannot read the totals');

-- Positive control for the three refusals above: the service role can.
set local role service_role;
select is(
  (select bytes from public.storage_usage where user_id = '11820000-0000-4000-8000-000000000001'),
  262144001::bigint, 'the service role reads the total');

select * from finish();
rollback;
