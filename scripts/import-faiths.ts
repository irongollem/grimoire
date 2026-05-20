#!/usr/bin/env tsx
/**
 * Import a faiths/deities markdown file into a campaign's `deities` table.
 *
 * Usage:
 *   npm run import-faiths -- <markdown_path> [options]
 *
 * Or invoke directly:
 *   tsx --env-file=.env.local scripts/import-faiths.ts <md>
 *
 * Required env vars:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Flags:
 *   --campaign-id UUID         Target campaign (default: Kind Country).
 *   --user-id UUID             Target user (default: Kind Country owner).
 *   --dry-run                  Parse + plan; print summary; do not touch DB.
 *   --allow-duplicate-of NAME  Allow inserting a deity whose name is a substring
 *                              of an existing deity NAME (or vice versa). Repeatable.
 *   --verbose / -v             Verbose logging.
 *
 * Idempotency: matches existing deities by normalized name (case-insensitive,
 * whitespace-collapsed) within the campaign. Substring-name collisions are
 * BLOCKED with a warning unless `--allow-duplicate-of` is passed. See
 * `scripts/import-chapter-npcs.ts` for the same convention.
 *
 * No pantheon is created automatically — Sothery's design is "small faiths,
 * no orthodoxy". Add pantheons manually in the UI if a campaign needs them.
 *
 * Source format: `## Deity Name` headings at top level. Skips group sections
 * matching `SKIP_HEADING_PREFIXES` (e.g. "Folk and Margin Figures",
 * "A Note for Players"). See `scripts/lib/parse-faiths.ts` for details.
 */

import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DeityInsert } from "@/types/deity.types";

import {
  FOLK_AND_MARGIN_HEADING,
  PANTHEON_FOLK,
  PANTHEON_HEAVENLY,
  PANTHEON_LESSER,
  findPotentialDuplicates,
  isSkipHeading,
  normalizeName,
  parseClericDomains,
  parseFaith,
  parseFolkAndMargin,
  parsePreambleSuns,
  splitFaithBlocks,
  type FaithRecord,
} from "./lib/parse-faiths";
import {
  planForceOverwrite,
  planHasWrites,
  planRowMerge,
  summarisePlan,
  type FieldSpec,
  type RowMergePlan,
} from "./lib/merge-fields";
import {
  DEITY_RICHTEXT_FIELDS,
  PANTHEON_RICHTEXT_FIELDS,
  tiptapifyFields,
} from "./lib/tiptap";

/**
 * Field merge schema for deity enrichment. Only the fields the faiths parser
 * actually produces appear here — `symbol_image_url`, `portrait_*`, etc. are
 * deliberately untouched so the importer never overwrites manual UI work.
 *
 * `portfolio` is scalar (short one-sentence summary, not prose) — we don't
 * want to append a separator below a one-line summary.
 */
const DEITY_MERGE_FIELDS: Record<string, FieldSpec> = {
  titles: { kind: "scalar" },
  alignment: { kind: "scalar" },
  symbol: { kind: "scalar" },
  domains: { kind: "array" },
  portfolio: { kind: "scalar" },
  description: { kind: "prose" },
  dm_notes: { kind: "prose" },
  tags: { kind: "array" },
  // Pantheon FK is a scalar: existing-empty → fill from source; existing-set
  // → leave (so manual reassignment in the UI isn't clobbered by a re-import).
  pantheon_id: { kind: "scalar" },
};

// Kind Country defaults (same as the NPC importer).
const DEFAULT_USER_ID = "fc8ae595-641f-4127-87ad-03588f3710d1";
const DEFAULT_CAMPAIGN_ID = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";

interface CliArgs {
  markdown: string;
  campaignId: string;
  userId: string;
  dryRun: boolean;
  verbose: boolean;
  allowDuplicatesOf: Set<string>;
  /**
   * Per-record override: for names in this set, the importer uses
   * `planForceOverwrite` instead of the default `planRowMerge`. Existing user
   * content gets replaced with source values for every field in the merge
   * schema. Image-related columns are out of the schema and remain protected.
   * Intended for one-off "I made it up; please overwrite from canonical lore"
   * cases. Not a permanent rule change.
   */
  forceFromSource: Set<string>;
}

function parseCli(): CliArgs {
  const { values, positionals } = parseArgs({
    options: {
      "campaign-id": { type: "string" },
      "user-id": { type: "string" },
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

  return {
    markdown: positionals[0]!,
    campaignId: values["campaign-id"] ?? DEFAULT_CAMPAIGN_ID,
    userId: values["user-id"] ?? DEFAULT_USER_ID,
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
  const me = basename(process.argv[1] ?? "import-faiths.ts");
  console.log(`Usage: tsx --env-file=.env.local ${me} <markdown_path> [options]

Options:
  --campaign-id UUID         Target campaign (default: Kind Country)
  --user-id UUID             Target user (default: Kind Country owner)
  --allow-duplicate-of NAME  Allow inserting a deity whose name is a substring
                             of an existing deity NAME (or vice versa). Repeatable.
  --force-from-source NAME   For NAME, OVERWRITE existing field values from source
                             (instead of the default preserve-non-empty merge).
                             Image columns are protected by being outside the
                             merge schema. Repeatable. One-off override.
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

function createServiceClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via:\n" +
      "  tsx --env-file=.env.local scripts/import-faiths.ts ...",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface ExistingDeity {
  id: string;
  name: string;
  normalized: string;
  titles: string | null;
  alignment: string | null;
  symbol: string | null;
  domains: string[];
  portfolio: string | null;
  description: string | null;
  dm_notes: string | null;
  tags: string[];
  pantheon_id: string | null;
}

async function fetchExistingDeities(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
): Promise<ExistingDeity[]> {
  const { data, error } = await supabase
    .from("deities")
    .select("id, name, titles, alignment, symbol, domains, portfolio, description, dm_notes, tags, pantheon_id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    normalized: normalizeName(r.name as string),
    titles: (r.titles as string | null) ?? null,
    alignment: (r.alignment as string | null) ?? null,
    symbol: (r.symbol as string | null) ?? null,
    domains: (r.domains as string[] | null) ?? [],
    portfolio: (r.portfolio as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    dm_notes: (r.dm_notes as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    pantheon_id: (r.pantheon_id as string | null) ?? null,
  }));
}

/**
 * Deterministic placeholder UUIDs used by `ensurePantheons` in dry-run mode.
 * The shape is a valid v4-like UUID with a recognizable "DEAD/BEEF" middle so
 * any DB write attempting to use one would fail loudly. Exported for tests.
 */
export const DRY_RUN_PANTHEON_UUIDS: Record<string, string> = {
  "Heavenly Bodies":        "00000000-dead-4eef-8000-000000000001",
  "Lesser Deities":         "00000000-dead-4eef-8000-000000000002",
  "Folk and Margin Figures": "00000000-dead-4eef-8000-000000000003",
};

/**
 * Ensure the 3 canonical Sothery pantheons exist in this campaign. Matched by
 * `(user_id, campaign_id, name)` for idempotency. Returns a name→id map so
 * each FaithRecord can resolve its `pantheon` string to a `pantheon_id` FK.
 *
 * In `dryRun` mode, performs ZERO DB calls and returns deterministic
 * placeholder UUIDs. Required so `--dry-run` is contractually read-only —
 * the planning step still gets a name→id map and produces a coherent preview,
 * but no rows are ever written.
 */
export async function ensurePantheons(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  log: Logger,
  dryRun = false,
): Promise<Map<string, string>> {
  const want: Array<{ name: string; description: string; tags: string[] }> = [
    {
      name: PANTHEON_HEAVENLY,
      description:
        "The cosmological tier above and below the lesser deities. The Three Suns — gold, rose, and purple — are the high cosmology of Sothery; not directly worshipped by most peoples, and serving one is regarded with mild reverence and mild bafflement. The Saucer is the porcelain dish on which the country rests; venerated by some, nodded to by all, addressed in the way one addresses a room one is grateful to be inside.",
      tags: ["cosmology", "heavenly-bodies", "three-suns", "saucer"],
    },
    {
      name: PANTHEON_LESSER,
      description:
        "The small faiths most commonly named in the country. No church and no orthodoxy; most peoples honor a thing — a hearth, a slow kettle, a moth, a door — without ever quite calling it a god. Most peoples have one primary devotion, but no faith is exclusive. The country shares its faiths the way it shares its tea, with very little ceremony.",
      tags: ["lesser-deities", "small-faiths", "sothery"],
    },
    {
      name: PANTHEON_FOLK,
      description:
        "Figures the country talks about and sometimes prays to without quite admitting it. Not lesser deities exactly — they may be stories, they may be persons, they may be both. PC devotion to these figures is a session-zero conversation.",
      tags: ["folk-figures", "margin-figures", "session-zero"],
    },
  ];

  // Read-only fetch of existing pantheons (safe in both modes — SELECTs only).
  const { data: existing, error: fetchErr } = await supabase
    .from("pantheons")
    .select("id, name")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .in("name", want.map((w) => w.name));
  if (fetchErr) throw fetchErr;
  const byName = new Map<string, string>((existing ?? []).map((r) => [r.name as string, r.id as string]));

  const missing = want.filter((w) => !byName.has(w.name));
  if (missing.length === 0) {
    log.info(`ensurePantheons: all ${want.length} pantheons already exist; reusing`);
    return byName;
  }

  if (dryRun) {
    // Don't insert — substitute placeholder UUIDs for the missing pantheons.
    // Existing pantheons keep their real UUIDs so the dry-run merge plan is
    // accurate for already-assigned deities.
    log.info(`ensurePantheons: dry-run — ${missing.length} pantheon(s) would be inserted: ${missing.map((m) => m.name).join(", ")} (using placeholder UUIDs)`);
    for (const m of missing) byName.set(m.name, DRY_RUN_PANTHEON_UUIDS[m.name]!);
    return byName;
  }

  log.info(`ensurePantheons: inserting ${missing.length} new pantheon(s): ${missing.map((m) => m.name).join(", ")}`);
  const { data: inserted, error: insErr } = await supabase
    .from("pantheons")
    // `description` is a Tiptap-typed field — convert to Tiptap JSON at the
    // write boundary so the editor renders it correctly.
    .insert(missing.map((m) => tiptapifyFields({
      user_id: userId,
      campaign_id: campaignId,
      name: m.name,
      description: m.description,
      tags: m.tags,
    }, PANTHEON_RICHTEXT_FIELDS)))
    .select("id, name");
  if (insErr) throw insErr;
  for (const row of inserted ?? []) byName.set(row.name as string, row.id as string);
  return byName;
}

function recordToInsert(r: FaithRecord, campaignId: string, pantheonId: string | null): DeityInsert {
  return {
    campaign_id: campaignId,
    name: r.name,
    titles: r.titles,
    alternate_names: [],
    pantheon_id: pantheonId,
    alignment: r.alignment,
    symbol: r.symbol,
    symbol_image_url: null,
    portrait_url: null,
    portrait_focal_point: null,
    domains: r.domains,
    portfolio: r.portfolio,
    description: r.description || null,
    dm_notes: r.dm_notes,
    tags: r.tags,
    player_visible_to: [],
  } satisfies Omit<DeityInsert, never>;
}

async function main(): Promise<number> {
  const args = parseCli();
  const log = makeLogger(args.verbose);

  if (!existsSync(args.markdown)) {
    console.error(`ERROR: markdown file not found: ${args.markdown}`);
    return 1;
  }

  const text = readFileSync(args.markdown, "utf8");
  const blocks = splitFaithBlocks(text);
  log.info(`found ${blocks.length} top-level \`## \` blocks`);

  const skippedHeadings: string[] = [];
  const parsed: FaithRecord[] = [];
  const domainWarnings: Array<{ name: string; unknown: string[] }> = [];

  // Pass 1 — Three Suns from preamble (no markdown ## entries, content from campaign_book.md)
  const sunRecords = parsePreambleSuns(text);
  if (sunRecords.length > 0) {
    log.info(`parsePreambleSuns: produced ${sunRecords.length} sun records from preamble`);
    parsed.push(...sunRecords);
  }

  // Pass 2 — main ## blocks; Folk and Margin Figures routes to its dedicated sub-parser
  for (const { heading, body } of blocks) {
    if (isSkipHeading(heading)) {
      skippedHeadings.push(heading);
      continue;
    }
    if (heading === FOLK_AND_MARGIN_HEADING) {
      const folks = parseFolkAndMargin(body);
      log.info(`parseFolkAndMargin: produced ${folks.length} record(s) from "${heading}"`);
      parsed.push(...folks);
      continue;
    }
    const rec = parseFaith(heading, body);
    if (!rec) continue;
    parsed.push(rec);
    const { unknown } = parseClericDomains(body);
    if (unknown.length > 0) domainWarnings.push({ name: rec.name, unknown });
  }

  log.info(
    `parsed ${parsed.length} deities total; skipped ${skippedHeadings.length} non-deity headings (${skippedHeadings.join(", ") || "none"})`,
  );

  const supabase = createServiceClient();

  // Step 1 — ensure the 3 canonical pantheons exist (idempotent). Required
  // before planning, because every FaithRecord's `pantheon` string needs to
  // resolve to a `pantheon_id` UUID.
  //
  // In dry-run mode, this returns placeholder UUIDs without touching the DB
  // (so `--dry-run` is contractually read-only). The placeholders make it
  // through planning + log output unchanged; only the actual UPDATE/INSERT
  // statements would expand them to real IDs, and those don't run in dry-run.
  const pantheonByName = await ensurePantheons(supabase, args.userId, args.campaignId, log, args.dryRun);

  const existing = await fetchExistingDeities(supabase, args.userId, args.campaignId);
  log.info(`DB state: ${existing.length} existing deities in campaign`);

  const existingByNorm = new Map(existing.map((d) => [d.normalized, d]));
  const existingNormalizedSet = new Set(existing.map((d) => d.normalized));

  // Plan: 6 buckets — same enrich-merge model as the NPC importer, plus
  // a separate "force-overwrite" bucket for per-record --force-from-source.
  //  - toInsert: brand-new deities
  //  - toEnrich: existing rows with one or more fields to fill (default merge)
  //  - toForceOverwrite: existing rows overridden via --force-from-source
  //  - alreadyComplete: existing rows where source has nothing new to add
  //  - withConflicts: existing rows where source disagrees with user content
  //  - blocked: substring-name collisions (separate concern)
  const toInsert: FaithRecord[] = [];
  const toEnrich: Array<{ record: FaithRecord; existing: ExistingDeity; plan: RowMergePlan }> = [];
  const toForceOverwrite: Array<{ record: FaithRecord; existing: ExistingDeity; plan: RowMergePlan }> = [];
  const alreadyComplete: Array<{ record: FaithRecord; existing: ExistingDeity }> = [];
  const withConflicts: Array<{ record: FaithRecord; existing: ExistingDeity; plan: RowMergePlan }> = [];
  const blocked: Array<{ record: FaithRecord; existing: string[] }> = [];

  for (const r of parsed) {
    const pantheonId = pantheonByName.get(r.pantheon);
    if (!pantheonId) {
      log.warn(`  ! ${r.name}: pantheon "${r.pantheon}" did not resolve to a UUID — skipping`);
      continue;
    }
    const exact = existingByNorm.get(normalizeName(r.name));
    if (exact) {
      const sourcePayload: Record<string, unknown> = {
        titles: r.titles,
        alignment: r.alignment,
        symbol: r.symbol,
        domains: r.domains,
        portfolio: r.portfolio,
        description: r.description || null,
        dm_notes: r.dm_notes,
        tags: r.tags,
        pantheon_id: pantheonId,
      };
      const existingAsRow = exact as unknown as Record<string, unknown>;
      const useForceOverride = args.forceFromSource.has(normalizeName(r.name));

      const mergePlan = useForceOverride
        ? planForceOverwrite(existingAsRow, sourcePayload, DEITY_MERGE_FIELDS)
        : planRowMerge(existingAsRow, sourcePayload, DEITY_MERGE_FIELDS);

      if (useForceOverride) {
        if (planHasWrites(mergePlan)) {
          toForceOverwrite.push({ record: r, existing: exact, plan: mergePlan });
        } else {
          alreadyComplete.push({ record: r, existing: exact });
        }
      } else if (mergePlan.conflicts.length > 0) {
        withConflicts.push({ record: r, existing: exact, plan: mergePlan });
      } else if (planHasWrites(mergePlan)) {
        toEnrich.push({ record: r, existing: exact, plan: mergePlan });
      } else {
        alreadyComplete.push({ record: r, existing: exact });
      }
      continue;
    }
    const dups = findPotentialDuplicates(r.name, existingNormalizedSet);
    const allowed = dups.every((d) => args.allowDuplicatesOf.has(d));
    if (dups.length > 0 && !allowed) {
      blocked.push({ record: r, existing: dups });
      continue;
    }
    toInsert.push(r);
  }

  log.info(
    `plan: ${toInsert.length} new, ${toEnrich.length} to enrich, ` +
    `${toForceOverwrite.length} to FORCE-OVERWRITE (per --force-from-source), ` +
    `${alreadyComplete.length} already complete, ${withConflicts.length} with CONFLICTS, ${blocked.length} BLOCKED`,
  );
  for (const r of toInsert) {
    log.info(`  + INSERT ${r.name.padEnd(36)} domains=[${r.domains.join(",")}] tags=${r.tags.length}`);
  }
  for (const e of toEnrich) {
    log.info(`  ~ ENRICH ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
  }
  for (const e of toForceOverwrite) {
    log.warn(`  ! FORCE-OVERWRITE ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
    for (const field of e.plan.filled) {
      const oldV = (e.existing as unknown as Record<string, unknown>)[field];
      const newV = e.plan.updates[field];
      const oldS = typeof oldV === "string" ? (oldV as string).slice(0, 80) : JSON.stringify(oldV);
      const newS = typeof newV === "string" ? (newV as string).slice(0, 80) : JSON.stringify(newV);
      log.warn(`      ${field}: existing=${JSON.stringify(oldS)} → source=${JSON.stringify(newS)}`);
    }
  }
  for (const e of withConflicts) {
    log.warn(`  ! CONFLICT ${e.existing.name.padEnd(36)} ${summarisePlan(e.plan)}`);
    for (const c of e.plan.conflicts) {
      const ex = typeof c.existing === "string" ? (c.existing as string).slice(0, 80) : JSON.stringify(c.existing);
      const sr = typeof c.source === "string" ? (c.source as string).slice(0, 80) : JSON.stringify(c.source);
      log.warn(`      ${c.field}: existing=${JSON.stringify(ex)} | source=${JSON.stringify(sr)}`);
    }
  }
  for (const p of alreadyComplete) {
    log.debug(`  = already complete: ${p.record.name}`);
  }
  for (const b of blocked) {
    log.warn(
      `  ! BLOCKED ${b.record.name} looks like duplicate of: ${b.existing.join(", ")}. ` +
      `Re-run with --allow-duplicate-of="${b.existing[0]}" to force insert.`,
    );
  }
  for (const w of domainWarnings) {
    log.warn(`  ${w.name}: cleric-domain tokens not in ClericDomain enum: ${w.unknown.join(", ")} (dropped from insert)`);
  }

  if (toInsert.length === 0 && toEnrich.length === 0 && toForceOverwrite.length === 0) {
    log.info("nothing to write");
    return 0;
  }

  if (args.dryRun) {
    log.info("dry-run: not touching DB");
    console.log("=".repeat(60));
    console.log("DRY-RUN PLAN (not executed)");
    console.log("=".repeat(60));
    console.log(JSON.stringify({
      new_deities: toInsert.map((r) => ({
        name: r.name,
        domains: r.domains,
        portfolio: r.portfolio,
        description_len: r.description.length,
        tags: r.tags,
      })),
      enrich_existing: toEnrich.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        filled: e.plan.filled,
        appended: e.plan.appended,
        unioned: e.plan.unioned,
        unchanged: e.plan.unchanged,
        update_fields: Object.keys(e.plan.updates),
        previews: Object.fromEntries(
          Object.entries(e.plan.updates).map(([k, v]) => [
            k,
            typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…(${v.length}ch)` : v,
          ]),
        ),
      })),
      force_overwrite: toForceOverwrite.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        // Show before/after for every overwritten field so user can confirm.
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
        protected_outside_schema: ["symbol_image_url", "portrait_url", "portrait_focal_point"],
      })),
      conflicts: withConflicts.map((e) => ({
        name: e.existing.name,
        id: e.existing.id,
        details: e.plan.conflicts.map((c) => ({
          field: c.field,
          existing: typeof c.existing === "string" ? (c.existing as string).slice(0, 200) : c.existing,
          source: typeof c.source === "string" ? (c.source as string).slice(0, 200) : c.source,
        })),
      })),
      already_complete: alreadyComplete.map((p) => p.record.name),
      blocked: blocked.map((b) => ({
        candidate: b.record.name, looks_like_existing: b.existing,
      })),
    }, null, 2));
    return 0;
  }

  // Execute — UPDATE existing rows (enriches + force-overwrites use the same
  // UPDATE shape; only the plan-builder differed), then INSERT new rows.
  // Rich-text fields (description, dm_notes) are converted from plain markdown
  // to Tiptap JSON at this write boundary so they render correctly in the UI.
  let enrichedOk = 0;
  for (const entry of toEnrich) {
    const updates = tiptapifyFields(entry.plan.updates, DEITY_RICHTEXT_FIELDS);
    const { error } = await supabase
      .from("deities")
      .update(updates)
      .eq("id", entry.existing.id);
    if (error) {
      log.warn(`  enrich failed for ${entry.existing.name}: ${error.message}`);
    } else {
      enrichedOk++;
      log.debug(`  enriched ${entry.existing.name}: ${summarisePlan(entry.plan)}`);
    }
  }
  log.info(`enriched ${enrichedOk}/${toEnrich.length} existing deities`);

  let forcedOk = 0;
  for (const entry of toForceOverwrite) {
    const updates = tiptapifyFields(entry.plan.updates, DEITY_RICHTEXT_FIELDS);
    const { error } = await supabase
      .from("deities")
      .update(updates)
      .eq("id", entry.existing.id);
    if (error) {
      log.warn(`  force-overwrite failed for ${entry.existing.name}: ${error.message}`);
    } else {
      forcedOk++;
      log.debug(`  force-overwrote ${entry.existing.name}: ${summarisePlan(entry.plan)}`);
    }
  }
  if (toForceOverwrite.length > 0) {
    log.info(`force-overwrote ${forcedOk}/${toForceOverwrite.length} existing deities`);
  }

  if (toInsert.length > 0) {
    const payload = toInsert.map((r) => tiptapifyFields({
      ...recordToInsert(r, args.campaignId, pantheonByName.get(r.pantheon) ?? null),
      user_id: args.userId,
    }, DEITY_RICHTEXT_FIELDS));
    const { data, error } = await supabase
      .from("deities")
      .insert(payload)
      .select("id, name");
    if (error) throw error;
    log.info(`inserted ${data?.length ?? 0} new deities`);
    for (const row of data ?? []) log.debug(`  ${row.name} → ${row.id}`);
  }
  return 0;
}

// Only run as CLI when this file is the entry point — guards against tests
// (or other modules) that import `ensurePantheons` from this file triggering
// the CLI flow.
const invokedAsCli =
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedAsCli) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FATAL: ${msg}`);
      if (err instanceof Error && err.stack) console.error(err.stack);
      process.exit(2);
    },
  );
}
