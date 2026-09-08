-- Take TRUNCATE away from the client roles. Story #813.
--
-- `authenticated` and `anon` hold TRUNCATE on essentially every table in
-- `public` — 156 and 159 respectively, measured against production. **TRUNCATE
-- ignores row-level security entirely.** Not "RLS returns no rows and the
-- statement affects nothing" — the policy machinery is never consulted, so one
-- statement empties a table for every user of the platform at once.
--
-- Nothing wants it. There is no TRUNCATE anywhere in `src/`, in an edge
-- function, or in the body of any function in `public` or `private`; the app
-- deletes rows through DELETE, which RLS does gate.
--
-- ── How exposed is it, honestly ─────────────────────────────────────────────
--
-- PostgREST exposes no TRUNCATE verb, so this is not reachable from the REST
-- API as it stands, and there is no evidence of it ever having been used. What
-- it is, is a loaded gun in the corner of the room: the day any SECURITY
-- INVOKER function grows a dynamic-SQL path, or any other route lets a caller
-- run a statement of their choosing as `authenticated`, the blast radius is
-- every table rather than one user's rows. Defence in depth is the whole
-- argument here, and the cost is a revoke.
--
-- ── Why revoking is not the fix on its own ──────────────────────────────────
--
-- The grant is not something a migration added. The default privileges on this
-- schema hand `arwdDxtm` to anon and authenticated for every new table:
--
--   a INSERT   r SELECT   w UPDATE   d DELETE
--   D TRUNCATE  x REFERENCES  t TRIGGER  m MAINTAIN
--
-- So a revoke alone fixes today and nothing after it: the next `create table`
-- in the next migration silently re-grants TRUNCATE. Both halves are needed,
-- and the second is the one that lasts.
--
-- ── What is taken, and what is deliberately left ────────────────────────────
--
-- Taken from `anon` and `authenticated`: TRUNCATE and MAINTAIN. Both are
-- reachable with no further privilege — TRUNCATE needs only the table
-- privilege, and MAINTAIN (new in PG17, which this runs) allows VACUUM/ANALYZE/
-- REINDEX/CLUSTER/REFRESH on a table the role can otherwise only read.
--
-- Left alone: TRIGGER and REFERENCES. Both require CREATE on the schema to use,
-- and neither client role has it (`has_schema_privilege('authenticated',
-- 'public', 'CREATE')` is false), so they are inert. Removing them would touch
-- 156 tables to change nothing observable. Said out loud rather than left
-- looking like an oversight.
--
-- SELECT/INSERT/UPDATE/DELETE stay exactly as they are — those are the verbs
-- RLS actually governs, and every table's policies are what make them safe.

-- ── 1. The tables that exist now ────────────────────────────────────────────

revoke truncate, maintain on all tables in schema public from anon, authenticated;

-- ── 2. The tables that do not exist yet ─────────────────────────────────────
--
-- Only the `postgres` default is altered. There is a second set owned by
-- `supabase_admin`, which this role cannot change and which governs tables
-- created by Supabase's own machinery rather than by our migrations — those
-- create as `postgres`. If a Supabase-managed table ever appears in `public`
-- with TRUNCATE on it, that is the reason, and the structural test below will
-- say so on the next run.

alter default privileges for role postgres in schema public
  revoke truncate, maintain on tables from anon, authenticated;
