/**
 * Differential proof that a policy-merging migration changes nobody's access (#999 3.3).
 *
 * For every table that has more than one PERMISSIVE policy for a command, and for every
 * account in the local `auth.users` plus anon, it records what the caller can see (the
 * real SELECT policies, run as that role with that JWT) and, for each write command, the
 * set of existing rows on which the combined policy expression is true (its USING for
 * UPDATE/DELETE, its effective WITH CHECK for INSERT/UPDATE: the policy's own `with check`,
 * else its `using`). A temporary `using (true)` SELECT policy is present while the write
 * expressions are evaluated, so they are tried on every row instead of only the rows the
 * caller can already read.
 *
 * Then, in the SAME transaction, it applies the policy-merging migrations in order, records everything again,
 * compares, and rolls back. Nothing is ever committed: the local database is left as found.
 *
 * Expected output: `differences: 0`. An error that only appears after the migration (such
 * as Postgres's policy-recursion error) is recorded as a value and so shows up as a difference.
 * Every check that errored is listed at the end. Today that is anon on two tables whose policies
 * call a login-only helper (`permission denied for function`): a denial, the same before and after.
 *
 * Local stack only: `readLocalStack` refuses anything that is not loopback.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/db/rls-differential.ts [migration.sql ...]
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readLocalStack } from "../lib/dev-stack";

const MIGRATIONS = resolve(import.meta.dirname, "../../supabase/migrations");

/** Both policy-merging migrations, in version order. */
function defaultMigrations(): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith("_merge_permissive_policies.sql") || f.endsWith("_split_for_all_policies.sql"))
    .sort();
  if (files.length === 0) throw new Error("No policy-merging migrations found.");
  return files.map((f) => join(MIGRATIONS, f));
}

/** Records one (phase, account, table, kind) value; the value is a row count and a hash of the row ids. */
const SNAP_FN = String.raw`
create function pg_temp.snap(p_phase text) returns void language plpgsql as $f$
declare
  u record; t text; kind text; expr text; val text;
  claims text; r text;
begin
  for u in select id, raw_app_meta_data from auth.users union all select null::uuid, null::jsonb order by 1 loop
    r := case when u.id is null then 'anon' else 'authenticated' end;
    claims := case when u.id is null then '{"role":"anon"}'
      else json_build_object('sub', u.id, 'role', 'authenticated', 'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb))::text end;
    for t in select tbl from pg_temp.merged_tables order by tbl loop
      for kind in select unnest(array['select','update_using','update_check','delete_using','insert_check']) loop
        -- the combined expression of every permissive policy for this command, as it stands now
        select string_agg('(' || case kind
                 when 'select' then null
                 when 'update_using' then coalesce(p.qual, 'false')
                 when 'delete_using' then coalesce(p.qual, 'false')
                 when 'update_check' then coalesce(p.with_check, p.qual, 'false')
                 when 'insert_check' then coalesce(p.with_check, 'false') end || ')', ' or ')
          into expr
          from pg_policies p
         where p.schemaname = 'public' and p.tablename = t and p.permissive = 'PERMISSIVE'
           and p.cmd in (upper(split_part(kind, '_', 1)), 'ALL');
        if kind <> 'select' and expr is null then continue; end if;
        if kind = 'select' then
          expr := 'true';  -- the table's own SELECT policies apply: that is the point
        else
          execute format('create policy zz_diff_probe on public.%I for select to public using (true)', t);
        end if;
        begin
          perform set_config('request.jwt.claims', claims, true);
          execute format('set local role %I', r);
          execute format('select count(*)::text || '':'' || coalesce(md5(string_agg(ctid::text, '','' order by ctid::text)), '''') from public.%I where %s', t, expr) into val;
        exception when others then
          val := 'ERR:' || sqlstate || ':' || sqlerrm;
        end;
        reset role;
        if kind <> 'select' then execute format('drop policy zz_diff_probe on public.%I', t); end if;
        insert into pg_temp.snaps values (p_phase, u.id, t, kind, val);
      end loop;
    end loop;
  end loop;
end $f$;
`;

function buildSql(migrationPaths: string[]): string {
  const applyAll = migrationPaths.map((m) => String.raw`\echo applying ${m}
\i ${m}`).join("\n");
  return String.raw`\set ON_ERROR_STOP on
begin;
-- a FOR ALL policy counts toward every command it covers
create temp table merged_tables as
  select distinct p.tablename::text as tbl
    from pg_policies p
    join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd) on p.cmd in (c.cmd, 'ALL')
   where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
   group by p.tablename, c.cmd, p.roles::text having count(*) > 1;
create temp table snaps (phase text, uid uuid, tbl text, kind text, val text);
grant all on pg_temp.snaps to public;
${SNAP_FN}
select pg_temp.snap('before');
${applyAll}
select pg_temp.snap('after');
\echo
\echo === (account, table) pairs compared ===
select count(distinct (b.uid, b.tbl)) as pairs, count(*) as checks, count(distinct b.tbl) as tables, count(distinct b.uid) as accounts
  from snaps b where b.phase = 'before';
\echo === differences (expected: none) ===
select coalesce(b.uid::text, 'anon') as account, b.tbl, b.kind, b.val as before, a.val as after
  from snaps b join snaps a on a.phase = 'after' and a.uid is not distinct from b.uid and a.tbl = b.tbl and a.kind = b.kind
 where b.phase = 'before' and a.val is distinct from b.val;
select 'differences: ' || count(*) as result
  from snaps b join snaps a on a.phase = 'after' and a.uid is not distinct from b.uid and a.tbl = b.tbl and a.kind = b.kind
 where b.phase = 'before' and a.val is distinct from b.val;
\echo === rows visible to at least one account (guards against a vacuous comparison) ===
select kind, count(*) filter (where val !~ '^0:' and val !~ '^ERR') as nonempty, count(*) filter (where val ~ '^0:') as empty, count(*) filter (where val ~ '^ERR') as errors
  from snaps where phase = 'before' group by kind order by kind;
\echo === checks that errored (a check that cannot run proves nothing, even when unchanged) ===
select coalesce(uid::text, 'anon') as account, tbl, kind, val from snaps where phase = 'before' and val ~ '^ERR';
rollback;
`;
}

function main(): void {
  const stack = readLocalStack(); // refuses anything but loopback
  const given = process.argv.slice(2).map((m) => resolve(m));
  const migrations = given.length > 0 ? given : defaultMigrations();
  const dir = mkdtempSync(join(tmpdir(), "rls-diff-"));
  const file = join(dir, "differential.sql");
  writeFileSync(file, buildSql(migrations));
  const run = spawnSync("psql", [stack.DB_URL, "-X", "-f", file], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

main();
