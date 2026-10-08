/**
 * What `dev-demo-campaign.ts` and `dev-campaigns.ts` share: reading the copy
 * catalogue and the local schema, pulling the shared-library rows a campaign
 * points at, importing pulled rows, and seating the player fixture. Extracted
 * rather than copied so the two scripts cannot drift on the parts that decide
 * what a faithful import is.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quote, sql } from "./dev-db.ts";
import { buildImportSql, collectSlugs, type DemoTable, type PulledTable, type ReferenceTable } from "./dev-demo-sql.ts";
import { andFilters, detachMissingSpecies, ownershipFilter, type Rows, speciesIdsReferenced } from "./dev-ownership.ts";
import { MissingRemoteTable, remoteCount, remoteRows } from "./dev-stack.ts";

export const FIXTURE_EMAIL = "dm-fixture@example.invalid";
export const PLAYER_EMAIL = "player-fixture@example.invalid";

/** The player fixture's seat in a campaign. */
export interface SeatedPlayer {
  playerId: string;
  characterId: string | null;
  characterName: string | null;
}

/** Runs a SQL file through psql with a temp file that is deleted whether or not it succeeds. */
/** Returns psql's stderr, where a statement's notices (the `dev-skip` report) land. */
export function runSqlFile(dbUrl: string, text: string): string {
  // The rows go through a file rather than an argument: the embeddings alone
  // are larger than a command line may be.
  const dir = mkdtempSync(join(tmpdir(), "grimoire-dev-"));
  const file = join(dir, "import.sql");
  try {
    writeFileSync(file, text, { mode: 0o600 });
    const run = spawnSync("psql", [dbUrl, "-q", "-v", "ON_ERROR_STOP=1", "-f", file], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`psql failed: ${run.stderr}`);
    return run.stderr;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A table's rows the import skipped, and why (a lenient import's `dev-skip` notices). */
export interface SkippedRows {
  table: string;
  count: number;
  reason: string;
}

/** Reads `NOTICE:  dev-skip|table|count|reason` lines out of psql's stderr. */
export function parseSkipped(stderr: string): SkippedRows[] {
  const skipped: SkippedRows[] = [];
  for (const line of stderr.split("\n")) {
    const at = line.indexOf("dev-skip|");
    if (at === -1) continue;
    const [, table, count, ...reason] = line.slice(at).split("|");
    skipped.push({ table, count: Number(count), reason: reason.join("|").trim() });
  }
  return skipped;
}

/**
 * The shared-content tables keyed by text slug, and the column the slug is in.
 * User data refers to them with no foreign key (see
 * `supabase/checks/content_integrity.sql`), so these are the tables a slug
 * found in the template is looked up in. Tile packs are here because a
 * Cartographer map names its pack on every painted cell, and without the pack
 * the map opens as an empty grey rectangle.
 */
export const SLUG_LIBRARIES = [
  { table: "library_monsters", column: "id" },
  { table: "library_spells", column: "id" },
  { table: "library_species", column: "id" },
  { table: "library_backgrounds", column: "id" },
  { table: "library_items", column: "id" },
  { table: "library_tile_packs", column: "pack_id" },
];

/** Parent ids per request, so a tier-2 filter never outgrows a URL. */
export const ID_CHUNK = 60;

/** The copied tables, from the local catalogue, with a column to page each one by. */
export function readCatalogue(dbUrl: string): (DemoTable & { orderBy: string })[] {
  const out = sql(
    dbUrl,
    `select d.table_name, d.tier, coalesce(d.parent_column, ''), coalesce(d.parent_table, ''),
            array_to_string(d.defer_columns, ','),
            exists (select 1 from pg_attribute a
                     where a.attrelid = format('public.%I', d.table_name)::regclass
                       and a.attname = 'id' and not a.attisdropped)
       from private.demo_campaign_tables d
      where d.copy
      order by d.tier, d.table_name`,
  );
  return out.split("\n").map((line) => {
    const [table, tier, parentColumn, parentTable, deferColumns, hasId] = line.split("\t");
    return {
      table,
      tier: Number(tier) as 1 | 2,
      parentColumn: parentColumn || null,
      parentTable: parentTable || null,
      deferColumns: deferColumns ? deferColumns.split(",") : [],
      orderBy: hasId === "t" ? "id" : parentColumn || "campaign_id",
    };
  });
}

/** Each table's insertable columns in the local schema: everything but dropped and generated ones. */
export function readLocalColumns(dbUrl: string, tables: string[]): Map<string, string[]> {
  const out = sql(
    dbUrl,
    `select c.relname, string_agg(a.attname, ',' order by a.attnum)
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace
        and c.relname in (${tables.map(quote).join(", ")})
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      group by c.relname`,
  );
  return new Map(out.split("\n").map((line) => {
    const [table, columns] = line.split("\t");
    return [table, columns.split(",")];
  }));
}


/** Foreign keys from a copied table to a table the copy leaves alone: shared content, by definition. */
export function readOutsideForeignKeys(dbUrl: string): { table: string; column: string; refTable: string; refColumn: string }[] {
  const out = sql(
    dbUrl,
    `select cl.relname, a.attname, ref.relname, af.attname
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
       join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
       join pg_attribute a on a.attrelid = cl.oid and a.attnum = con.conkey[1]
       join pg_attribute af on af.attrelid = ref.oid and af.attnum = con.confkey[1]
      where con.contype = 'f' and cardinality(con.conkey) = 1
        and cl.relname in (select table_name from private.demo_campaign_tables where copy)
        and ref.relname <> 'campaigns'
        and ref.relname not in (select table_name from private.demo_campaign_tables where copy)`,
  );
  return out.split("\n").filter(Boolean).map((line) => {
    const [table, column, refTable, refColumn] = line.split("\t");
    return { table, column, refTable, refColumn };
  });
}

/**
 * The shared content the template points at and the local stack does not have.
 *
 * A local library is whatever vintage the last seed left: sparse, or keyed the
 * way production was keyed before a reimport. The template is written against
 * production's, so without these rows its characters know spells that do not
 * exist and its shops stock items nobody can look up. Only the rows actually
 * referenced are read, and only the ones missing locally.
 */
export async function pullReferences(remote: URL, key: string, dbUrl: string, tables: PulledTable[]): Promise<ReferenceTable[]> {
  const wanted = new Map<string, { column: string; values: Set<string> }>();
  const want = (table: string, column: string, values: string[]) => {
    const entry = wanted.get(table) ?? { column, values: new Set<string>() };
    for (const v of values) entry.values.add(v);
    wanted.set(table, entry);
  };

  for (const fk of readOutsideForeignKeys(dbUrl)) {
    const rows = tables.find((t) => t.table === fk.table)?.rows ?? [];
    want(fk.refTable, fk.refColumn, rows.map((r) => r[fk.column]).filter((v): v is string => typeof v === "string"));
  }
  const slugs = collectSlugs(tables.flatMap((t) => t.rows));
  for (const library of SLUG_LIBRARIES) want(library.table, library.column, slugs);

  const columns = readLocalColumns(dbUrl, [...wanted.keys()]);
  const references: ReferenceTable[] = [];
  for (const [table, { column, values }] of wanted) {
    if (values.size === 0) continue;
    const all = [...values];
    const present = new Set(
      sql(dbUrl, `select ${column}::text from public.${table} where ${column}::text in (${all.map(quote).join(", ")})`)
        .split("\n")
        .filter(Boolean),
    );
    const missing = all.filter((v) => !present.has(v));
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < missing.length; i += ID_CHUNK) {
      // Quoted, because a slug may hold a character PostgREST's list syntax reserves.
      const list = missing.slice(i, i + ID_CHUNK).map((v) => `"${v}"`).join(",");
      rows.push(...(await remoteRows(remote, key, table, `${column}=in.(${encodeURIComponent(list)})`, column)));
    }
    if (rows.length) references.push({ table, rows, columns: columns.get(table) ?? [] });
  }
  return references;
}


/**
 * The homebrew species a campaign's characters and settings name but the
 * campaign does not hold (#1034). `species` is copied by `campaign_id`, so a
 * species kept at account level, or one filed under another campaign, never
 * came across, and `party_members.species_id`, `disguise_species_id` and
 * `campaigns.disabled_species_ids` were left pointing at nothing: `db:check`
 * failed on every fixture load.
 *
 * They are read under the ownership rule like every copied table (the source
 * account's own rows only, in the GET itself) and filed under this campaign,
 * so `remapToFixture` gives the copy its own and the next run's purge takes
 * them away with it. A reference still unresolved (another account's species,
 * or one production no longer has) is emptied rather than left dangling.
 * Mutates the campaign and the pulled rows; returns how many were pulled and
 * what was emptied, per `table.column`.
 */
export async function pullReferencedSpecies(
  remote: URL,
  key: string,
  campaign: Record<string, unknown>,
  tables: PulledTable[],
  source: string,
): Promise<{ pulled: number; detached: Record<string, number> }> {
  const species = tables.find((t) => t.table === "species");
  if (species === undefined) throw new Error("species is not among the copied tables; the catalogue changed");
  const byTable: Record<string, Rows> = {
    campaigns: [campaign],
    party_members: tables.find((t) => t.table === "party_members")?.rows ?? [],
  };
  const held = new Set(species.rows.map((r) => String(r.id)));
  const missing = [...speciesIdsReferenced(byTable)].filter((id) => !held.has(id));

  let pulled = 0;
  for (let i = 0; i < missing.length; i += ID_CHUNK) {
    const filter = andFilters(
      `id=in.(${missing.slice(i, i + ID_CHUNK).join(",")})`,
      ownershipFilter("species", species.columns, source),
    );
    for (const row of await remoteRows(remote, key, "species", filter, "id")) {
      species.rows.push({ ...row, campaign_id: campaign.id });
      held.add(String(row.id));
      pulled++;
    }
  }
  return { pulled, detached: detachMissingSpecies(byTable, held) };
}

/**
 * The source campaign's own local rows (ids unchanged, from an earlier import or
 * `seed.sql`) name account-level species the local stack never received,
 * because `seed.sql` predates them (#1034). Reads the ones production still has,
 * under the ownership rule, as reference rows the import inserts unchanged
 * (`on conflict do nothing`), and lists the ids production no longer has, so
 * `emptyLocalSpeciesReferences` can clear them once the import is done.
 */
export async function pullSourceSpecies(
  remote: URL,
  key: string,
  dbUrl: string,
  campaignId: string,
  source: string,
): Promise<{ reference: ReferenceTable | null; gone: string[] }> {
  const wanted = sql(
    dbUrl,
    `select distinct v from (
       select species_id v from public.party_members where campaign_id = ${quote(campaignId)}
       union all select disguise_species_id from public.party_members where campaign_id = ${quote(campaignId)}
       union all select unnest(disabled_species_ids)::text from public.campaigns where id = ${quote(campaignId)}
     ) refs
     where v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from public.species s where s.id::text = refs.v)`,
  ).split("\n").filter(Boolean);
  if (wanted.length === 0) return { reference: null, gone: [] };

  const columns = readLocalColumns(dbUrl, ["species"]).get("species") ?? [];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < wanted.length; i += ID_CHUNK) {
    const filter = andFilters(`id=in.(${wanted.slice(i, i + ID_CHUNK).join(",")})`, ownershipFilter("species", columns, source));
    rows.push(...(await remoteRows(remote, key, "species", filter, "id")));
  }
  const found = new Set(rows.map((r) => String(r.id)));
  return {
    reference: rows.length ? { table: "species", rows, columns } : null,
    gone: wanted.filter((id) => !found.has(id)),
  };
}

/**
 * Clears the species references in one campaign's local rows that name a
 * species the local stack still lacks, the way `detachMissingSpecies` does
 * before an import: a scalar to null, an array element dropped. Returns how
 * many it cleared.
 */
export function emptyLocalSpeciesReferences(dbUrl: string, campaignId: string, ids: string[]): number {
  if (ids.length === 0) return 0;
  const list = `array[${ids.map(quote).join(", ")}]::text[]`;
  const id = quote(campaignId);
  return Number(sql(
    dbUrl,
    `with a as (update public.party_members set species_id = null where campaign_id = ${id} and species_id = any(${list}) returning 1),
          b as (update public.party_members set disguise_species_id = null where campaign_id = ${id} and disguise_species_id = any(${list}) returning 1),
          c as (update public.campaigns set disabled_species_ids = (
                  select coalesce(array_agg(e order by n), '{}') from unnest(disabled_species_ids) with ordinality u(e, n)
                   where not (e::text = any(${list}))
                ) where id = ${id} and disabled_species_ids::text[] && ${list} returning 1)
     select (select count(*) from a) + (select count(*) from b) + (select count(*) from c)`,
  ));
}

export function importCampaign(
  dbUrl: string,
  campaign: Record<string, unknown>,
  campaignColumns: string[],
  tables: PulledTable[],
  references: ReferenceTable[],
  template: boolean,
): SkippedRows[] {
  const author = String(campaign.user_id);
  if (sql(dbUrl, `select count(*) from auth.users where id = ${quote(author)}`) !== "1") {
    throw new Error(
      "The campaign's author has no account in the local stack. `seed.sql` is expected to carry it; run `npm run db:reset`.",
    );
  }

  // A real campaign imports leniently: production keeps rows today's triggers
  // would refuse, and one of those should not cost the fixture the campaign.
  const stderr = runSqlFile(
    dbUrl,
    buildImportSql(campaign, campaignColumns, tables, references, `demo_${randomBytes(6).toString("hex")}`, {
      template,
      lenient: !template,
    }),
  );
  return parseSkipped(stderr);
}


/**
 * Makes the player fixture a member of the DM fixture's demo copy and gives
 * them a character: the membership row and the party member's own
 * `owner_user_id`, the two halves `dev-auth.ts` sets for its campaign. The
 * copy is new on every run, so there is never an old seat to tidy.
 *
 * Returns who was seated and which character they claimed (null when the
 * campaign has none to claim), or null when there is no player fixture yet
 * (`npm run dev:auth` makes one).
 */
export function seatPlayerFixture(dbUrl: string, campaignId: string): SeatedPlayer | null {
  const playerId = sql(dbUrl, `select id from auth.users where email = ${quote(PLAYER_EMAIL)} limit 1`);
  if (!playerId) return null;

  const [character = ""] = sql(
    dbUrl,
    `select id || E'\\t' || name from public.party_members
      where campaign_id = ${quote(campaignId)} and owner_user_id is null
      order by name limit 1`,
  ).split("\n");
  const [characterId, characterName] = character.split("\t");

  sql(
    dbUrl,
    `insert into public.campaign_members (campaign_id, user_id, role, party_member_id, display_name)
     values (${quote(campaignId)}, ${quote(playerId)}, 'player', ${characterId ? quote(characterId) : "null"}, 'Fixture Player')
     on conflict (campaign_id, user_id) do update
       set role = excluded.role,
           party_member_id = excluded.party_member_id,
           display_name = excluded.display_name;`,
  );
  if (characterId) {
    sql(dbUrl, `update public.party_members set owner_user_id = ${quote(playerId)} where id = ${quote(characterId)};`);
  }
  return { playerId, characterId: characterId || null, characterName: characterName || null };
}


/** The tables the copy leaves out that belong to a campaign (play state, memberships, sessions' kin). */
export function readExcludedTables(dbUrl: string): string[] {
  return sql(dbUrl, "select table_name from private.demo_campaign_tables where not copy order by table_name")
    .split("\n")
    .filter(Boolean);
}

/** One single-column foreign key as the local schema declares it. */
export interface LocalForeignKey {
  table: string;
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  nullable: boolean;
}

/** Every single-column foreign key whose owning table is in `tables`. */
export function readForeignKeys(dbUrl: string, tables: string[]): LocalForeignKey[] {
  const out = sql(
    dbUrl,
    `select cl.relname, a.attname, rn.nspname, ref.relname, af.attname, not a.attnotnull
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
       join pg_class ref on ref.oid = con.confrelid
       join pg_namespace rn on rn.oid = ref.relnamespace
       join pg_attribute a on a.attrelid = cl.oid and a.attnum = con.conkey[1]
       join pg_attribute af on af.attrelid = ref.oid and af.attnum = con.confkey[1]
      where con.contype = 'f' and cardinality(con.conkey) = 1
        and cl.relname in (${tables.map(quote).join(", ")})`,
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [table, column, refSchema, refTable, refColumn, nullable] = line.split("\t");
      return { table, column, refSchema, refTable, refColumn, nullable: nullable === "t" };
    });
}

export interface PullResult {
  tables: PulledTable[];
  /** Rows the ownership rule kept out, per table. Empty when no source account was given. */
  keptOut: Record<string, number>;
  /** Tables the local schema has and production does not yet (see `MissingRemoteTable`). */
  missingInProduction: string[];
}

/**
 * Reads every copied table of one campaign from production, a filtered GET each.
 *
 * With `source`, each table is also restricted to that account's rows by
 * `ownershipFilter`, in the GET itself, and tier-2 tables are fetched only for
 * the parents that were kept. The unfiltered count is asked for separately
 * (`remoteCount`, a count and no rows) so the summary can say how much the rule
 * kept out without that data ever being transferred.
 */
export async function pullCampaignTables(
  remote: URL,
  key: string,
  catalogue: (DemoTable & { orderBy: string })[],
  columns: Map<string, string[]>,
  campaignId: string,
  source: string | null,
): Promise<PullResult> {
  const tables: PulledTable[] = [];
  const keptOut: Record<string, number> = {};
  const idsByTable = new Map<string, string[]>();
  const missingInProduction: string[] = [];
  for (const t of catalogue) {
    const own = columns.get(t.table) ?? [];
    const owner = source ? ownershipFilter(t.table, own, source) : "";
    const rows: Record<string, unknown>[] = [];
    let total = 0;
    try {
      if (t.tier === 1) {
        const scope = `campaign_id=eq.${campaignId}`;
        rows.push(...(await remoteRows(remote, key, t.table, andFilters(scope, owner), t.orderBy)));
        if (source) total = await remoteCount(remote, key, t.table, scope);
        idsByTable.set(
          t.table,
          rows.map((r) => r.id).filter((id): id is string => typeof id === "string"),
        );
      } else {
        // Tier 2 belongs to the campaign only through its parent row.
        const parents = idsByTable.get(t.parentTable!) ?? [];
        for (let i = 0; i < parents.length; i += ID_CHUNK) {
          const scope = `${t.parentColumn}=in.(${parents.slice(i, i + ID_CHUNK).join(",")})`;
          rows.push(...(await remoteRows(remote, key, t.table, andFilters(scope, owner), t.orderBy)));
          if (source) total += await remoteCount(remote, key, t.table, scope);
        }
      }
      if (source && total > rows.length) keptOut[t.table] = total - rows.length;
    } catch (error) {
      if (!(error instanceof MissingRemoteTable)) throw error;
      // Pulled as empty: its tier-2 children then find no parents, and the
      // import's foreign-key prune drops anything still pointing into it.
      missingInProduction.push(t.table);
      rows.length = 0;
      idsByTable.set(t.table, []);
    }
    tables.push({
      table: t.table,
      tier: t.tier,
      parentColumn: t.parentColumn,
      parentTable: t.parentTable,
      deferColumns: t.deferColumns,
      rows,
      columns: own,
    });
  }
  return { tables, keptOut, missingInProduction };
}
