-- Migration: rls_initplan_optimization
-- Performance advisor lint 0003_auth_rls_initplan: 256 RLS policies call
-- auth.uid()/auth.role()/auth.jwt() directly in their USING / WITH CHECK
-- expressions. Postgres re-evaluates those calls once PER ROW, which dominates
-- query cost on large tables. Wrapping each call in a scalar subquery —
-- (select auth.uid()) — lets the planner hoist it into an InitPlan and evaluate
-- it exactly once per query. The rewrite is semantically identical; it only
-- changes evaluation count.
--
-- Implemented as a catalog-driven loop so it stays correct regardless of how the
-- policies were originally written:
--   * Only policies whose expression contains a BARE auth.* call are touched.
--   * Policies already wrapped (case-insensitive `select auth.`) are skipped, so
--     re-running this migration is a no-op and never double-wraps.
--   * ALTER POLICY edits the expression in place — no drop/recreate, so role and
--     command grants are untouched.

do $$
declare
  r       record;
  new_q   text;
  new_w   text;
  clause  text;
begin
  for r in
    select n.nspname as sch, c.relname as tbl, p.polname as pol,
           pg_get_expr(p.polqual, p.polrelid)      as q,
           pg_get_expr(p.polwithcheck, p.polrelid) as w
    from pg_policy p
    join pg_class c     on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    clause := '';

    if r.q is not null
       and r.q ~  'auth\.(uid|role|jwt)\(\)'
       and r.q !~* 'select\s+auth\.' then
      new_q := regexp_replace(r.q, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
      clause := clause || ' using (' || new_q || ')';
    end if;

    if r.w is not null
       and r.w ~  'auth\.(uid|role|jwt)\(\)'
       and r.w !~* 'select\s+auth\.' then
      new_w := regexp_replace(r.w, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
      clause := clause || ' with check (' || new_w || ')';
    end if;

    if clause <> '' then
      execute format('alter policy %I on %I.%I', r.pol, r.sch, r.tbl) || clause;
    end if;
  end loop;
end $$;
