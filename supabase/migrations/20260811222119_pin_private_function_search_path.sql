-- Clears the four `function_search_path_mutable` advisor findings, which had
-- accumulated in `private` since the 9 Aug 2026 audit and are not part of the
-- sanctioned baseline in CLAUDE.md.
--
-- All four are SECURITY INVOKER, which is why they never showed up in the
-- SECURITY DEFINER review: they run with the caller's privileges, so a shadowed
-- name cannot escalate. The reason to pin them anyway is the *other* caller.
-- `private.purge_expired_retention()` is invoked by pg_cron as `postgres`, and
-- `private.retention_purge_in_progress()` is read from inside the append-only
-- guards on `ai_credit_ledger` and `admin_audit_log` — the two functions that
-- decide whether a DELETE against seven-year evidence is sanctioned. A resolution
-- that depends on the caller's `search_path` is the wrong property for either.
--
-- ALTER FUNCTION ... SET rather than `create or replace`: the bodies are correct
-- and unchanged, and re-declaring `purge_expired_retention` would mean copying
-- ~120 lines out of 20260811152817 for a one-line property, with every retention
-- period in it now maintained in two places.
--
-- `search_path = ''` rather than `= public`: every reference in all four bodies
-- is already schema-qualified (`public.*`, `private.retention_horizon`), and the
-- empty path means a future unqualified reference fails loudly at the first call
-- instead of resolving to whatever the caller happened to have set. The purge is
-- exercised end-to-end by retention_periods.test.sql, so that failure surfaces in
-- CI rather than at 04:20 UTC.
alter function private.purge_expired_retention()        set search_path = '';
alter function private.retention_horizon(integer)       set search_path = '';
alter function private.retention_purge_in_progress()    set search_path = '';
alter function private.is_credential_column(text)       set search_path = '';
