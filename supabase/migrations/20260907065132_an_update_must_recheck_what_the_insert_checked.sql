-- An UPDATE must re-check what the INSERT checked.
--
-- Three policies here let a row be *moved into* a campaign the caller has no
-- claim on, because their `with check` was weaker than the `with check` on the
-- same table's INSERT. The INSERT asks "are you the DM of this campaign?"; the
-- UPDATE did not, so the answer was: insert into your own campaign, then repoint
-- `campaign_id` at someone else's.
--
-- Postgres makes one of these easy to write by accident: **an UPDATE policy with
-- no `with check` falls back to its `using` clause**. `using (auth.uid() =
-- user_id)` then reads as a complete rule while constraining only ownership —
-- and ownership does not move when `campaign_id` does. Two of the three below
-- are that exact shape.
--
-- Found by an audit of the epic's migrations, 7 Sep 2026. None is new: all three
-- have been live since August. `document_imports` matters most — see below.

-- ── 1. document_imports ────────────────────────────────────────────────────
--
-- The worst of the three, because a `document_imports` row is an instruction to
-- a service-role edge function. `import-extract` reads the named campaign to
-- pick up its BYOK keys (`openai_api_key`, `anthropic_api_key`,
-- `gemini_api_key`), so a repointed row aims someone else's credentials — and
-- someone else's credit balance — at an import the attacker controls.
--
-- Today that is stopped one layer late, by a hand-written DM check in
-- `supabase/functions/import-extract/index.ts`. That check is correct and stays,
-- but it is the *only* thing standing there, and a TypeScript `if` is not where
-- this boundary belongs.
--
-- The gap dates from `20260824214506`, which added the `source_paths` clause and
-- restated the policy without the DM gate. `20260906234614` (the paste fix,
-- earlier in this epic) restated it again and carried the omission forward.

alter policy document_imports_update on public.document_imports
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and private.is_campaign_dm(campaign_id)
    and ( private.paths_under_caller_prefix(source_paths)
          or (source_kind = 'text' and cardinality(source_paths) = 0) )
  );

-- ── 2 & 3. npc_sets and class_feature_options ──────────────────────────────
--
-- Both had no `with check` at all. `campaign_id` is nullable on each (a set can
-- be personal and unscoped), so the check mirrors the INSERT exactly rather than
-- demanding a campaign: null stays allowed, a named campaign must be yours.

alter policy npc_sets_update on public.npc_sets
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

alter policy class_feature_options_update on public.class_feature_options
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── 4. Five half-finished revokes ──────────────────────────────────────────
--
-- Separate defect, same audit. Each of these tables had a write privilege
-- deliberately revoked from `authenticated` to force that write through a
-- SECURITY DEFINER RPC — and each revoke named `authenticated` only, leaving the
-- privilege sitting on `anon` via the `PUBLIC` default.
--
-- Inert today: RLS is on, every policy resolves `auth.uid()`, and anon has none.
-- It is worth closing anyway because the grant outlives the reasoning — the next
-- policy added to one of these tables is one `or` away from making it reachable,
-- and nothing would flag that.
--
-- Note this repo grants anon writes on 152 of 160 public tables; that is the
-- Supabase default and is NOT what is being corrected here. These five are the
-- ones where a revoke was already judged necessary and only half-applied.
-- `20260810000002` shows the idiom the other four should have used:
-- `revoke ... from authenticated, anon`.
--
-- `public` as well as `anon`, because the privilege arrives through the PUBLIC
-- grant and revoking from `anon` alone is a no-op. `service_role` holds explicit
-- grants on all five and is unaffected; the RPCs are owned by `postgres` and
-- bypass grants entirely.

revoke insert, update, delete on public.quest_consequence_events from public, anon;
revoke insert, update, delete on public.quest_runtime_state       from public, anon;
revoke update                 on public.quest_objectives          from public, anon;
revoke insert                 on public.quest_beat_transitions    from public, anon;
revoke delete                 on public.character_spells          from public, anon;
