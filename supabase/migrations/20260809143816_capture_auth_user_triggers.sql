-- Migration: capture_auth_user_triggers
-- Brings two triggers that only ever existed in production under source control.
--
-- Found while verifying #636: the fix changes what create_user_profile() writes,
-- and inserting a user locally produced no profile at all. `pg_trigger` on
-- auth.users is empty in a fresh database and has two rows in production —
--
--   on_auth_user_created              -> public.create_user_profile()
--   on_auth_user_created_subscription -> public.create_free_subscription()
--
-- Both functions are created by migrations. Only the bindings were missing:
-- someone created them by hand against production and the statement never made
-- it into a file. Nothing failed, because nothing that reruns from scratch also
-- signs a user up — `supabase db reset` and CI's spell-database job replay the
-- schema but never insert into auth.users, and seed.sql supplies profiles and
-- subscriptions as *data*, which is precisely what hid this.
--
-- What it costs, left alone: a restored or rebuilt database silently stops
-- creating a profile and a free subscription on signup. Every new account lands
-- with no username and no plan, and the first symptom is somewhere else
-- entirely — a null display_name, a paywall on the free tier. Also, until now,
-- no local or CI run could exercise either function, so both were effectively
-- untested code that only ran in production.
--
-- Idempotent by drop-then-create rather than a guard: production already has
-- both, this must be a no-op there, and DDL in a migration is transactional so
-- the window where the trigger is absent cannot be observed.
--
-- `execute function` (not the `execute procedure` CLAUDE.md pins for
-- update_updated_at) mirrors the live definitions verbatim — the two spellings
-- are synonyms to Postgres, and matching production exactly is what makes this
-- provably a no-op there.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_user_profile();

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.create_free_subscription();

-- Assert both bindings, so a future environment cannot lose them the same
-- silent way. Checking the function each trigger points at, not just the name:
-- a trigger rebound to the wrong function is the failure this is guarding.
do $$
declare v_missing text;
begin
  select string_agg(expected.tgname, ', ')
    into v_missing
  from (values
    ('on_auth_user_created', 'create_user_profile'),
    ('on_auth_user_created_subscription', 'create_free_subscription')
  ) as expected(tgname, proname)
  where not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and t.tgname = expected.tgname
      and p.proname = expected.proname
  );

  if v_missing is not null then
    raise exception 'auth.users trigger missing or misbound: %', v_missing;
  end if;
end $$;
