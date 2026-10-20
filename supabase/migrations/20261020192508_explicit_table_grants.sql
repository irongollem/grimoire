-- A new table in public is reachable by the Data API only through an explicit
-- grant in the migration that creates it.
--
-- Supabase stops granting new public tables to anon, authenticated and
-- service_role automatically on 30 Oct 2026, for existing projects included
-- (changelog 45329). Until now every table this repo created after the squash
-- got its grants from one default-privilege line at the bottom of
-- 20260426000099_initial_schema_squashed.sql (`grant all on tables to anon,
-- authenticated, service_role`).
--
-- The danger is the gap, not the change itself. Production flips on the 30th,
-- but every `supabase db reset` (CI, local, preview branches) replays the
-- squashed file and turns the blanket default back on. A table shipped without
-- grants would then pass every test and answer "permission denied" in
-- production. Revoking the default here makes every environment behave the way
-- production will, now, so a missing grant fails in CI instead of live.
--
-- Existing tables keep the grants they already hold; default privileges only
-- apply to objects created afterwards. Sequences and functions are untouched
-- (the platform change is about tables, and an insert into a table with an
-- identity column still needs the sequence default).
--
-- Only the `postgres` defaults are ours to change. Our migrations create
-- tables as `postgres`; the `supabase_admin` set is the platform's.
--
-- The rule and the grant block to copy live in CLAUDE.md (Supabase Migration
-- Rules); supabase/tests/explicit_table_grants.test.sql holds it.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
