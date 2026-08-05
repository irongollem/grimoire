-- Migration: pin_craft_apply_search_path
-- Resolves the lone `function_search_path_mutable` security-advisor finding.

-- `craft_apply` is the only function in `public` left with a role-mutable
-- search_path. It is SECURITY INVOKER, so this is not the privilege-escalation
-- case that makes the advisor's DEFINER hits urgent -- but every other
-- function in this schema pins its search_path at creation (see
-- 20260803000002, which did the same sweep for the retrieval RPCs), and a
-- single unpinned function is exactly the kind of exception that reads as
-- deliberate to the next person and survives forever.
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: the body is untouched, so
-- restating it here would only create a second copy of it to drift.
alter function public.craft_apply(
  p_ingredients jsonb,
  p_outcome text,
  p_success_rows jsonb,
  p_ruined_row jsonb
) set search_path = public;
