begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

-- #928: a young player inherits the parent's Pro quotas, and nothing else.
--
-- Every refusal-shaped case sits beside its positive control, so a rule that
-- stopped inheriting and a rule that inherited too much both fail here.
-- Fixture ids carry the 0928 prefix.

-- ── Fixture ──────────────────────────────────────────────────────────────────

-- Parents:  ..01 pro, ..02 free, ..03 canceled pro, ..04 app admin with no subscription row.
-- Adults:   ..05 free, ..06 pro (no child link).
-- Children of the pro parent, oldest first: ..11 to ..16 (six of them).
-- Others:   ..21 child of the free parent, ..22 child of the canceled parent,
--           ..23 former child of the pro parent, ..24 child with its own tester
--           plan and a free parent, ..25 child of the admin parent.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('09280000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       case when n >= 11 then 'pgtap-k' || n || '@players.dungeongrimoire.invalid'
            else 'pgtap-u' || n || '@example.invalid' end,
       '',
       case when n = 4 then '{"role":"admin"}'::jsonb else '{}'::jsonb end,
       '{}'::jsonb
  from unnest(array[1,2,3,4,5,6,11,12,13,14,15,16,21,22,23,24,25]) n;

-- Signup gives everyone a free subscription row; the admin parent has none.
delete from public.user_subscriptions where user_id = '09280000-0000-4000-8000-000000000004';
update public.user_subscriptions set plan_id = 'pro', status = 'active'
 where user_id in ('09280000-0000-4000-8000-000000000001', '09280000-0000-4000-8000-000000000006');
update public.user_subscriptions set plan_id = 'pro', status = 'canceled'
 where user_id = '09280000-0000-4000-8000-000000000003';
update public.user_subscriptions set plan_id = 'tester', status = 'active'
 where user_id = '09280000-0000-4000-8000-000000000024';

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version, created_at)
select ('09280000-0000-4000-8000-0000000000' || n)::uuid, '09280000-0000-4000-8000-000000000001',
       'pgtap-k' || n, current_date + 400, '2026-09-28', now() - ((20 - n::int) || ' days')::interval
  from unnest(array['11','12','13','14','15','16']) n;
insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version, created_at)
values
  ('09280000-0000-4000-8000-000000000021', '09280000-0000-4000-8000-000000000002', 'pgtap-k21', current_date + 400, '2026-09-28', now()),
  ('09280000-0000-4000-8000-000000000022', '09280000-0000-4000-8000-000000000003', 'pgtap-k22', current_date + 400, '2026-09-28', now()),
  ('09280000-0000-4000-8000-000000000023', '09280000-0000-4000-8000-000000000001', 'pgtap-k23', current_date, '2026-09-28', now() - interval '30 days'),
  ('09280000-0000-4000-8000-000000000024', '09280000-0000-4000-8000-000000000002', 'pgtap-k24', current_date + 400, '2026-09-28', now()),
  ('09280000-0000-4000-8000-000000000025', '09280000-0000-4000-8000-000000000004', 'pgtap-k25', current_date + 400, '2026-09-28', now());

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"09280000-0000-4000-8000-0000000000' || p_id || '","role":"authenticated"}', true);
$$;

create function pg_temp.npcs_limit(p_id text) returns integer language plpgsql as $$
begin
  perform pg_temp.as_user(p_id);
  return (public.check_quota('npcs') ->> 'limit')::integer;
end $$;

-- How many of the fifteen resources are unlimited for this user.
create function pg_temp.unlimited_count(p_id text) returns integer language plpgsql as $$
begin
  perform pg_temp.as_user(p_id);
  return (select count(*)::int from jsonb_each(public.check_all_quotas()) e
           where (e.value ->> 'unlimited')::boolean);
end $$;

grant execute on function pg_temp.as_user(text), pg_temp.npcs_limit(text), pg_temp.unlimited_count(text) to authenticated;
set local role authenticated;

-- ── Inheriting ───────────────────────────────────────────────────────────────

select is(pg_temp.npcs_limit('11'), -1, 'a child of a Pro parent is unlimited for npcs');
select ok((public.check_quota('campaigns') ->> 'unlimited')::boolean, 'and for campaigns');
select is(pg_temp.unlimited_count('11'), 15, 'and for every key in check_all_quotas');

-- Positive controls: the same calls for users the rule must not lift.
select is(pg_temp.npcs_limit('21'), 10, 'a child of a free parent keeps the free npcs limit');
select is((public.check_quota('campaigns') ->> 'limit')::integer, 1, 'and the free campaigns limit');
select is(pg_temp.unlimited_count('21'), 0, 'and has no unlimited key in check_all_quotas');

select is(pg_temp.npcs_limit('22'), 10, 'a child of a parent whose subscription is canceled drops to free limits');
select is(pg_temp.unlimited_count('22'), 0, 'in check_all_quotas too');

-- ── The cap of five ──────────────────────────────────────────────────────────

select is(pg_temp.npcs_limit('15'), -1, 'the fifth active child still inherits');
select is(pg_temp.npcs_limit('16'), 10, 'the sixth active child, by created_at, stays on free limits');
select is(pg_temp.unlimited_count('16'), 0, 'in check_all_quotas too');

reset role;
-- The oldest of the five turns adult: the sixth moves into the five.
update public.child_accounts set adult_on = current_date
 where child_user_id = '09280000-0000-4000-8000-000000000011';
set local role authenticated;

select is(pg_temp.npcs_limit('16'), -1, 'when one of the first five ages out, the sixth moves into the five');
select is(pg_temp.npcs_limit('11'), 10, 'and the one who aged out gets nothing from the parent');

-- ── Former child, own plan, unchanged adults ─────────────────────────────────

select is(pg_temp.npcs_limit('23'), 10, 'a former child (adult_on in the past) gets nothing from the parent');
select is(pg_temp.npcs_limit('24'), -1, 'a child with its own tester plan and a free parent stays unlimited');
select is(pg_temp.npcs_limit('05'), 10, 'an adult with no child link keeps free limits');
select is(pg_temp.npcs_limit('06'), -1, 'and a Pro adult stays unlimited');

-- ── The parent is an app admin with no subscription row ──────────────────────

select is(pg_temp.npcs_limit('25'), -1, 'a child whose parent is an app admin inherits, since the admin ranks as Pro');

-- ── Only the limits are inherited ────────────────────────────────────────────

reset role;
select ok(not public.is_user_pro('09280000-0000-4000-8000-000000000012'), 'is_user_pro stays false for an inheriting child, so AI stays off');
select ok(public.is_user_pro('09280000-0000-4000-8000-000000000001'), 'positive control: it is true for the Pro parent');

set local role authenticated;

-- ── The helper is internal ───────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'private.effective_quotas(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.effective_quotas(uuid)', 'execute'),
  'private.effective_quotas is executable by neither authenticated nor anon'
);

select is(
  (select count(*)::int from pg_proc where oid = 'private.effective_quotas(uuid)'::regprocedure and prosecdef),
  1,
  'positive control: it exists and is a definer, so the callers run it as the owner'
);

reset role;
select * from finish();
rollback;
