begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- Views must not bypass RLS.
--
-- A view created without `security_invoker` executes as its owner (`postgres`),
-- and RLS is evaluated against the executing role — so such a view hands back
-- every row of an RLS-protected table to whoever can select from it.
--
-- `public.ai_generation_costs` did exactly that over `ai_credit_ledger`. Measured
-- on production: one ordinary user reading the table saw their own 94 rows, while
-- the same user reading the view saw rows belonging to 3 distinct users — as did
-- `anon`, unauthenticated. Fixed in 20260828202800.
--
-- The structural assertion below is deliberately over *every* view rather than
-- over that one: "no view bypasses RLS" is a property a query can check, whereas
-- "no important view does" is a judgement re-made per review, and that is the kind
-- of rule that decays. This is the same reasoning as function_search_path.test.sql,
-- and it exists because this whole category was absent from the documented
-- advisor baseline until it was measured.

-- ── Structural: no SECURITY DEFINER views ───────────────────────────────────
select is(
  (select coalesce(string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by n.nspname, c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind = 'v'
      and coalesce(
            (select option_value from pg_options_to_table(c.reloptions)
              where option_name = 'security_invoker'),
            'false') <> 'true'),
  '',
  'every view in public/private runs with security_invoker (does not bypass RLS)');

-- ── Behavioural: the view now honours the ledger's own policies ─────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('77720000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'costs-alice@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77720000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'costs-bob@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77720000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'costs-admin@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

insert into public.ai_credit_ledger (user_id, delta, reason, model, provider, output_tokens, pending) values
  ('77720000-0000-4000-8000-000000000001', -5, 'generate_npc', 'gpt-image-2', 'openai', 100, false),
  ('77720000-0000-4000-8000-000000000002', -7, 'generate_npc', 'gpt-image-2', 'openai', 200, false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Alice sees her own spend and nobody else's.
select set_config('request.jwt.claims',
  '{"sub":"77720000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '77720000-0000-4000-8000-000000000001', true);
select is(
  (select count(distinct user_id) from public.ai_generation_costs
    where user_id in ('77720000-0000-4000-8000-000000000001','77720000-0000-4000-8000-000000000002')),
  1::bigint,
  'a plain user sees exactly one user''s costs through the view — their own');
select is(
  (select count(*) from public.ai_generation_costs
    where user_id = '77720000-0000-4000-8000-000000000002'),
  0::bigint,
  'a plain user cannot see another user''s costs through the view');

-- An admin still gets the platform-wide view the Admin → Credits tab needs.
select set_config('request.jwt.claims',
  '{"sub":"77720000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select set_config('request.jwt.claim.sub', '77720000-0000-4000-8000-000000000003', true);
select is(
  (select count(distinct user_id) from public.ai_generation_costs
    where user_id in ('77720000-0000-4000-8000-000000000001','77720000-0000-4000-8000-000000000002')),
  2::bigint,
  'an app admin still sees every user''s costs (Admin → Credits reporting)');

-- Anonymous callers get nothing at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select count(*) from public.ai_generation_costs $$,
  '42501', null,
  'anon cannot read the cost view at all');

reset role;
select * from finish();
rollback;
