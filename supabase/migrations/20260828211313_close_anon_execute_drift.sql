-- Take four functions off the anonymous EXECUTE surface, and leave a warning on
-- the view that has now lost its security_invoker clause twice.
--
-- ── craft_apply: an explicit anon grant two migrations meant to remove ───────
--
-- `20260711000006` recreated craft_apply under a new signature (first argument
-- `uuid[]` → `jsonb`), which makes it a drop-and-create rather than a replace, so
-- the new function picked up Supabase's default privileges: EXECUTE to anon,
-- authenticated and service_role. That migration's `revoke all on function … from
-- public` then removed only the PUBLIC entry and left the *explicit* anon grant
-- untouched — the inverse of the trap CLAUDE.md documents for login-only RPCs,
-- where revoking from anon alone is the no-op. `20260805000003` and
-- `20260615000004` only `alter … set search_path`, which preserves the ACL, so it
-- has been anon-executable ever since.
--
-- Not exploitable: craft_apply is SECURITY INVOKER, so RLS on party_inventory still
-- applies and an anonymous caller (auth.uid() null) matches no rows on the UPDATE
-- and DELETE and fails the INSERT's WITH CHECK. It is a no-op, not a hole. It is
-- fixed anyway because it contradicts the stated intent of two migrations, and
-- because "harmless today" is a property of the current policy set rather than of
-- the grant.
--
-- ── Three trigger functions still on the RPC surface ────────────────────────
--
-- CLAUDE.md: trigger functions never need an EXECUTE grant, because the trigger
-- system bypasses the check — so they are revoked to keep them off the RPC surface.
-- Every other trigger function in `public` is revoked; these three kept the default
-- PUBLIC + anon + authenticated grant. PostgREST does not expose functions returning
-- `trigger`, so this is convention rather than exposure.
--
-- ── Why a comment on the view rather than only a test ───────────────────────
--
-- `ai_generation_costs` has now lost `security_invoker` twice, by the identical
-- route both times: `create or replace view` without the `with (...)` clause resets
-- reloptions to owner-rights. 20260607000002 did it, 20260609000002 fixed it and
-- wrote down why, and 20260826215438 did it again anyway — which is the tell that a
-- migration header is not where this warning belongs, because the next author is
-- editing the view, not reading a fix from three months ago. The durable guard is
-- supabase/tests/view_security_invoker.test.sql; this comment is so the person about
-- to reintroduce it sees the reason in `\d+` and in the Studio schema view.

revoke execute on function public.craft_apply(jsonb, text, jsonb, jsonb) from anon;

revoke execute on function public.chronicler_images_insert_redirect() from public, anon, authenticated;
revoke execute on function public.chronicler_images_delete_redirect() from public, anon, authenticated;
revoke execute on function public.clear_infusion_on_item_delete() from public, anon, authenticated;

comment on view public.ai_generation_costs is
  'Per-generation AI cost rows over ai_credit_ledger. MUST keep security_invoker = true: '
  'without it the view runs as its owner and hands every user''s billing history to any '
  'caller, anon included. `create or replace view` silently resets this — always repeat '
  'the `with (security_invoker = true)` clause. Dropped twice already (20260607000002, '
  '20260826215438); see 20260828202800 and supabase/tests/view_security_invoker.test.sql.';
