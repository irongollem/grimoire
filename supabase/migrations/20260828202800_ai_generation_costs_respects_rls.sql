-- `public.ai_generation_costs` leaked every user's AI spend to every caller,
-- including anonymous ones.
--
-- WHAT WAS WRONG
--
-- The view selects from `ai_credit_ledger`, which is RLS-protected and correctly
-- so — it carries exactly the two policies this app needs:
--
--     ai_credit_ledger_select        using ((select auth.uid()) = user_id)
--     ai_credit_ledger_admin_select  using (private.is_app_admin())
--
-- But a view created without `security_invoker` runs as its *owner* (`postgres`),
-- and RLS is evaluated against the executing role. So every row of the ledger came
-- back regardless of who asked, and `select` on the view was granted to `anon` and
-- `authenticated` alike by the default grants.
--
-- Measured on production before this migration: the ledger holds 4 distinct users;
-- one ordinary user reading `ai_credit_ledger` directly saw only their own 94 rows
-- (RLS working), while the same user reading `ai_generation_costs` saw rows for 3
-- distinct users — and so did `anon`, with no login at all. Exposed per row:
-- user_id, spend, model, provider, token counts, image counts and timestamps.
--
-- This is the same class as the `get_user_ledger` bug fixed in 20260809144926 —
-- a privileged read path that never re-derives the caller's identity. It differs
-- in being reachable without authenticating, and in being a view, which is why
-- neither the `is_app_admin()` audit nor the function-body assertions in
-- `admin_authorization_guards.test.sql` could see it.
--
-- THE FIX, AND WHY IT NEEDS NOTHING ELSE
--
-- `security_invoker = true` makes the view evaluate RLS as the querying user, at
-- which point the two policies already on the table produce exactly the three
-- behaviours the product wants, with no application change:
--
--   * a DM opening Campaign Settings → AI (`AiTab.vue` → `AiUsageStatsPanel`)
--     sees their own usage, via ai_credit_ledger_select;
--   * an admin opening Admin → Credits / Providers sees everyone, via
--     ai_credit_ledger_admin_select;
--   * `anon` sees nothing — both predicates are false, and `is_app_admin()` is
--     coalesced to false rather than NULL (20260809144926), so the negative case
--     is total.
--
-- The grants are narrowed too. Nothing anonymous has any business reading cost
-- data, and the write grants were never meaningful — the view has a LEFT JOIN and
-- so is not auto-updatable — they are just the default `grant all` that Supabase
-- applies to new objects in `public`.

alter view public.ai_generation_costs set (security_invoker = true);

revoke all on public.ai_generation_costs from anon;
revoke all on public.ai_generation_costs from authenticated;
grant select on public.ai_generation_costs to authenticated;
