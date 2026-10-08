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

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  FIXTURE_EMAIL,
  importCampaign,
  PLAYER_EMAIL,
  pullCampaignTables,
  pullReferences,
  readCatalogue,
  readLocalColumns,
  seatPlayerFixture,
} from "./lib/dev-campaign-io.ts";
import { quote, sql } from "./lib/dev-db.ts";
import { readLocalStack, remoteRows, assertRemoteUrl, type StackStatus } from "./lib/dev-stack.ts";

/** The fixture `dev-auth.ts` owns. Restated because that file is a script, not a module. */
const DEV_PASSWORD = "grimoire-local-dev";

async function pullTemplate(remote: URL, key: string, dbUrl: string) {
  const [campaign, ...extra] = await remoteRows(remote, key, "campaigns", "demo_template=is.true", "id");
  if (!campaign) throw new Error("Production has no demo template. Publish one in Admin → Content first.");
  if (extra.length) throw new Error("Production reports more than one demo template; refusing to guess.");
  const templateId = String(campaign.id);

  const catalogue = readCatalogue(dbUrl);
  const columns = readLocalColumns(dbUrl, ["campaigns", ...catalogue.map((t) => t.table)]);
  // The template is the maintainer's published demo, public by design: no ownership filter.
  const { tables } = await pullCampaignTables(remote, key, catalogue, columns, templateId, null);
  return { campaign, campaignColumns: columns.get("campaigns") ?? [], tables };
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

  const stack = readLocalStack();
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

  importCampaign(stack.DB_URL, campaign, campaignColumns, tables, references, true);
  console.log("Replaced the local template.");

  const copyId = await loadIntoFixture(stack);
  console.log(`Loaded it into ${FIXTURE_EMAIL} as campaign ${copyId}.`);

  const seat = seatPlayerFixture(stack.DB_URL, copyId);
  console.log(
    seat
      ? `Seated ${PLAYER_EMAIL} at it, playing ${seat.characterName ?? "no character (none to claim)"}.`
      : `No player seated: ${PLAYER_EMAIL} does not exist. Run \`npm run dev:auth\` and then this again.`,
  );
  console.log("\nSign in as the fixture and pick it in the campaign switcher. Run this again to refresh both.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
