-- Migration: add_with_check_owner_update_policies
-- Systemic gap: ~50 owner-scoped UPDATE policies have a USING clause but no
-- WITH CHECK. Postgres applies USING only to the pre-image, so without WITH CHECK
-- a user can update a row they own and change user_id to another user's UUID
-- (ownership transfer / grief). Mirror each policy's USING expression into its
-- WITH CHECK so the post-image must also satisfy the ownership predicate.
--
-- Done dynamically (ALTER POLICY preserves USING and just sets the missing
-- WITH CHECK) so the set stays correct as policies evolve. Excludes policies
-- whose privileged-column writes are governed elsewhere:
--   - campaign_members_update_own  → guarded by campaign_members_guard_self_update trigger
--   - srd_*_art_update             → canonical guard added in secure_srd_art_canonical
-- (those already carry a WITH CHECK or a trigger by the time this runs).

do $$
declare
  pol record;
  n   integer := 0;
begin
  for pol in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and cmd = 'UPDATE'
      and with_check is null
      and qual ilike '%user_id%'
      and policyname <> 'campaign_members_update_own'
  loop
    execute format(
      'alter policy %I on public.%I with check (%s)',
      pol.policyname, pol.tablename, pol.qual
    );
    n := n + 1;
  end loop;
  raise notice 'Added WITH CHECK to % owner UPDATE policies', n;
end $$;
