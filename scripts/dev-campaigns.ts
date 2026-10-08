#!/usr/bin/env tsx
/**
 * Copies the maintainer's own production campaigns onto the local DM fixture,
 * and gives the player fixture a seat and player-side content to look at.
 *
 * ## Why this exists
 *
 * Lists behave differently at real volume: 236 NPCs, 202 locations and 176
 * recipes are a virtualised list, a long scroll and a search that has to be
 * fast, none of which the synthetic fixture (a handful of rows) can show.
 * `dev:demo` brings in the one campaign that is public by design; this brings
 * in the maintainer's real ones, for the same account the app is tested as.
 *
 * ## What it does
 *
 * 1. Resolves the source account from the LOCAL database: the one account with
 *    the admin role, which is the author `seed.sql` was dumped from. Nothing
 *    that identifies it is written down anywhere in this repo.
 * 2. Lists that account's production campaigns, leaving out the demo template
 *    and any demo copy (`dev:demo` owns those).
 * 3. For each, reads every table `private.demo_campaign_tables` marks as
 *    copied, plus the shared-library rows the campaign points at.
 * 4. Gives the rows to `dm-fixture` (`remapToFixture` in `lib/dev-ownership.ts`):
 *    fresh ids for every row and the campaign, the source account replaced by
 *    the fixture, references inside jsonb included. Then imports them
 *    leniently by the method `dev:demo` uses (`lib/dev-demo-sql.ts`): a row
 *    today's validation triggers refuse is skipped and reported rather than
 *    costing the campaign. Real campaigns hold such rows, written before a rule
 *    existed, or pointing at content the account keeps outside any campaign,
 *    which is valid for its author and "not available" to the fixture. The
 *    strict `private.copy_demo_template` aborts on the first of them, so it is
 *    not used here. The source account's own local data is not touched.
 *    The previous copies this script made are removed after a successful import with
 *    `private.purge_demo_campaign`; they are recognised as campaigns the
 *    fixture owns, with no demo source, named like a source campaign.
 *    (`dev-auth.ts` names its own clone "<name> (fixture)", so the two cannot
 *    be mistaken for each other.)
 * 5. Copies the account's Hall of Heroes, which belongs to the account rather
 *    than a campaign.
 * 6. Seats `player-fixture` in the copy with the most rows, claims a character,
 *    and writes the player-side rows that can never come from production
 *    because they are the players' own: journal entries, discovered monsters
 *    and recipe grants, all invented and generic (`lib/dev-fixture-sql.ts`).
 *
 * ## The ownership rule
 *
 * A campaign has other people in it. Only the maintainer's own rows leave
 * production: every copied table with `user_id` is read with `user_id` equal to
 * the source account, and `created_by` equal to it (null only for the explicit
 * authoring-table allowlist in `lib/dev-ownership.ts`),
 * in the GET itself. Tier-2 rows are read only for kept parents. Then rows whose
 * foreign keys point at a row that was not kept are pruned, to a fixed point,
 * using the local schema's own foreign-key metadata (`lib/dev-ownership.ts`).
 * The summary says how many rows each step kept out, per table, and never
 * prints a row.
 *
 * ## What it may touch
 *
 * Production is read, never written: every request this file can send to it is
 * a filtered GET (`remoteRows`, `remoteCount`). It uses the service-role key
 * because the campaigns are private under RLS, and the ownership filter is what
 * keeps the read to the maintainer's rows. Every write goes to the local stack,
 * through the same loopback guard `dev-auth.ts` uses. The campaign rows have
 * their API keys and calendar feed token dropped before they are written, so
 * not even the local database holds a secret.
 *
 * Usage:
 *   npm run dev:campaigns              # pull, import, copy, seat
 *   npm run dev:campaigns -- --check   # report counts, change nothing
 */

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  FIXTURE_EMAIL,
  importCampaign,
  PLAYER_EMAIL,
  pullCampaignTables,
  pullReferences,
  readCatalogue,
  readExcludedTables,
  readForeignKeys,
  readLocalColumns,
  runSqlFile,
  seatPlayerFixture,
  type SkippedRows,
} from "./lib/dev-campaign-io.ts";
import { quote, sql } from "./lib/dev-db.ts";
import { type PulledTable } from "./lib/dev-demo-sql.ts";
import { buildHallSql, buildPlayerContentSql, journalDrafts } from "./lib/dev-fixture-sql.ts";
import { type FkRule, ownershipFilter, pruneForeignRows, remapToFixture, type Rows } from "./lib/dev-ownership.ts";
import { assertRemoteUrl, readLocalStack, remoteCount, remoteRows } from "./lib/dev-stack.ts";

/** The tables a list is tested on: what the summary counts and what ranks a copy as "the biggest". */
const MAIN_TABLES = [
  "npcs",
  "locations",
  "crafting_recipes",
  "encounters",
  "quests",
  "monsters",
  "notes",
  "items",
  "factions",
  "party_members",
];

/** Campaign columns that are the author's secrets rather than the campaign's. Dropped before the local write. */
const SECRET_COLUMN = /(_api_key|_secret|_token)$/;

const JOURNAL_ENTRIES = 40;
const DISCOVERED_MONSTERS = 40;
const GRANTED_RECIPES = 30;

type Row = Record<string, unknown>;

function resolveSource(dbUrl: string): string {
  const ids = sql(dbUrl, "select id from auth.users where raw_app_meta_data ->> 'role' = 'admin'")
    .split("\n")
    .filter(Boolean);
  if (ids.length !== 1) {
    throw new Error(
      `Expected exactly one admin account locally (the author seed.sql was dumped from), found ${ids.length}. ` +
        "Run `npm run db:reset` if the seed is missing.",
    );
  }
  return ids[0];
}

function fixtureId(dbUrl: string): string {
  const id = sql(dbUrl, `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  if (!id) throw new Error(`${FIXTURE_EMAIL} does not exist locally. Run \`npm run dev:auth\` first.`);
  return id;
}

/** The maintainer's real campaigns: not the template, not a demo copy. `not.is.true` also admits null. */
function listOwnCampaigns(remote: URL, key: string, source: string): Promise<Row[]> {
  return remoteRows(remote, key, "campaigns", `user_id=eq.${source}&demo_template=not.is.true&demo_source=is.null`, "created_at");
}

/** Counts of the main tables in a campaign as production would hand them over, and as the ownership rule leaves them. */
async function remoteSummary(remote: URL, key: string, columns: Map<string, string[]>, source: string, campaignId: string) {
  const out: { table: string; kept: number; total: number }[] = [];
  for (const table of MAIN_TABLES) {
    const scope = `campaign_id=eq.${campaignId}`;
    const owner = ownershipFilter(table, columns.get(table) ?? [], source);
    out.push({
      table,
      total: await remoteCount(remote, key, table, scope),
      kept: await remoteCount(remote, key, table, owner ? `${scope}&${owner}` : scope),
    });
  }
  return out;
}

function localCounts(dbUrl: string, campaignId: string): Record<string, number> {
  const parts = MAIN_TABLES.map((t) => `(select count(*) from public.${t} where campaign_id = ${quote(campaignId)})`);
  const values = sql(dbUrl, `select ${parts.join(", ")}`).split("\t").map(Number);
  return Object.fromEntries(MAIN_TABLES.map((t, i) => [t, values[i]]));
}

const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
const describeCounts = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${t}`)
    .join(", ");

/**
 * The previous copies this script made for a campaign of this name. `fresh` are
 * the copies made earlier in this same run, which two source campaigns sharing
 * a name must not purge from each other.
 */
function previousCopies(dbUrl: string, owner: string, name: string, fresh: ReadonlySet<string> = new Set()): string[] {
  const found = sql(
    dbUrl,
    `select id from public.campaigns
      where user_id = ${quote(owner)} and demo_source is null and demo_template is not true and name = ${quote(name)}`,
  )
    .split("\n")
    .filter(Boolean);
  return found.filter((id) => !fresh.has(id));
}

function foreignKeyRules(
  dbUrl: string,
  tables: PulledTable[],
  excluded: Set<string>,
  source: string,
): FkRule[] {
  const pulled = new Set([...tables.map((t) => t.table), "campaigns"]);
  const rules: FkRule[] = [];
  for (const fk of readForeignKeys(dbUrl, [...pulled])) {
    const base = { table: fk.table, column: fk.column, refTable: fk.refTable, refColumn: fk.refColumn, nullable: fk.nullable };
    if (fk.refSchema === "public" && pulled.has(fk.refTable)) {
      rules.push({ ...base, kind: "kept", allowed: new Set() });
    } else if (fk.refSchema === "auth" && fk.refTable === "users") {
      // Any account but the maintainer's is somebody else's.
      rules.push({ ...base, kind: "allowed", allowed: new Set([source]) });
    } else if (fk.refSchema === "public" && excluded.has(fk.refTable)) {
      // Campaign state the copy leaves out (play sessions, memberships): the target is never there.
      rules.push({ ...base, kind: "allowed", allowed: new Set() });
    }
    // Anything else is shared content, which `pullReferences` fetches.
  }
  return rules;
}

interface Imported {
  id: string;
  name: string;
  keptOut: Record<string, number>;
  /** Local tables production does not have yet; pulled as empty. */
  missingInProduction: string[];
  /** Rows today's validation triggers refused (production kept them from before a rule existed). */
  skipped: SkippedRows[];
  pruned: Record<string, number>;
  detached: Record<string, number>;
}

export async function pullAndCopy(
  stack: { DB_URL: string },
  remote: URL,
  key: string,
  source: string,
  owner: string,
  campaignRow: Row,
  fresh: ReadonlySet<string>,
): Promise<Imported> {
  const dbUrl = stack.DB_URL;
  const id = String(campaignRow.id);
  const catalogue = readCatalogue(dbUrl);
  const columns = readLocalColumns(dbUrl, ["campaigns", ...catalogue.map((t) => t.table)]);
  const campaignColumns = columns.get("campaigns") ?? [];

  const { tables, keptOut, missingInProduction } = await pullCampaignTables(remote, key, catalogue, columns, id, source);

  const campaign: Row = {};
  for (const [column, value] of Object.entries(campaignRow)) {
    if (!SECRET_COLUMN.test(column)) campaign[column] = value;
  }

  // The fixed-point prune. The campaign row takes part so that a current location
  // that was kept out is emptied rather than left dangling.
  const byTable: Record<string, Rows> = Object.fromEntries(tables.map((t) => [t.table, t.rows]));
  byTable.campaigns = [campaign];
  const report = pruneForeignRows(byTable, foreignKeyRules(dbUrl, tables, new Set(readExcludedTables(dbUrl)), source));
  for (const t of tables) t.rows = byTable[t.table];

  const references = await pullReferences(remote, key, dbUrl, tables);

  // Snapshot before import so the new copy cannot be selected for purging.
  const previous = previousCopies(dbUrl, owner, String(campaign.name), fresh);
  const mine = remapToFixture(byTable.campaigns[0], tables, source, owner);
  const ownTables = tables.map((t) => ({ ...t, rows: mine.rows.get(t.table) ?? [] }));
  const skipped = importCampaign(dbUrl, mine.campaign, campaignColumns, ownTables, references, false);
  // A failed import must leave the previous working copies intact.
  for (const old of previous) {
    sql(dbUrl, `select private.purge_demo_campaign(${quote(old)})`);
  }
  return {
    id: String(mine.campaign.id),
    name: String(campaign.name),
    keptOut,
    missingInProduction,
    skipped,
    pruned: report.pruned,
    detached: report.detached,
  };
}

async function copyHall(dbUrl: string, remote: URL, key: string, source: string, owner: string): Promise<number> {
  const rows = await remoteRows(remote, key, "hall_of_heroes", `user_id=eq.${source}`, "id");
  const columns = readLocalColumns(dbUrl, ["hall_of_heroes"]).get("hall_of_heroes") ?? [];
  runSqlFile(dbUrl, buildHallSql(rows, columns, owner, "fx_hall"));
  return rows.length;
}

function seedPlayerSide(dbUrl: string, campaignId: string) {
  const seat = seatPlayerFixture(dbUrl, campaignId);
  if (!seat) return null;
  runSqlFile(
    dbUrl,
    buildPlayerContentSql({
      campaignId,
      playerId: seat.playerId,
      partyMemberId: seat.characterId,
      journal: journalDrafts(JOURNAL_ENTRIES),
      monsterLimit: DISCOVERED_MONSTERS,
      recipeLimit: GRANTED_RECIPES,
    }),
  );
  const count = (table: string, where: string) => Number(sql(dbUrl, `select count(*) from public.${table} where ${where}`));
  return {
    character: seat.characterName,
    journal: count("player_journal_entries", `campaign_id = ${quote(campaignId)} and user_id = ${quote(seat.playerId)}`),
    monsters: count("discovered_monsters", `campaign_id = ${quote(campaignId)}`),
    grants: seat.characterId ? count("crafting_recipe_grants", `party_member_id = ${quote(seat.characterId)}`) : 0,
  };
}

const tally = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");

async function check(dbUrl: string, remote: URL, key: string, source: string): Promise<void> {
  const owner = fixtureId(dbUrl);
  const columns = readLocalColumns(dbUrl, MAIN_TABLES);
  const campaigns = await listOwnCampaigns(remote, key, source);
  console.log(`production: ${campaigns.length} campaign(s) the source account owns, excluding the template and demo copies`);
  for (const campaign of campaigns) {
    const name = String(campaign.name);
    const summary = await remoteSummary(remote, key, columns, source, String(campaign.id));
    console.log(`\n  "${name}"`);
    console.log(`    production would provide : ${describeCounts(Object.fromEntries(summary.map((s) => [s.table, s.kept])))}`);
    const keptOut = summary.filter((s) => s.total > s.kept).map((s) => `${s.table} ${s.total - s.kept}`);
    console.log(`    ownership rule keeps out : ${keptOut.length ? keptOut.join(", ") : "nothing in the main tables"}`);
    const copies = previousCopies(dbUrl, owner, name);
    console.log(`    ${FIXTURE_EMAIL} has : ${copies.length ? copies.map((c) => describeCounts(localCounts(dbUrl, c))).join(" | ") : "no copy"}`);
  }
  const hall = await remoteCount(remote, key, "hall_of_heroes", `user_id=eq.${source}`);
  const localHall = sql(dbUrl, `select count(*) from public.hall_of_heroes where user_id = ${quote(owner)}`);
  console.log(`\nhall of heroes: production ${hall}, fixture has ${localHall}`);
  console.log("\nRun without --check to pull, import, copy and seat.");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });

  const stack = readLocalStack();
  const remote = assertRemoteUrl(process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Run through `npm run dev:campaigns`, which loads .env.local.");

  const source = resolveSource(stack.DB_URL);
  if (values.check) return check(stack.DB_URL, remote, key, source);

  const owner = fixtureId(stack.DB_URL);
  const campaigns = await listOwnCampaigns(remote, key, source);
  if (campaigns.length === 0) throw new Error("The source account owns no campaigns in production besides the demo.");

  const copies: { imported: Imported; copyId: string; counts: Record<string, number> }[] = [];
  for (const row of campaigns) {
    const imported = await pullAndCopy(stack, remote, key, source, owner, row, new Set(copies.map((c) => c.copyId)));
    const copyId = imported.id;
    copies.push({ imported, copyId, counts: localCounts(stack.DB_URL, copyId) });
    console.log(`Copied "${imported.name}" to ${FIXTURE_EMAIL} as ${copyId}`);
  }

  const heroes = await copyHall(stack.DB_URL, remote, key, source, owner);

  const biggest = copies.reduce((a, b) => (total(b.counts) > total(a.counts) ? b : a));
  const player = seedPlayerSide(stack.DB_URL, biggest.copyId);

  console.log("\nSummary");
  for (const { imported, counts } of copies) {
    console.log(`  "${imported.name}": ${describeCounts(counts)}`);
    console.log(`    kept out by the ownership rule : ${tally(imported.keptOut) || "nothing"}`);
    for (const skip of imported.skipped) {
      console.log(`    skipped, refused by today's rules : ${skip.table} ${skip.count} (${skip.reason})`);
    }
    if (imported.missingInProduction.length) {
      console.log(`    not in production yet (local only) : ${imported.missingInProduction.join(", ")}`);
    }
    console.log(`    pruned (dangling foreign keys) : ${tally(imported.pruned) || "nothing"}`);
    console.log(`    emptied (column kept, row kept): ${tally(imported.detached) || "nothing"}`);
  }
  console.log(`  hall of heroes: ${heroes} copied`);
  console.log(
    player
      ? `  ${PLAYER_EMAIL}: seated in "${biggest.imported.name}"` +
          `${player.character ? `, playing ${player.character}` : ", no character to claim"}; ` +
          `${player.journal} journal entries, ${player.monsters} discovered monsters, ${player.grants} recipe grants`
      : `  No player seated: ${PLAYER_EMAIL} does not exist. Run \`npm run dev:auth\` and then this again.`,
  );
  console.log("\nSign in as the fixture and pick a campaign in the switcher. Run this again to refresh all of it.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
