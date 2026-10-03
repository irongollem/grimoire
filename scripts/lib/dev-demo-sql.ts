/**
 * The pure halves of `dev-demo-campaign.ts`: deciding what a remote address may
 * be, and writing the statement that puts the pulled template into the local
 * database. Kept apart from the script so both can be tested without a stack.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDENT = /^[a-z_][a-z0-9_]*$/;

/** One row of `private.demo_campaign_tables` where `copy` is true. */
export interface DemoTable {
  table: string;
  tier: 1 | 2;
  /** Tier 2 only: the column that points at the parent row. */
  parentColumn: string | null;
  /** Tier 2 only: the tier-1 table that parent row lives in. */
  parentTable: string | null;
  /** Columns that close a foreign-key cycle: inserted null, restored at the end. */
  deferColumns: string[];
}

export interface PulledTable extends DemoTable {
  rows: Record<string, unknown>[];
  /** The local table's insertable columns (see `sharedColumns`). */
  columns: string[];
}

/**
 * Shared content the template points at and the local stack lacks: a library
 * spell, a library item, a sound from the shared sound library. Not part of the
 * campaign, so never purged; inserted only where the row is missing.
 */
export interface ReferenceTable {
  table: string;
  rows: Record<string, unknown>[];
  /** The local table's insertable columns. */
  columns: string[];
}

/**
 * Every string that sits under a key ending in `_id` and is not a uuid: the
 * shape a reference to shared content takes. Library rows are keyed by text
 * slugs (`srd_srd_aid`), which is why no foreign key describes these and why
 * they turn up inside jsonb as readily as in columns.
 */
export function collectSlugs(rows: unknown[]): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, key: string | null) => {
    if (typeof value === "string") {
      if (key !== null && /_ids?$/.test(key) && value.length <= 120 && !UUID.test(value) && /^[A-Za-z0-9][\w:.-]*$/.test(value)) {
        found.add(value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  for (const row of rows) visit(row, null);
  return [...found].sort();
}

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Not a plain identifier: ${name}`);
  return name;
}

function uuid(value: string): string {
  if (!UUID.test(value)) throw new Error(`Not a uuid: ${value}`);
  return value;
}

/** A dollar-quoted literal. The tag is checked against the payload, so no row can close it early. */
function dollar(text: string, tag: string): string {
  const quote = `$${tag}$`;
  if (text.includes(quote)) throw new Error("The dollar-quote tag occurs in the data; pick another.");
  return `${quote}${text}${quote}`;
}

/**
 * The columns an insert names: the ones the pulled rows carry AND the local
 * table has.
 *
 * The two schemas are rarely identical. A local stack usually runs migrations
 * production has not seen yet, and `jsonb_populate_record` fills a column the
 * row lacks with NULL, not with its default. Naming only the shared columns
 * lets a local default apply, lets a BEFORE INSERT trigger fill a column that
 * has none, and drops a column production has that this checkout does not.
 */
function sharedColumns(table: string, localColumns: string[], rows: Record<string, unknown>[]): string[] {
  const carried = new Set(Object.keys(rows[0] ?? {}));
  const columns = localColumns.filter((c) => carried.has(c)).map(ident);
  if (columns.length === 0) throw new Error(`${table}: the pulled rows share no column with the local table.`);
  return columns;
}

/**
 * The passes: steps 5 and 6 of `private.copy_demo_template`, reading from the
 * two temp tables `buildImportSql` fills. Rows go in a table at a time until
 * everything lands; a table that references itself falls back to a row at a
 * time; the deferred columns are restored once every row exists.
 */
const PASSES = `
declare
  v_progress boolean;
  r record;
  m record;
begin
  loop
    v_progress := false;
    for r in
      select d.tbl, t.cols, t.xcols,
             exists (select 1 from pg_constraint con
                      where con.contype = 'f'
                        and con.conrelid = format('public.%I', d.tbl)::regclass
                        and con.confrelid = con.conrelid) as self_ref
        from demo_pull_rows d
        join demo_pull_tables t on t.tbl = d.tbl
       where not d.done
       group by d.tbl, t.cols, t.xcols
       order by d.tbl
    loop
      begin
        execute format(
          'insert into public.%I (%s) select %s from demo_pull_rows d cross join lateral jsonb_populate_record(null::public.%I, d.data) x where d.tbl = %L and not d.done',
          r.tbl, r.cols, r.xcols, r.tbl, r.tbl
        );
        update demo_pull_rows set done = true, err = null where tbl = r.tbl and not done;
        v_progress := true;
      exception when others then
        update demo_pull_rows set err = sqlerrm where tbl = r.tbl and not done;
        if r.self_ref then
          for m in select seq, data from demo_pull_rows where tbl = r.tbl and not done order by seq loop
            begin
              execute format(
                'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) x',
                r.tbl, r.cols, r.xcols, r.tbl
              ) using m.data;
              update demo_pull_rows set done = true, err = null where seq = m.seq;
              v_progress := true;
            exception when others then
              update demo_pull_rows set err = sqlerrm where seq = m.seq;
            end;
          end loop;
        end if;
      end;
    end loop;

    exit when not exists (select 1 from demo_pull_rows where not done);

    if not v_progress then
      raise exception 'The demo template could not be imported: %',
        (select string_agg(distinct tbl || ': ' || err, '; ') from demo_pull_rows where not done);
    end if;
  end loop;

  for r in select tbl, (data ->> 'id')::uuid as id, deferred from demo_pull_rows where deferred <> '{}'::jsonb loop
    execute format(
      'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) src where t.id = $2',
      r.tbl,
      (select string_agg(format('%I = src.%I', k, k), ', ') from jsonb_object_keys(r.deferred) k),
      r.tbl
    ) using r.deferred, r.id;
  end loop;
end
`;

/**
 * One transaction that replaces the local copy of the template with what was
 * pulled, ids and all.
 *
 * It has two halves, because they need opposite things from the database.
 *
 * THE PURGE runs with `session_replication_role = replica`, so foreign keys
 * stand down. It deletes by campaign, with the catalogue the pull read, so a
 * second run replaces the first and a row deleted upstream goes here too. And
 * it deletes by id, because the template was cut out of its author's other
 * content: `seed.sql` can hold the same row from before it moved, filed under
 * another campaign or none, where a purge by campaign would never find it.
 * Those rows may be referenced from elsewhere in the seed; they come straight
 * back under the same ids, so nothing is left dangling.
 *
 * THE INSERT runs with triggers on, the way `private.copy_demo_template` does
 * it in production, and for the reason a blunt insert fails here: columns
 * exist that only a trigger fills. `grimoire.bypass_quota` and
 * `grimoire.copying_campaign` quiet the same triggers they quiet there, and the
 * JWT claim makes `auth.uid()` the author, as it is when the author saves.
 */
export function buildImportSql(
  campaign: Record<string, unknown>,
  campaignColumns: string[],
  tables: PulledTable[],
  references: ReferenceTable[],
  tag: string,
): string {
  const id = uuid(String(campaign.id));
  const author = uuid(String(campaign.user_id));
  const json = (value: unknown) => `${dollar(JSON.stringify(value), tag)}::jsonb`;
  const idsOf = (rows: Record<string, unknown>[]) =>
    rows.map((r) => r.id).filter((v): v is string => typeof v === "string" && UUID.test(v));
  const inList = (ids: string[]) => ids.map((v) => `'${v}'`).join(", ");

  const lines: string[] = ["begin;", "set local session_replication_role = replica;"];

  // ── Purge ──────────────────────────────────────────────────────────────────
  for (const t of tables.filter((t) => t.tier === 2)) {
    lines.push(
      `delete from public.${ident(t.table)} where ${ident(t.parentColumn!)} in ` +
        `(select id from public.${ident(t.parentTable!)} where campaign_id = '${id}');`,
    );
  }
  for (const t of tables.filter((t) => t.tier === 1)) {
    lines.push(`delete from public.${ident(t.table)} where campaign_id = '${id}';`);
  }
  lines.push(`delete from public.campaigns where id = '${id}';`);
  for (const t of tables) {
    const own = idsOf(t.rows);
    if (own.length) lines.push(`delete from public.${ident(t.table)} where id in (${inList(own)});`);
    if (t.tier !== 2) continue;
    const parents = idsOf(tables.find((p) => p.table === t.parentTable)?.rows ?? []);
    if (parents.length) {
      lines.push(`delete from public.${ident(t.table)} where ${ident(t.parentColumn!)} in (${inList(parents)});`);
    }
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  lines.push(
    "set local session_replication_role = origin;",
    `select set_config('request.jwt.claims', '{"sub":"${author}","role":"authenticated"}', true);`,
    "select set_config('grimoire.bypass_quota', 'on', true);",
    "select set_config('grimoire.copying_campaign', 'on', true);",
    "create temp table demo_pull_rows (seq bigserial primary key, tbl text not null, data jsonb not null, " +
      "deferred jsonb not null default '{}', done boolean not null default false, err text) on commit drop;",
    "create temp table demo_pull_tables (tbl text primary key, cols text not null, xcols text not null, " +
      "defer_columns text[] not null) on commit drop;",
  );
  // Shared content first: the template's rows point at it. Only what is
  // missing goes in, so a library the local stack already has is left alone.
  for (const r of references.filter((r) => r.rows.length > 0)) {
    const name = ident(r.table);
    const cols = sharedColumns(r.table, r.columns, r.rows);
    lines.push(
      `insert into public.${name} (${cols.join(", ")}) select ${cols.map((c) => `x.${c}`).join(", ")} ` +
        `from jsonb_array_elements(${json(r.rows)}) e cross join lateral jsonb_populate_record(null::public.${name}, e) x ` +
        "on conflict do nothing;",
    );
  }

  for (const t of tables.filter((t) => t.rows.length > 0)) {
    const name = ident(t.table);
    const cols = sharedColumns(t.table, t.columns, t.rows);
    const defer = t.deferColumns.map(ident);
    lines.push(
      `insert into demo_pull_tables values ('${name}', '${cols.join(", ")}', '${cols.map((c) => `x.${c}`).join(", ")}', ` +
        `array[${defer.map((c) => `'${c}'`).join(", ")}]::text[]);`,
      `insert into demo_pull_rows (tbl, data) select '${name}', e from jsonb_array_elements(${json(t.rows)}) e;`,
    );
  }

  // Set the cycle-breaking columns aside, as copy_demo_template does.
  lines.push(
    "update demo_pull_rows d set " +
      "deferred = (select coalesce(jsonb_object_agg(col, d.data -> col), '{}'::jsonb) " +
      "from unnest(t.defer_columns) col where d.data ->> col is not null), " +
      "data = d.data || (select coalesce(jsonb_object_agg(col, null), '{}'::jsonb) " +
      "from unnest(t.defer_columns) col where d.data ->> col is not null) " +
      "from demo_pull_tables t where t.tbl = d.tbl and cardinality(t.defer_columns) > 0;",
  );

  // The campaign row. `current_location_id` points at a location that does not
  // exist yet, so it waits for the end too. The campaigns insert trigger
  // enables the default sources; the template's own set follows instead.
  const campaignCols = sharedColumns("campaigns", campaignColumns, [campaign]);
  lines.push(
    `insert into public.campaigns (${campaignCols.join(", ")}) select ${campaignCols.map((c) => `x.${c}`).join(", ")} ` +
      `from jsonb_populate_record(null::public.campaigns, ${json({ ...campaign, current_location_id: null })}) x;`,
    `delete from public.campaign_enabled_sources where campaign_id = '${id}';`,
    `do ${dollar(PASSES, `${tag}_do`)};`,
  );

  // Restore the campaign's own deferred column, and state the template flags
  // outright rather than trust that every trigger left them alone. Offered
  // locally whatever production says: a non-admin can only load a template that
  // is offered, and the fixture is deliberately not an admin.
  const location = campaign.current_location_id;
  if (typeof location === "string") {
    lines.push(`update public.campaigns set current_location_id = '${uuid(location)}' where id = '${id}';`);
  }
  lines.push(
    `update public.campaigns set demo_template = true, demo_version = ${dollar(String(campaign.demo_version), tag)}, ` +
      `demo_offered = true where id = '${id}';`,
    "commit;",
  );
  return lines.join("\n") + "\n";
}
