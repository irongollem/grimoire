-- Migration: pin_search_path_on_remaining_functions
-- Pins search_path on the last unpinned functions, and restores two that had
-- vanished from production.

-- ── Why this migration exists ────────────────────────────────────────────────
--
-- `get_advisors({ type: "security" })` returned 92 findings against a baseline
-- CLAUDE.md documented as 87. Two were `function_search_path_mutable` — a
-- category that had never appeared in that baseline — on
-- `items_touch_content_updated_at` and `guard_item_entry_anchors`, both from
-- 20260819231506. Every other trigger function in the codebase already pins it.
--
-- Neither is exploitable: both are SECURITY INVOKER, so a caller who repoints
-- `search_path` attacks only themselves, which is why the advisor rates them
-- WARN. Pinning them is defence in depth, and it makes "no function has a
-- mutable search_path" true of the whole schema — a property a test can hold,
-- where "no *important* function has one" is a judgement call that decays.
--
-- ── The part that was not a lint fix ─────────────────────────────────────────
--
-- The first version of this migration used `alter function` for all four. It
-- failed in production:
--
--     ERROR: function private.is_third_party_column(text) does not exist
--
-- Both `private.is_third_party_column` and `private.is_withheld_column` were
-- absent from production, even though 20260811130935 creates them and is
-- recorded as applied in `schema_migrations`. A full local replay has them, so
-- nothing in migration history removed them; how they disappeared from
-- production is not recoverable from here and is deliberately not guessed at.
-- A function-by-function diff of the `private` schema confirmed the drift was
-- exactly these two — every other function matched.
--
-- **This was breaking GDPR Art. 20 export in production.**
-- `public.export_user_data(uuid)` is SECURITY DEFINER and calls
-- `private.is_withheld_column(a.attname)` in the first statement of its
-- per-table loop. That loop iterates every table with a single-column FK into
-- `auth.users`, plus `rate_limit_events` and `admin_audit_log` — a non-empty set
-- regardless of which user is passed. So every export attempt raised
-- `function private.is_withheld_column(text) does not exist`, for every user,
-- for as long as the functions were missing.
--
-- Restored below with `create or replace`, which is why this migration now
-- carries their definitions rather than an `alter`: on an environment that has
-- them this is a no-op that adds the setting, and on one that has lost them it
-- puts them back. Bodies are copied verbatim from 20260811130935 — if the rule
-- ever changes, change it there and here together.
--
-- Note what could not have caught this. Tests run against a fresh replay, which
-- always has the functions; `spell-database` replays from scratch and passed.
-- The advisor cannot see it either, because it only inspects `public`. Only
-- comparing the live schema against a replay finds this class of drift.

-- ── Restored, with search_path pinned ────────────────────────────────────────

-- Identifiers that belong to someone other than the subject. Art. 15(4): the
-- right to a copy "shall not adversely affect the rights and freedoms of
-- others". `admin_audit_log.admin_user_id` is the operator who acted — in a
-- single-operator app, exporting it to every requester hands out the founder's
-- own account id. The action, its target, its details and its timestamp are all
-- the subject's data and are exported in full; only who pressed the button is
-- withheld.
create or replace function private.is_third_party_column(p_column text)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select p_column = 'admin_user_id';
$$;

comment on function private.is_third_party_column(text) is
  'True for column names holding another person''s identifier. Withheld from GDPR exports — see 20260811130935.';

-- The one predicate the projection actually asks. Kept separate from its two
-- halves so each keeps its own reason, and so the credential rule stays
-- independently testable.
create or replace function private.is_withheld_column(p_column text)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select private.is_credential_column(p_column) or private.is_third_party_column(p_column);
$$;

comment on function private.is_withheld_column(text) is
  'True for column names redacted from a GDPR export: a bearer credential, or another person''s identifier.';

-- ── Pinned in place ──────────────────────────────────────────────────────────

-- These two do exist in production; ALTER keeps their bodies untouched, so
-- there is no chance of copying one forward with an unintended difference.
alter function public.items_touch_content_updated_at() set search_path = public;
alter function public.guard_item_entry_anchors() set search_path = public;
