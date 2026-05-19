#!/usr/bin/env tsx
/**
 * Import chapter NPC markdown into the Grimoire campaign DB.
 *
 * Usage:
 *   npm run import-chapter-npcs -- <markdown_path> --chapter <N> [--dry-run]
 *
 * Or invoke directly:
 *   tsx --env-file=.env.local scripts/import-chapter-npcs.ts <md> --chapter N
 *
 * Required env vars (read by the supabase client in `./lib/import-chapter-npcs-db.ts`):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Flags:
 *   --chapter N                Chapter number (required). Used for `chapter-N` tag.
 *   --config PATH              Sidecar JSON config (defaults to <markdown>.config.json).
 *   --campaign-id UUID         Target campaign (default: Kind Country).
 *   --user-id UUID             Target user (default: Kind Country owner).
 *   --default-parent NAME      Parent location for auto-created locations (default: "Sothery").
 *   --dry-run                  Parse + plan; print summary; do not touch DB.
 *   --verbose / -v             Verbose logging.
 *
 * Idempotency: matches existing NPCs and locations by normalized name
 * (case-insensitive, whitespace-collapsed) within the campaign. Re-runs are
 * safe. To intentionally insert a near-duplicate (e.g. an NPC with the same
 * first name as another), rename it in the source markdown's `## NAME` heading.
 *
 * See `scripts/lib/parse-chapter-npcs.ts` for the parsing logic and
 * `scripts/lib/import-chapter-npcs-db.ts` for DB interaction. The pure parser
 * has a vitest suite at `scripts/lib/parse-chapter-npcs.test.ts`.
 *
 * Format support: Ch1, Ch2, Ch3, Ch4, Ch5. The Prologue format (NPCs as `###`
 * under group `##` headings) is NOT supported — flagged & skipped.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseArgs } from "node:util";

import {
  applySidecar,
  findPotentialDuplicates,
  isSkipHeading,
  parseNpc,
  resolveLocationSpecs,
  splitNpcBlocks,
  normalizeName,
  type LocationSpec,
  type NpcRecord,
  type SidecarConfig,
} from "./lib/parse-chapter-npcs";
import {
  createServiceClient,
  enrichNpc,
  ensureLocations,
  fetchDbState,
  insertNpcs,
  NPC_MERGE_FIELDS,
  type ExistingNpc,
} from "./lib/import-chapter-npcs-db";
import {
  planForceOverwrite,
  planHasWrites,
  planRowMerge,
  summarisePlan,
  type RowMergePlan,
} from "./lib/merge-fields";

// Defaults for the Kind Country campaign.
const DEFAULT_USER_ID = "fc8ae595-641f-4127-87ad-03588f3710d1";
const DEFAULT_CAMPAIGN_ID = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";
const DEFAULT_PARENT_LOCATION = "Sothery";

interface CliArgs {
  markdown: string;
  chapter: number;
  configPath: string | null;
  campaignId: string;
  userId: string;
  defaultParent: string;
  dryRun: boolean;
  verbose: boolean;
  /** Normalized names the user has explicitly opted to insert despite a substring collision. */
  allowDuplicatesOf: Set<string>;
  /** Normalized names where --force-from-source overrides the preserve-non-empty rule. */
  forceFromSource: Set<string>;
}

function parseCli(): CliArgs {
  const { values, positionals } = parseArgs({
    options: {
      chapter: { type: "string" },
      config: { type: "string" },
      "campaign-id": { type: "string" },
      "user-id": { type: "string" },
      "default-parent": { type: "string" },
      "allow-duplicate-of": { type: "string", multiple: true },
      "force-from-source": { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  if (!values.chapter) {
    console.error("ERROR: --chapter is required");
    process.exit(1);
  }
  const chapter = Number(values.chapter);
  if (!Number.isFinite(chapter) || chapter < 0) {
    console.error(`ERROR: --chapter must be a non-negative number, got ${values.chapter}`);
    process.exit(1);
  }

  return {
    markdown: positionals[0]!,
    chapter,
    configPath: values.config ?? null,
    campaignId: values["campaign-id"] ?? DEFAULT_CAMPAIGN_ID,
    userId: values["user-id"] ?? DEFAULT_USER_ID,
    defaultParent: values["default-parent"] ?? DEFAULT_PARENT_LOCATION,
    dryRun: values["dry-run"] ?? false,
    verbose: values.verbose ?? false,
    allowDuplicatesOf: new Set(
      ((values["allow-duplicate-of"] as string[] | undefined) ?? []).map(normalizeName),
    ),
    forceFromSource: new Set(
      ((values["force-from-source"] as string[] | undefined) ?? []).map(normalizeName),
    ),
  };
}

function printUsage(): void {
  const me = basename(process.argv[1] ?? "import-chapter-npcs.ts");
  console.log(`Usage: tsx --env-file=.env.local ${me} <markdown_path> --chapter <N> [options]

Options:
  --chapter N                Chapter number (required)
  --config PATH              Sidecar JSON config (default: <markdown>.config.json next to MD)
  --campaign-id UUID         Target campaign (default: Kind Country)
  --user-id UUID             Target user (default: Kind Country owner)
  --default-parent NAME      Parent location name for new locations (default: Sothery)
  --allow-duplicate-of NAME  Allow inserting an NPC whose name is a substring
                             of an existing NPC NAME (or vice versa). Repeatable.
                             Default: warn + skip such cases.
  --force-from-source NAME   For NAME, OVERWRITE existing field values from source
                             (instead of the default preserve-non-empty merge).
                             Image columns (portrait_url, etc.) are protected by
                             being outside the merge schema. Repeatable.
  --dry-run                  Parse + plan; do not touch DB
  -v, --verbose              Verbose logging
  -h, --help                 This help`);
}

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug: (msg: string) => void;
}

function makeLogger(verbose: boolean): Logger {
  return {
    info: (msg) => console.log(`INFO: ${msg}`),
    warn: (msg) => console.warn(`WARN: ${msg}`),
    debug: (msg) => verbose && console.log(`DEBUG: ${msg}`),
  };
}

function loadSidecar(args: CliArgs, log: Logger): SidecarConfig {
  let path = args.configPath;
  if (!path) {
    const guess = args.markdown.replace(/\.md$/, ".config.json");
    if (existsSync(guess)) path = guess;
    else {
      // Look for repo-level config: scripts/chapter_npc_configs/chapter_<N>.json
      const repoDefault = resolve(__dirname, "chapter_npc_configs", `chapter_${args.chapter}.json`);
      if (existsSync(repoDefault)) path = repoDefault;
    }
  }
  if (!path) {
    log.info("no sidecar config; using auto-generated tags + defaults");
    return {};
  }
  if (!existsSync(path)) {
    log.warn(`config path not found: ${path}`);
    return {};
  }
  log.info(`loaded sidecar config: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as SidecarConfig;
}

interface EnrichEntry {
  record: NpcRecord;
  existing: ExistingNpc;
  plan: RowMergePlan;
}

interface Plan {
  records: NpcRecord[];
  locationSpecs: LocationSpec[];
  skippedHeadings: string[];
  npcsToInsert: NpcRecord[];
  /** Existing rows that need fields filled from source. */
  npcsToEnrich: EnrichEntry[];
  /** Existing rows targeted by --force-from-source: overwrite all non-image fields. */
  npcsToForceOverwrite: EnrichEntry[];
  /** Existing rows where every source field is already covered — true skip. */
  npcsAlreadyComplete: Array<{ record: NpcRecord; existing: ExistingNpc }>;
  /** Existing rows with one or more field conflicts — surfaced, not written. */
  npcsWithConflicts: EnrichEntry[];
  /** Possible substring-match duplicates. Not inserted unless --allow-duplicate-of given. */
  npcsBlocked: Array<{ record: NpcRecord; existing: string[] }>;
  locationsToCreate: LocationSpec[];
  locationsExisting: LocationSpec[];
}

function logPlan(plan: Plan, log: Logger): void {
  log.info(
    `plan: ${plan.locationsToCreate.length} new locations, ${plan.locationsExisting.length} existing reused, ` +
    `${plan.npcsToInsert.length} new NPCs, ${plan.npcsToEnrich.length} to enrich, ` +
    `${plan.npcsToForceOverwrite.length} to FORCE-OVERWRITE (per --force-from-source), ` +
    `${plan.npcsAlreadyComplete.length} already complete, ` +
    `${plan.npcsWithConflicts.length} with CONFLICTS, ${plan.npcsBlocked.length} BLOCKED`,
  );
  for (const s of plan.locationsToCreate) {
    log.info(`  + location: ${s.name} (key=${s.key}, type=${s.type}, parent=${s.parent_name ?? "none"})`);
  }
  for (const s of plan.locationsExisting) {
    log.info(`  = location exists: ${s.name} (key=${s.key})`);
  }
  for (const r of plan.npcsToInsert) {
    const race = (r.race || "?").slice(0, 32);
    log.info(
      `  + INSERT: ${r.name.padEnd(36)} race=${race.padEnd(34)} loc=${(r.location_key ?? "(none)").padEnd(14)} rel=${r.relationship}, ${r.tags.length} tags`,
    );
  }
  for (const e of plan.npcsToEnrich) {
    log.info(`  ~ ENRICH: ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
  }
  for (const e of plan.npcsToForceOverwrite) {
    log.warn(`  ! FORCE-OVERWRITE: ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
    for (const field of e.plan.filled) {
      const oldV = (e.existing as unknown as Record<string, unknown>)[field];
      const newV = e.plan.updates[field];
      const oldS = typeof oldV === "string" ? (oldV as string).slice(0, 80) : JSON.stringify(oldV);
      const newS = typeof newV === "string" ? (newV as string).slice(0, 80) : JSON.stringify(newV);
      log.warn(`      ${field}: existing=${JSON.stringify(oldS)} → source=${JSON.stringify(newS)}`);
    }
  }
  for (const e of plan.npcsWithConflicts) {
    log.warn(`  ! CONFLICT: ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
    for (const c of e.plan.conflicts) {
      const ex = typeof c.existing === "string" ? c.existing.slice(0, 60) : JSON.stringify(c.existing);
      const sr = typeof c.source === "string" ? c.source.slice(0, 60) : JSON.stringify(c.source);
      log.warn(`      ${c.field}: existing=${JSON.stringify(ex)} | source=${JSON.stringify(sr)}`);
    }
  }
  for (const { record: r, existing: existingNpc } of plan.npcsAlreadyComplete) {
    log.debug(`  = ALREADY COMPLETE: ${r.name} (db id=${existingNpc.id})`);
  }
  for (const blocked of plan.npcsBlocked) {
    log.warn(
      `  ! BLOCKED: ${blocked.record.name} looks like a duplicate of existing: ${blocked.existing.join(", ")}. ` +
      `Either rename in the markdown, merge manually, or re-run with --allow-duplicate-of="${blocked.existing[0]}"`,
    );
  }
  for (const r of plan.npcsToInsert) {
    if (r.tags.length < 8 || r.tags.length > 13) {
      log.warn(`${r.name}: ${r.tags.length} tags (target 8-13); consider sidecar override`);
    }
  }
}

async function main(): Promise<number> {
  const args = parseCli();
  const log = makeLogger(args.verbose);

  if (!existsSync(args.markdown)) {
    console.error(`ERROR: markdown file not found: ${args.markdown}`);
    return 1;
  }

  const config = loadSidecar(args, log);
  const text = readFileSync(args.markdown, "utf8");
  const blocks = splitNpcBlocks(text);
  log.info(`found ${blocks.length} top-level \`## \` blocks`);

  const defaultLocKey = config.default_location_key ?? null;
  const skippedHeadings: string[] = [];
  const records: NpcRecord[] = [];
  for (const { heading, body } of blocks) {
    if (isSkipHeading(heading)) {
      skippedHeadings.push(heading);
      continue;
    }
    const rec = parseNpc(heading, body, args.chapter, defaultLocKey);
    if (rec) records.push(rec);
  }
  log.info(
    `parsed ${records.length} NPCs; skipped ${skippedHeadings.length} non-NPC headings (${skippedHeadings.join(", ") || "none"})`,
  );

  applySidecar(records, config);
  const locationSpecs = resolveLocationSpecs(config, args.defaultParent);

  // Open DB connection
  const supabase = createServiceClient();
  const state = await fetchDbState(supabase, args.userId, args.campaignId);
  log.info(`DB state: ${state.npcs.length} existing NPCs, ${state.locations.length} existing locations in campaign`);

  // Plan: split by idempotency
  // 1. exact normalized name match -> compute merge plan:
  //      writes pending -> npcsToEnrich
  //      conflicts only  -> npcsWithConflicts (flagged, NOT written)
  //      nothing pending -> npcsAlreadyComplete (true skip)
  // 2. substring match (either direction) -> blocked (warn) unless explicitly allowed
  // 3. otherwise -> insert
  const npcsToInsert: NpcRecord[] = [];
  const npcsToEnrich: EnrichEntry[] = [];
  const npcsToForceOverwrite: EnrichEntry[] = [];
  const npcsAlreadyComplete: Array<{ record: NpcRecord; existing: ExistingNpc }> = [];
  const npcsWithConflicts: EnrichEntry[] = [];
  const npcsBlocked: Array<{ record: NpcRecord; existing: string[] }> = [];
  const existingNormalized = new Set(state.npcs.map((n) => n.normalized));
  for (const r of records) {
    const exactMatch = state.npcByNormalizedName.get(normalizeName(r.name));
    if (exactMatch) {
      const locName = r.location_key
        ? locationSpecs.find((s) => s.key === r.location_key)?.name
        : undefined;
      const locationId = locName ? state.locationByName.get(locName) ?? null : null;
      const sourcePayload: Record<string, unknown> = {
        race: r.race || null,
        occupation: r.occupation || null,
        appearance: r.appearance || null,
        personality: r.personality || null,
        backstory: r.backstory || null,
        notes: r.notes || null,
        status: r.status,
        relationship: r.relationship,
        relevance: r.relevance,
        tags: r.tags,
        location_id: locationId,
      };
      const existingRow = exactMatch as unknown as Record<string, unknown>;
      const useForceOverride = args.forceFromSource.has(normalizeName(r.name));

      const mergePlan = useForceOverride
        ? planForceOverwrite(existingRow, sourcePayload, NPC_MERGE_FIELDS)
        : planRowMerge(existingRow, sourcePayload, NPC_MERGE_FIELDS);

      if (useForceOverride) {
        if (planHasWrites(mergePlan)) {
          npcsToForceOverwrite.push({ record: r, existing: exactMatch, plan: mergePlan });
        } else {
          npcsAlreadyComplete.push({ record: r, existing: exactMatch });
        }
      } else if (mergePlan.conflicts.length > 0) {
        npcsWithConflicts.push({ record: r, existing: exactMatch, plan: mergePlan });
      } else if (planHasWrites(mergePlan)) {
        npcsToEnrich.push({ record: r, existing: exactMatch, plan: mergePlan });
      } else {
        npcsAlreadyComplete.push({ record: r, existing: exactMatch });
      }
      continue;
    }
    const dups = findPotentialDuplicates(r.name, existingNormalized);
    const allowed = dups.every((d) => args.allowDuplicatesOf.has(d));
    if (dups.length > 0 && !allowed) {
      npcsBlocked.push({ record: r, existing: dups });
      continue;
    }
    npcsToInsert.push(r);
  }
  const locationsToCreate: LocationSpec[] = [];
  const locationsExisting: LocationSpec[] = [];
  for (const s of locationSpecs) {
    if (state.locationByName.has(s.name)) locationsExisting.push(s);
    else locationsToCreate.push(s);
  }

  const plan: Plan = {
    records,
    locationSpecs,
    skippedHeadings,
    npcsToInsert,
    npcsToEnrich,
    npcsToForceOverwrite,
    npcsAlreadyComplete,
    npcsWithConflicts,
    npcsBlocked,
    locationsToCreate,
    locationsExisting,
  };
  logPlan(plan, log);

  if (
    npcsToInsert.length === 0 &&
    npcsToEnrich.length === 0 &&
    npcsToForceOverwrite.length === 0 &&
    locationsToCreate.length === 0
  ) {
    log.info("nothing to write");
    return 0;
  }

  if (args.dryRun) {
    log.info("dry-run: not touching DB");
    const summary = {
      new_locations: locationsToCreate.map((s) => ({
        name: s.name, type: s.type, parent: s.parent_name, tags: s.tags,
      })),
      new_npcs: npcsToInsert.map((r) => ({
        name: r.name,
        race: r.race,
        occupation: r.occupation,
        location_key: r.location_key,
        status: r.status,
        relationship: r.relationship,
        relevance: r.relevance,
        tags: r.tags,
        tag_count: r.tags.length,
        lens: {
          appearance_len: r.appearance.length,
          personality_len: r.personality.length,
          backstory_len: r.backstory.length,
          notes_len: r.notes.length,
        },
      })),
      enrich_existing_npcs: npcsToEnrich.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        filled: e.plan.filled,
        appended: e.plan.appended,
        unioned: e.plan.unioned,
        unchanged: e.plan.unchanged,
        update_fields: Object.keys(e.plan.updates),
      })),
      force_overwrite_npcs: npcsToForceOverwrite.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        overwrites: Object.fromEntries(
          e.plan.filled.map((field) => {
            const existingV = (e.existing as unknown as Record<string, unknown>)[field];
            const newV = e.plan.updates[field];
            const trunc = (x: unknown) =>
              typeof x === "string" && x.length > 200 ? `${x.slice(0, 200)}…(${x.length}ch)` : x;
            return [field, { from: trunc(existingV), to: trunc(newV) }];
          }),
        ),
        unchanged: e.plan.unchanged,
      })),
      conflicts: npcsWithConflicts.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        fields: e.plan.conflicts.map((c) => c.field),
        filled_anyway: [], // never write conflict fields
        details: e.plan.conflicts.map((c) => ({
          field: c.field,
          existing: typeof c.existing === "string" ? (c.existing as string).slice(0, 200) : c.existing,
          source: typeof c.source === "string" ? (c.source as string).slice(0, 200) : c.source,
        })),
      })),
      already_complete_npcs: npcsAlreadyComplete.map((p) => p.record.name),
      skipped_existing_locations: locationsExisting.map((s) => s.name),
      blocked_potential_duplicates: npcsBlocked.map((b) => ({
        candidate: b.record.name, looks_like_existing: b.existing,
      })),
    };
    console.log("=".repeat(60));
    console.log("DRY-RUN PLAN (not executed)");
    console.log("=".repeat(60));
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }

  // Execute — locations first (since enrichment may include location_id fills),
  // then enrich-merges, then new inserts.
  const locResult = await ensureLocations(supabase, args.userId, args.campaignId, locationSpecs, state);
  log.info(`created ${locResult.created.length} locations, reused ${locResult.reused.length}`);

  // Apply enrich-merges to existing NPCs. Issue updates one at a time so a
  // single failure doesn't roll back everything.
  let enrichedOk = 0;
  for (const entry of npcsToEnrich) {
    try {
      const row = await enrichNpc(supabase, entry.existing.id, entry.plan);
      enrichedOk++;
      log.debug(`  enriched ${row.name} (${row.id}): ${summarisePlan(entry.plan)}`);
    } catch (e) {
      log.warn(`  enrich failed for ${entry.existing.name}: ${(e as Error).message}`);
    }
  }
  log.info(`enriched ${enrichedOk}/${npcsToEnrich.length} existing NPCs`);

  let forcedOk = 0;
  for (const entry of npcsToForceOverwrite) {
    try {
      const row = await enrichNpc(supabase, entry.existing.id, entry.plan);
      forcedOk++;
      log.debug(`  force-overwrote ${row.name} (${row.id}): ${summarisePlan(entry.plan)}`);
    } catch (e) {
      log.warn(`  force-overwrite failed for ${entry.existing.name}: ${(e as Error).message}`);
    }
  }
  if (npcsToForceOverwrite.length > 0) {
    log.info(`force-overwrote ${forcedOk}/${npcsToForceOverwrite.length} existing NPCs`);
  }

  const inserted = await insertNpcs(supabase, args.userId, args.campaignId, npcsToInsert, locResult.byKey);
  log.info(`inserted ${inserted.length} new NPCs`);
  for (const row of inserted) log.debug(`  ${row.name} → ${row.id} (location_id=${row.location_id ?? "null"})`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FATAL: ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(2);
  },
);
