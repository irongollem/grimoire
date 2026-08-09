-- Migration: fix_is_app_admin_null_bypass
-- private.is_app_admin() returns NULL for ordinary users, which silently
-- disables every `if not is_app_admin() then raise` gate in the database.
--
-- THE BUG. The body was:
--
--   select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
--
-- A non-admin's JWT has an `app_metadata` object with no `role` key, so
-- `->> 'role'` is NULL and `NULL = 'admin'` is NULL -- not false. The function
-- therefore answers "unknown", not "no", for every ordinary user.
--
-- Used affirmatively that is harmless: `USING (private.is_app_admin())` denies
-- on NULL exactly as it denies on false, which is why every RLS policy built on
-- this helper has always behaved correctly and why the 9 Aug 2026 advisor audit
-- read clean.
--
-- Used negatively it is an authorization bypass. `not NULL` is NULL, `if NULL
-- then` does not fire, and the guard falls through to the privileged body:
--
--   if not private.is_app_admin() then
--     raise exception 'Not authorized';   -- never reached
--   end if;
--
-- Five SECURITY DEFINER functions gate on exactly that shape, so all five were
-- callable by any authenticated user:
--
--   * get_user_ledger         -- another user's full credit/billing history.
--                                Reproduced: a freshly-created non-admin read
--                                27 ledger rows belonging to another account.
--   * sync_library_item_art    \
--   * sync_library_monster_art  >- mutate canonical (admin-owned) library art
--   * sync_library_spell_art   /
--   * enforce_byok_pro_only   -- the Pro-only BYOK write gate from
--                                20260615000002, which has never once blocked
--                                anyone: a free account could set
--                                campaigns.openai_api_key directly and take the
--                                BYOK path, skipping credit deduction entirely.
--                                That is the exact escalation that migration was
--                                written to prevent.
--
-- THE FIX. Answer "no" instead of "unknown". coalesce(..., false) makes the
-- helper total, which changes nothing for affirmative callers (NULL and false
-- both deny) and closes all five negated call sites at once. Fixing the helper
-- rather than each call site is deliberate: the next `not is_app_admin()` anyone
-- writes is then correct by construction instead of being the sixth instance of
-- this bug.
--
-- Attributes below are restated exactly as they were (sql / stable / security
-- definer / search_path=public); only the body changes. `create or replace`
-- retains the existing ACL (anon + authenticated keep EXECUTE), which RLS needs
-- in order to resolve the helper at all -- see CLAUDE.md on why revoking it
-- breaks every policy that references it.
create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
