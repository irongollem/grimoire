#!/usr/bin/env tsx
/**
 * Brings the published demo campaign into the local stack, and loads it into
 * the DM fixture the way a new user loads it.
 *
 * ## Why this exists
 *
 * The demo template is authored in production and never enters this public
 * repo (see `context/features/demo-campaign.md`), so a local stack has no demo
 * at all: `get_demo_status()` says nothing is published, the offer never
 * renders, and `load_demo_campaign()` has nothing to copy. Everything that
 * touches the demo was therefore only ever checked in production. It is also
 * the one campaign whose content may be shown publicly, which makes it the
 * right thing to have on screen when taking a screenshot.
 *
 * ## What it does
 *
 * 1. Reads the template from production: the campaign row, and every row of
 *    every table `private.demo_campaign_tables` marks as copied. The catalogue
 *    is read from the LOCAL database, which has the same migrations, so the
 *    table list is the one the copy itself uses and cannot drift from it.
 * 2. Replaces the local copy of the template with those rows, ids and all,
 *    under the same author. `seed.sql` is a dump of that author's data, so the
 *    account is already there. The rows go in with triggers running, by the
 *    method the production copy uses (see `lib/dev-demo-sql.ts`), because a
 *    local schema is usually ahead of production's and some of its columns
 *    are filled only by a trigger.
 * 3. Signs in as the DM fixture and calls `load_demo_campaign()`, the real RPC.
 *    The fixture ends up with what a new user gets: a quota-free copy with
 *    fresh ids, made by the code path under test rather than by this script.
 * 4. Seats the player fixture at that copy's table, with one of the demo's
 *    pre-made characters claimed. A demo has no players (the template may not
 *    carry another account), so without this the player portal has nothing
 *    public to show: the player fixture's only other campaign is a clone of
 *    real data.
 *
 * The template is written against production's shared library (spells, items,
 * the sound library), and a local library is whatever the last seed left. So
 * the shared rows the template points at are read too, and added where the
 * local stack lacks them.
 *
 * Images and audio are not copied. The rows carry absolute CDN addresses, and
 * a copy keeps pointing at the author's files by design, so they load locally
 * from where they already are.
 *
 * ## What it may touch
 *
 * Production is read, never written: the only request this file can send to it
 * is a filtered GET (see `remoteRows`). It uses the service-role key because
 * the template is somebody's private campaign under RLS; the filter on the
 * template's id is what keeps the read to the demo.
 *
 * Every write goes to the local stack, through the same loopback guard
 * `dev-auth.ts` uses. The pulled rows pass through one temporary SQL file,
 * which is deleted whether or not the import succeeds.
 *
 * Usage:
 *   npm run dev:demo              # pull the template, load it into dm-fixture
 *   npm run dev:demo -- --check   # report state, change nothing
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { quote, sql } from "./lib/dev-db.ts";
import {
  assertRemoteUrl,
  buildImportSql,
  collectSlugs,
  type DemoTable,
  type PulledTable,
  type ReferenceTable,
} from "./lib/dev-demo-sql.ts";

/** The fixture `dev-auth.ts` owns. Restated because that file is a script, not a module. */
const DEV_PASSWORD = "grimoire-local-dev";
const FIXTURE_EMAIL = "dm-fixture@example.invalid";
const PLAYER_EMAIL = "player-fixture@example.invalid";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/**
 * The shared-content tables keyed by text slug, and the column the slug is in.
 * User data refers to them with no foreign key (see
 * `supabase/checks/content_integrity.sql`), so these are the tables a slug
 * found in the template is looked up in. Tile packs are here because a
 * Cartographer map names its pack on every painted cell, and without the pack
 * the map opens as an empty grey rectangle.
 */
const SLUG_LIBRARIES = [
  { table: "library_monsters", column: "id" },
  { table: "library_spells", column: "id" },
  { table: "library_species", column: "id" },
  { table: "library_items", column: "id" },
  { table: "library_tile_packs", column: "pack_id" },
];

/** PostgREST's row cap on the hosted project. A page this size is always a full page or the last one. */
const PAGE = 1000;
/** Parent ids per request, so a tier-2 filter never outgrows a URL. */
const ID_CHUNK = 60;

interface StackStatus {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
}

function readStack(): StackStatus {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  } catch {
    throw new Error("Local stack is not running. Start it with `npm run db:start`.");
  }
  const status = JSON.parse(raw) as StackStatus;

  // The same guard dev-auth.ts uses: everything this script writes goes to the
  // stack named here, so it has to be the disposable one.
  for (const [label, url] of [
    ["API_URL", status.API_URL],
    ["DB_URL", status.DB_URL],
  ] as const) {
    const host = new URL(url).hostname;
    if (!LOOPBACK.has(host)) {
      throw new Error(
        `Refusing to run: ${label} points at ${host}, not loopback. ` +
          `This script only ever writes to the local disposable stack.`,
      );
    }
  }
  return status;
}

/**
 * The one way this script reaches production: a GET against PostgREST. There is
 * deliberately no general-purpose client here, so there is no method to get
 * wrong.
 */
async function remoteRows(
  remote: URL,
  key: string,
  table: string,
  filter: string,
  orderBy: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${remote.origin}/rest/v1/${table}?${filter}&select=*&order=${orderBy}&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) {
      throw new Error(`Could not read ${table} from production (${response.status}): ${await response.text()}`);
    }
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** The copied tables, from the local catalogue, with a column to page each one by. */
function readCatalogue(dbUrl: string): (DemoTable & { orderBy: string })[] {
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
function readLocalColumns(dbUrl: string, tables: string[]): Map<string, string[]> {
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

async function pullTemplate(remote: URL, key: string, dbUrl: string) {
  const [campaign, ...extra] = await remoteRows(remote, key, "campaigns", "demo_template=is.true", "id");
  if (!campaign) throw new Error("Production has no demo template. Publish one in Admin → Content first.");
  if (extra.length) throw new Error("Production reports more than one demo template; refusing to guess.");
  const templateId = String(campaign.id);

  const catalogue = readCatalogue(dbUrl);
  const columns = readLocalColumns(dbUrl, ["campaigns", ...catalogue.map((t) => t.table)]);
  const tables: PulledTable[] = [];
  const idsByTable = new Map<string, string[]>();
  for (const t of catalogue) {
    let rows: Record<string, unknown>[] = [];
    if (t.tier === 1) {
      rows = await remoteRows(remote, key, t.table, `campaign_id=eq.${templateId}`, t.orderBy);
      idsByTable.set(
        t.table,
        rows.map((r) => r.id).filter((id): id is string => typeof id === "string"),
      );
    } else {
      // Tier 2 belongs to the campaign only through its parent row.
      const parents = idsByTable.get(t.parentTable!) ?? [];
      for (let i = 0; i < parents.length; i += ID_CHUNK) {
        const chunk = parents.slice(i, i + ID_CHUNK).join(",");
        rows.push(...(await remoteRows(remote, key, t.table, `${t.parentColumn}=in.(${chunk})`, t.orderBy)));
      }
    }
    tables.push({
      table: t.table,
      tier: t.tier,
      parentColumn: t.parentColumn,
      parentTable: t.parentTable,
      deferColumns: t.deferColumns,
      rows,
      columns: columns.get(t.table) ?? [],
    });
  }
  return { campaign, campaignColumns: columns.get("campaigns") ?? [], tables };
}

/** Foreign keys from a copied table to a table the copy leaves alone: shared content, by definition. */
function readOutsideForeignKeys(dbUrl: string): { table: string; column: string; refTable: string; refColumn: string }[] {
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
async function pullReferences(remote: URL, key: string, dbUrl: string, tables: PulledTable[]): Promise<ReferenceTable[]> {
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

function importTemplate(
  dbUrl: string,
  campaign: Record<string, unknown>,
  campaignColumns: string[],
  tables: PulledTable[],
  references: ReferenceTable[],
): void {
  const author = String(campaign.user_id);
  if (sql(dbUrl, `select count(*) from auth.users where id = ${quote(author)}`) !== "1") {
    throw new Error(
      "The template's author has no account in the local stack. `seed.sql` is expected to carry it; run `npm run db:reset`.",
    );
  }

  // The rows go through a file rather than an argument: the embeddings alone
  // are larger than a command line may be.
  const dir = mkdtempSync(join(tmpdir(), "grimoire-demo-"));
  const file = join(dir, "import.sql");
  try {
    writeFileSync(file, buildImportSql(campaign, campaignColumns, tables, references, `demo_${randomBytes(6).toString("hex")}`), { mode: 0o600 });
    execFileSync("psql", [dbUrl, "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: ["ignore", "ignore", "pipe"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function loadIntoFixture(stack: StackStatus): Promise<string> {
  const client = createClient(stack.API_URL, stack.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email: FIXTURE_EMAIL, password: DEV_PASSWORD });
  if (signInError) {
    throw new Error(`Could not sign in as ${FIXTURE_EMAIL} (${signInError.message}). Run \`npm run dev:auth\` first.`);
  }

  const { data: status, error: statusError } = await client.rpc("get_demo_status");
  if (statusError) throw new Error(`get_demo_status failed: ${statusError.message}`);
  const hasCopy = Boolean((status as { demo_campaign_id: string | null }).demo_campaign_id);

  // The real RPC, as the fixture: the copy is made by the path a new user takes.
  const { data, error } = await client.rpc("load_demo_campaign", { p_replace: hasCopy });
  if (error) throw new Error(`load_demo_campaign failed: ${error.message}`);
  return data as string;
}

/**
 * Makes the player fixture a member of the DM fixture's demo copy and gives
 * them a character: the membership row and the party member's own
 * `owner_user_id`, the two halves `dev-auth.ts` sets for its campaign. The
 * copy is new on every run, so there is never an old seat to tidy.
 *
 * Returns the claimed character's name, or null when there is no player
 * fixture yet (`npm run dev:auth` makes one) or no character to claim.
 */
function seatPlayerFixture(dbUrl: string, campaignId: string): string | null {
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
  return characterName ?? null;
}

function localState(dbUrl: string) {
  const [template = ""] = sql(
    dbUrl,
    "select name || ' (' || coalesce(demo_version, 'unpublished') || ')' from public.campaigns where demo_template",
  ).split("\n");
  const [copy = ""] = sql(
    dbUrl,
    `select c.name || ' (' || c.demo_source || ')' from public.campaigns c
       join auth.users u on u.id = c.user_id
      where u.email = ${quote(FIXTURE_EMAIL)} and c.demo_source is not null`,
  ).split("\n");
  return { template: template || "none", copy: copy || "none" };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });

  const stack = readStack();
  const remote = assertRemoteUrl(process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Run through `npm run dev:demo`, which loads .env.local.");

  if (values.check) {
    const [published] = await remoteRows(remote, key, "campaigns", "demo_template=is.true", "id");
    const local = localState(stack.DB_URL);
    console.log(`production template : ${published ? `${published.name} (${published.demo_version})` : "none"}`);
    console.log(`local template      : ${local.template}`);
    console.log(`${FIXTURE_EMAIL} : ${local.copy}`);
    console.log("\nRun without --check to pull the template and load it into the fixture.");
    return;
  }

  const { campaign, campaignColumns, tables } = await pullTemplate(remote, key, stack.DB_URL);
  const filled = tables.filter((t) => t.rows.length > 0);
  const rowCount = filled.reduce((n, t) => n + t.rows.length, 0);
  console.log(`Read "${campaign.name}" (${campaign.demo_version}) from production: ${rowCount} rows in ${filled.length} tables.`);

  const references = await pullReferences(remote, key, stack.DB_URL, tables);
  if (references.length) {
    const summary = references.map((r) => `${r.rows.length} ${r.table}`).join(", ");
    console.log(`It points at shared content the local stack lacks: ${summary}. Read those too.`);
  }

  importTemplate(stack.DB_URL, campaign, campaignColumns, tables, references);
  console.log("Replaced the local template.");

  const copyId = await loadIntoFixture(stack);
  console.log(`Loaded it into ${FIXTURE_EMAIL} as campaign ${copyId}.`);

  const character = seatPlayerFixture(stack.DB_URL, copyId);
  console.log(
    character
      ? `Seated ${PLAYER_EMAIL} at it, playing ${character}.`
      : `No player seated: ${PLAYER_EMAIL} does not exist. Run \`npm run dev:auth\` and then this again.`,
  );
  console.log("\nSign in as the fixture and pick it in the campaign switcher. Run this again to refresh both.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
