#!/usr/bin/env tsx
/**
 * Gives the local stack a document-import row already sitting in
 * `status: "review"`, with a realistic (wholly invented) `extracted` payload —
 * so the document-import REVIEW screen, in the settings wizard and in the
 * quest-paste panel, can be looked at (by a person or an agent) without first
 * spending a real AI extraction call.
 *
 * ## Why this is a script, not a seeded row in `seed.sql`
 *
 * `document_imports` rows expire (`expires_at`, 24h default) and are meant to
 * be transient — a row baked into the seed dump would either need constant
 * re-baking to avoid `document_imports_restart_extends_expiry` finding it
 * already stale, or would sit there mismatched from the campaign it names the
 * moment `db:pull` ran against a different admin dump. A script that computes
 * everything at run time — including which existing rows to dedupe against —
 * has neither problem. Same reasoning as `ensureFixtureQuest.ts`: synthetic
 * beats over a straight clone, because there is no source `document_imports`
 * row to clone from in the first place.
 *
 * ## Usage
 *
 *   npm run dev:import-fixture           # (re)create the fixture row
 *   npm run dev:import-fixture -- --clear  # remove this script's rows only
 *
 * Idempotent: re-running replaces the previous fixture import row (matched by
 * its fixed `display_name`) and the three fixture "Goblin" monsters (matched
 * by `source: FIXTURE_MONSTER_SOURCE_MARKER`), so a second run never leaves
 * two of either lying around.
 *
 * Loopback-only, same guard as `dev-auth.ts`'s `readStack` (duplicated here
 * rather than exported from it, so that file's sign-in flow stays the one
 * thing that owns it — see `dev-db.ts`'s own header for the same reasoning
 * about `sql`/`quote`).
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { quote, sql } from "./lib/dev-db.ts";
import {
  buildFixtureExtraction,
  FIXTURE_CAMPAIGN_GOBLINS,
  FIXTURE_IMPORT_DISPLAY_NAME,
  FIXTURE_MONSTER_SOURCE_MARKER,
  FIXTURE_SOURCE_TEXT,
  type OverlapNames,
} from "./dev-import-fixture.data.ts";

const FIXTURE_EMAIL = "dm-fixture@example.invalid";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

interface StackStatus {
  DB_URL: string;
}

/** Same guard as `dev-auth.ts`'s `readStack` — see that file for why this
 *  refuses anything that isn't the disposable local stack. */
function readStack(): StackStatus {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  } catch {
    throw new Error("Local stack is not running. Start it with `npm run db:start`.");
  }
  const status = JSON.parse(raw) as StackStatus;

  const host = new URL(status.DB_URL).hostname;
  if (!LOOPBACK.has(host)) {
    throw new Error(
      `Refusing to run: DB_URL points at ${host}, not loopback. ` +
        `This script only ever addresses the local disposable stack.`,
    );
  }
  return status;
}

/** The DM fixture's id, or null if `npm run dev:auth` has never been run. */
function findFixtureOwner(dbUrl: string): string | null {
  return sql(dbUrl, `select id from auth.users where email = ${quote(FIXTURE_EMAIL)} limit 1`) || null;
}

/** The fixture's own campaign — same lookup convention as
 *  `ensureFixtureQuest`/`ensureFixtureContent`: the owner's oldest campaign. */
function findFixtureCampaign(dbUrl: string, ownerId: string): string | null {
  return (
    sql(
      dbUrl,
      `select id from public.campaigns where user_id = ${quote(ownerId)} order by created_at limit 1`,
    ) || null
  );
}

// ── --clear ──────────────────────────────────────────────────────────────────

function clearFixture(dbUrl: string, ownerId: string, campaignId: string): void {
  const importsDeleted = sql(
    dbUrl,
    `with deleted as (
       delete from public.document_imports
        where user_id = ${quote(ownerId)}
          and campaign_id = ${quote(campaignId)}
          and display_name = ${quote(FIXTURE_IMPORT_DISPLAY_NAME)}
       returning id
     )
     select count(*) from deleted;`,
  );
  const monstersDeleted = sql(
    dbUrl,
    `with deleted as (
       delete from public.monsters
        where user_id = ${quote(ownerId)}
          and campaign_id = ${quote(campaignId)}
          and source = ${quote(FIXTURE_MONSTER_SOURCE_MARKER)}
       returning id
     )
     select count(*) from deleted;`,
  );
  console.log(
    `Cleared: ${importsDeleted} document import row(s), ${monstersDeleted} fixture Goblin(s).`,
  );
}

// ── Dedupe overlap ───────────────────────────────────────────────────────────

/**
 * A transform that is *guaranteed* to normalize back to the same key as
 * `name`, whatever `name` actually is — `normalizeEntityName`
 * (`src/lib/documentImport/entityName.ts`) lowercases unconditionally, strips
 * exactly one leading article, and collapses whitespace, so any of those three
 * transforms round-trips for every input. Pluralisation does NOT round-trip in
 * general (it only reverses correctly for names whose trailing word the
 * normalizer already expects), which is why it is not used here even though
 * the task this fixture serves mentions it as one option — a name read off a
 * live campaign is arbitrary, and a variant that might silently fail to match
 * would defeat the point of seeding it.
 */
function articleVariant(name: string): string {
  return /^(a|an|the)\s/i.test(name) ? name.toUpperCase() : `The ${name}`;
}

function firstTwoNames(dbUrl: string, query: string): [string, string] {
  const rows = sql(dbUrl, query).split("\n").filter(Boolean);
  const first = rows[0] ?? "Someone Already Known";
  const second = rows[1] ?? rows[0] ?? "Somewhere Already Known";
  return [first, second];
}

function computeOverlap(dbUrl: string, campaignId: string): OverlapNames {
  const [npcA, npcB] = firstTwoNames(
    dbUrl,
    `select name from public.npcs where campaign_id = ${quote(campaignId)} order by name limit 2`,
  );
  const [locA, locB] = firstTwoNames(
    dbUrl,
    `select name from public.locations where campaign_id = ${quote(campaignId)} order by name limit 2`,
  );
  const [facA, facB] = firstTwoNames(
    dbUrl,
    `select name from public.factions where campaign_id = ${quote(campaignId)} order by name limit 2`,
  );

  return {
    npcExact: npcA,
    npcVariant: npcB.toUpperCase(),
    locationExact: locA,
    locationVariant: articleVariant(locB),
    factionExact: facA,
    // A third safe transform (extra internal whitespace — `normalizeEntityName`
    // collapses any run of it) so all three overlap kinds exercise a different
    // one rather than repeating case or article stripping three times over.
    factionVariant: facB.replace(/ /g, "  "),
  };
}

// ── Library sources ──────────────────────────────────────────────────────────

/**
 * Ensures the fixture campaign has *some* monster source enabled, so "Goblin"
 * and "Giant Rats" actually have a library candidate to match against. Reuses
 * `dev-auth.ts`'s `ensureFixtureBestiary` outcome when it already ran (the
 * fixture campaign normally has sources from that script); if a campaign
 * somehow has none, this enables every source this machine's `library_monsters`
 * actually has rows for — the "core SRD keys present in library_monsters.source
 * locally" fallback, rather than guessing at a slug that might not be seeded
 * here at all.
 */
function ensureLibrarySources(dbUrl: string, campaignId: string): string[] {
  const already = sql(
    dbUrl,
    `select source_slug from public.campaign_enabled_sources where campaign_id = ${quote(campaignId)} order by source_slug`,
  )
    .split("\n")
    .filter(Boolean);
  if (already.length > 0) return already;

  sql(
    dbUrl,
    `insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
     select ${quote(campaignId)}, m.source, coalesce(max(cs.title), m.source)
       from public.library_monsters m
       left join public.content_sources cs on cs.key = m.source
      where m.source is not null
      group by m.source
     on conflict do nothing;`,
  );

  return sql(
    dbUrl,
    `select source_slug from public.campaign_enabled_sources where campaign_id = ${quote(campaignId)} order by source_slug`,
  )
    .split("\n")
    .filter(Boolean);
}

// ── The fixture monsters ─────────────────────────────────────────────────────

/** Three campaign-owned "Goblin" rows so the review's monster candidate list
 *  is a real A/B/C choice, not a single card. Deleted and reinserted every
 *  run — see `clearFixture` for the same marker used to find them again. */
function ensureFixtureGoblins(dbUrl: string, ownerId: string, campaignId: string): number {
  sql(
    dbUrl,
    `delete from public.monsters
      where user_id = ${quote(ownerId)}
        and campaign_id = ${quote(campaignId)}
        and source = ${quote(FIXTURE_MONSTER_SOURCE_MARKER)};`,
  );

  for (const goblin of FIXTURE_CAMPAIGN_GOBLINS) {
    sql(
      dbUrl,
      `insert into public.monsters
         (user_id, campaign_id, name, monster_type, size, alignment, tags, stat_block, notes, source)
       values (
         ${quote(ownerId)}, ${quote(campaignId)}, 'Goblin', ${quote(goblin.monster_type)},
         ${quote(goblin.size)}, ${quote(goblin.alignment)}, ${quote(`{${goblin.tags.join(",")}}`)}::text[],
         ${quote(JSON.stringify(goblin.stat_block))}::jsonb, ${quote(goblin.notes)},
         ${quote(FIXTURE_MONSTER_SOURCE_MARKER)}
       );`,
    );
  }

  return Number(
    sql(
      dbUrl,
      `select count(*) from public.monsters
        where user_id = ${quote(ownerId)} and campaign_id = ${quote(campaignId)}
          and source = ${quote(FIXTURE_MONSTER_SOURCE_MARKER)}`,
    ),
  );
}

// ── The document_imports row itself ─────────────────────────────────────────

function warnAboutOtherUnfinishedImports(dbUrl: string, ownerId: string, campaignId: string): void {
  const other = sql(
    dbUrl,
    `select display_name, status from public.document_imports
      where user_id = ${quote(ownerId)} and campaign_id = ${quote(campaignId)}
        and display_name <> ${quote(FIXTURE_IMPORT_DISPLAY_NAME)}
        and status in ('pending','extracting','review','failed')
      order by created_at desc limit 1`,
  );
  if (!other) return;
  const [otherName, otherStatus] = other.split("\t");
  console.warn(
    `Warning: this campaign already has another unfinished import ("${otherName}", ${otherStatus}) ` +
      `not created by this script — left alone. Only one unfinished import surfaces in the ` +
      `wizard at a time, so it (not the fixture row) may be what the DM sees first.`,
  );
}

function replaceFixtureImportRow(
  dbUrl: string,
  ownerId: string,
  campaignId: string,
  overlap: OverlapNames,
): string {
  sql(
    dbUrl,
    `delete from public.document_imports
      where user_id = ${quote(ownerId)} and campaign_id = ${quote(campaignId)}
        and display_name = ${quote(FIXTURE_IMPORT_DISPLAY_NAME)};`,
  );

  const extracted = buildFixtureExtraction(overlap);
  const provenance = {
    generatorType: "document-import-dev-fixture",
    provider: "dev-fixture",
    // Deliberately not a real provider/model string — nobody reading this row
    // should mistake it for an actual generation.
    model: "none — hand-authored by scripts/dev-import-fixture.ts, no AI call made",
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  // Wrapped as a CTE + trailing SELECT, not a bare `insert ... returning id`:
  // psql's `-At` suppresses a SELECT's row-count footer but not an INSERT's
  // own command tag ("INSERT 0 1"), which otherwise lands right in the
  // captured id — see `clearFixture` above for the same pattern on `delete`.
  return sql(
    dbUrl,
    `with ins as (
       insert into public.document_imports (
         user_id, campaign_id, source_kind, source_paths, display_name, page_count,
         status, extracted, imported_counts, rights_attested_at, ai_provenance, source_text
       ) values (
         ${quote(ownerId)}, ${quote(campaignId)}, 'text', '{}'::text[],
         ${quote(FIXTURE_IMPORT_DISPLAY_NAME)}, 1, 'review',
         ${quote(JSON.stringify(extracted))}::jsonb, '{}'::jsonb, now(),
         ${quote(JSON.stringify(provenance))}::jsonb, ${quote(FIXTURE_SOURCE_TEXT)}
       )
       returning id
     )
     select id from ins;`,
  );
}

function countExtracted(extracted: ReturnType<typeof buildFixtureExtraction>): string {
  return Object.entries(extracted)
    .map(([kind, entities]) => `${entities.length} ${kind}`)
    .join(", ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: { clear: { type: "boolean", default: false } },
    allowPositionals: false,
  });

  const stack = readStack();
  const ownerId = findFixtureOwner(stack.DB_URL);
  if (!ownerId) {
    console.error(`No ${FIXTURE_EMAIL} account found. Run \`npm run dev:auth\` first.`);
    process.exit(1);
  }
  const campaignId = findFixtureCampaign(stack.DB_URL, ownerId);
  if (!campaignId) {
    console.error(
      `${FIXTURE_EMAIL} has no campaign yet. Run \`npm run dev:auth\` first (it clones one).`,
    );
    process.exit(1);
  }

  if (values.clear) {
    clearFixture(stack.DB_URL, ownerId, campaignId);
    return;
  }

  warnAboutOtherUnfinishedImports(stack.DB_URL, ownerId, campaignId);

  const sources = ensureLibrarySources(stack.DB_URL, campaignId);
  const goblinCount = ensureFixtureGoblins(stack.DB_URL, ownerId, campaignId);
  const overlap = computeOverlap(stack.DB_URL, campaignId);
  const extracted = buildFixtureExtraction(overlap);
  const rowId = replaceFixtureImportRow(stack.DB_URL, ownerId, campaignId, overlap);

  console.log(`Document import fixture ready.\n`);
  console.log(`  row id      ${rowId}`);
  console.log(`  campaign id ${campaignId}`);
  console.log(`  extracted   ${countExtracted(extracted)}`);
  console.log(`  goblins     ${goblinCount} campaign-owned (CR 1/4, 1, 2) tagged "${FIXTURE_MONSTER_SOURCE_MARKER}"`);
  console.log(`  sources     ${sources.join(", ") || "(none enabled — library matches will come up empty)"}`);
  console.log(
    `  dedupe      npcs: "${overlap.npcExact}" / "${overlap.npcVariant}"; ` +
      `locations: "${overlap.locationExact}" / "${overlap.locationVariant}"; ` +
      `factions: "${overlap.factionExact}" / "${overlap.factionVariant}"`,
  );
  console.log(`\nCosts nothing — no AI call was made. Remove it with \`npm run dev:import-fixture -- --clear\`.\n`);
  console.log(`To look at it:`);
  console.log(`  1. npm run dev:auth   (if you haven't already — sets the dev password)`);
  console.log(`  2. npm run dev        (start the app)`);
  console.log(`  3. Sign in as ${FIXTURE_EMAIL} / grimoire-local-dev at http://localhost:5173`);
  console.log(`  4. EITHER: Campaign Settings -> Import (the wizard picks up the active row itself)`);
  console.log(`     OR, for the quest paste panel: open /quests/new -> "Paste a page", then in devtools:`);
  console.log(
    `       sessionStorage.setItem("grimoire:quest-paste-import:${campaignId}", "${rowId}")`,
  );
  console.log(`     and reload the panel.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
