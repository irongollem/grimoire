#!/usr/bin/env tsx
/**
 * Imports a setting book's markdown stat blocks (`::: statblock` ... `:::`) as
 * monsters of one campaign (epic #1115), so the book can embed them and the DM can
 * run them. The parsing and the row shape live in `lib/statblockMarkdown.ts`.
 *
 * Usage:
 *   npm run import-statblocks -- --dry-run                      # local stack, writes nothing
 *   npm run import-statblocks                                   # write to the local stack
 *   npm run import-statblocks -- --dir <folder> --campaign-id <uuid> --user-id <uuid> --source "<book>"
 *   npm run import-statblocks -- --production --dry-run         # read production, write nothing
 *   npm run import-statblocks -- --production --yes-production  # write to production
 *
 * Idempotent by normalised name within the campaign: an existing monster of that name
 * has its stat block, type, size, alignment, ruleset and source replaced (its art,
 * tags and notes stay); anything else is inserted. Writes go through the service role
 * but name the campaign owner as `user_id`, and the script refuses a campaign that
 * owner does not own. The default target is the local stack and anything but
 * loopback is refused; production needs both --production and --yes-production.
 * Output never includes a key.
 *
 * --art (after the import step, so a new monster gets its picture in the same run):
 * reads the bestiary art map (--art-map, a `| Monster | Existing | Alt |` table) and
 * puts each matched monster's picture on its row, because the book embeds the stat
 * block and draws the monster's own `image_url`. `Existing` then `Alt` are resolved
 * like the book's art slots (`campaign-npc: <Name>` reuses that NPC's portrait URL;
 * `art-955/...` is a file under --desktop-dir; anything else is under --source-dir).
 * A file is resized, marked as AI-generated and stored in `monster-images/<owner>/
 * <sha256>.webp` (R2 + CDN URL in production, local Storage otherwise), with an
 * `image_provenance` row. A monster whose `image_url` is already something else is
 * skipped unless --replace-art. A row whose file is not painted yet is reported as
 * pending; run again later. The focal point is left alone.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { r2ConfigFrom } from "../supabase/functions/_shared/r2/config.ts";
import { type PreparedImage, type Storage, localStorage, prepareImage, r2Storage, writeProvenance } from "./lib/bookImages.ts";
import { assertCampaignOwner, loadNpcPortraits, readAll, request } from "./lib/campaignRest.ts";
import { pooled } from "./lib/pool.ts";
import { expandHome, resolveArtSlot } from "./lib/scriptoriumBook.ts";
import { type Target, resolveTarget } from "./stat-blocks/rows.ts";
import { DEFAULT_SOURCE, type MonsterRowFields, StatblockParseError, normalizeName, parseBestiaryArtMap, parseStatblockFile } from "./lib/statblockMarkdown.ts";

const DEFAULT_DIR = "~/Documents/Claude/Projects/Sothery Book I - manuscript/data/statblocks/";
const DEFAULT_ART_MAP = "~/Documents/Claude/Projects/Sothery Book I - manuscript/data/bestiary-art.md";
const DEFAULT_SOURCE_DIR = "~/Documents/Claude/Projects/Late in the Kind Country - stay as long as you like/";
const DEFAULT_DESKTOP_DIR = "~/Desktop";
const ART_BUCKET = "monster-images";
const DEFAULT_CAMPAIGN = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";
const DEFAULT_OWNER = "fc8ae595-641f-4127-87ad-03588f3710d1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ExistingMonster {
  id: string;
  name: string;
}

type Outcome =
  | { file: string; name: string; action: "insert" | "update"; id?: string }
  | { file: string; name?: string; action: "skip"; reason: string };



async function existingMonsters(target: Target, campaignId: string): Promise<Map<string, ExistingMonster[]>> {
  const byName = new Map<string, ExistingMonster[]>();
  const rows = await readAll<ExistingMonster>(target, `monsters?campaign_id=eq.${campaignId}&select=id,name`);
  for (const row of rows) {
    const key = normalizeName(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return byName;
}

function updatePayload(row: MonsterRowFields): Record<string, unknown> {
  return {
    stat_block: row.stat_block,
    monster_type: row.monster_type,
    size: row.size,
    alignment: row.alignment,
    ruleset: row.ruleset,
    source: row.source,
    // `notes` is deliberately absent: they are the DM's own and a re-import never overwrites them.
  };
}

interface MonsterArtRow {
  id: string | undefined;
  name: string;
  image_url: string | null;
}

interface ArtOptions {
  mapPath: string;
  sourceDir: string;
  desktopDir: string;
  replace: boolean;
  dryRun: boolean;
  production: boolean;
  campaignId: string;
  userId: string;
}

/** The art step: see the header. Returns the number of failed writes. */
async function applyArt(target: Target, monsters: MonsterArtRow[], opts: ArtOptions): Promise<number> {
  const map = parseBestiaryArtMap(readFileSync(opts.mapPath, "utf8"));
  const { portraits } = await loadNpcPortraits(target, opts.campaignId);
  const lookups = { npcPortraits: portraits, fileExists: existsSync, desktopDir: opts.desktopDir, sourceDir: opts.sourceDir };
  const byName = new Map<string, MonsterArtRow[]>();
  for (const m of monsters) byName.set(normalizeName(m.name), [...(byName.get(normalizeName(m.name)) ?? []), m]);

  const storage: Storage = opts.production
    ? r2Storage(r2ConfigFrom((k) => process.env[k]), process.env.ASSET_CDN_URL?.trim() || null, ART_BUCKET)
    : localStorage(target, ART_BUCKET);
  if (opts.production && !opts.dryRun) {
    if (r2ConfigFrom((k) => process.env[k]) === null) throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
    if (!process.env.ASSET_CDN_URL?.trim()) throw new Error("ASSET_CDN_URL is not set.");
  }

  // A production dry run may have no CDN base; it prints the storage key rather than throwing,
  // and recognises a monster already on that object by the key its URL ends in.
  const cdnUnknown = opts.dryRun && opts.production && !process.env.ASSET_CDN_URL?.trim();
  const urlFor = (path: string) => (cdnUnknown ? `(planned) ${ART_BUCKET}/${path}` : storage.url(path));
  const alreadyOn = (current: string | null, url: string | null, image: PreparedImage | undefined) =>
    current === url || (cdnUnknown && !!image && !!current?.endsWith(`/${image.path}`));

  type Plan = { monster: MonsterArtRow; via: string; url: string | null; image?: PreparedImage };
  const plans: Plan[] = [];
  const pending: string[] = [];
  const noMonster: string[] = [];
  const keptOwn: string[] = [];
  const ambiguous: string[] = [];
  let unchanged = 0;

  const resolved: { monster: MonsterArtRow; resolved: NonNullable<ReturnType<typeof resolveArtSlot>> }[] = [];
  for (const row of map) {
    const matches = byName.get(normalizeName(row.name)) ?? [];
    if (matches.length === 0) {
      noMonster.push(row.name);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(`${row.name} (${matches.length} monsters share the name)`);
      continue;
    }
    const art = resolveArtSlot({ slug: row.name, size: "full", existing: row.existing, alt: row.alt }, lookups);
    if (!art) {
      pending.push(`${row.name} (${row.existing ?? row.alt ?? "no source"})`);
      continue;
    }
    resolved.push({ monster: matches[0], resolved: art });
  }

  // Prepare each distinct file once (its URL is fixed by its content hash), then decide per monster.
  const files = [...new Set(resolved.flatMap((r) => (r.resolved.kind === "file" ? [r.resolved.path] : [])))];
  const prepared = new Map<string, PreparedImage>();
  await pooled(files, 4, async (file) => {
    prepared.set(file, await prepareImage(file, opts.userId));
  });
  for (const { monster, resolved: art } of resolved) {
    const image = art.kind === "file" ? prepared.get(art.path) : undefined;
    const url = art.kind === "url" ? art.url : image ? urlFor(image.path) : null;
    if (alreadyOn(monster.image_url, url, image)) {
      unchanged++;
    } else if (monster.image_url && !opts.replace) {
      keptOwn.push(monster.name);
    } else {
      plans.push({ monster, via: art.via, url, image });
    }
  }

  let written = 0;
  let uploaded = 0;
  let reused = 0;
  const failures: string[] = [];
  if (!opts.dryRun) {
    // One upload per object, shared by every monster that uses it: a PATCH waits for it and
    // fails with it, so no monster points at an object that never landed.
    const uploads = new Map<string, Promise<void>>();
    const ensureUploaded = (image: PreparedImage): Promise<void> => {
      let upload = uploads.get(image.path);
      if (!upload) {
        upload = (async () => {
          if (await storage.has(image.path)) reused++;
          else {
            await storage.put(image.path, image.bytes);
            uploaded++;
          }
          await writeProvenance(target, ART_BUCKET, image, opts.userId);
        })();
        uploads.set(image.path, upload);
      }
      return upload;
    };
    await pooled(plans, 4, async (plan) => {
      try {
        if (plan.image) await ensureUploaded(plan.image);
        if (!plan.monster.id) throw new Error("monster row has no id");
        await request(target, "PATCH", `monsters?id=eq.${plan.monster.id}&campaign_id=eq.${opts.campaignId}`, { image_url: plan.url });
        written++;
      } catch (error) {
        failures.push(`${plan.monster.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    });
  }

  const section = (title: string, items: string[]) => {
    if (items.length) console.log(`\n${title} (${items.length}):\n${items.map((i) => `  - ${i}`).join("\n")}`);
  };
  console.log(`\nArt map ${map.length} row(s), campaign monsters ${monsters.length}.`);
  console.log(
    opts.dryRun
      ? `Art: would set ${plans.length} (${plans.filter((p) => p.image).length} from files, ${plans.filter((p) => !p.image).length} NPC portraits), unchanged ${unchanged}, pending ${pending.length}. Dry run: nothing written.`
      : `Art: set ${written} (uploaded ${uploaded} image(s), reused ${reused}), unchanged ${unchanged}, pending ${pending.length}.`,
  );
  section("Pending (picture not available yet; run again later)", pending);
  section("Kept their own art (use --replace-art to overwrite)", keptOwn);
  section("No monster of this name in the campaign", noMonster);
  section("Ambiguous names (skipped)", ambiguous);
  section("Failed", failures);
  return failures.length;
}

function printSummary(outcomes: Outcome[], dryRun: boolean): void {
  const count = (action: Outcome["action"]) => outcomes.filter((o) => o.action === action).length;
  for (const o of outcomes) {
    if (o.action === "skip") console.log(`  ${"skip".padEnd(13)} ${o.file}: ${o.reason}`);
    else {
      const label = dryRun ? `would ${o.action}` : o.action === "insert" ? "inserted" : "updated";
      console.log(`  ${label.padEnd(13)} ${o.file}: ${o.name}`);
    }
  }
  const parsed = outcomes.filter((o) => o.action !== "skip" || o.name !== undefined).length;
  console.log(
    `\nFiles ${outcomes.length}, parsed ${parsed}, ${dryRun ? "to insert" : "inserted"} ${count("insert")}, ` +
      `${dryRun ? "to update" : "updated"} ${count("update")}, skipped ${count("skip")}.${dryRun ? " Dry run: nothing written." : ""}`,
  );
}

async function artRows(target: Target, campaignId: string): Promise<MonsterArtRow[]> {
  return readAll<MonsterArtRow>(target, `monsters?campaign_id=eq.${campaignId}&select=id,name,image_url`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: DEFAULT_DIR },
      "campaign-id": { type: "string", default: DEFAULT_CAMPAIGN },
      "user-id": { type: "string", default: DEFAULT_OWNER },
      source: { type: "string", default: DEFAULT_SOURCE },
      art: { type: "boolean", default: false },
      "replace-art": { type: "boolean", default: false },
      "art-map": { type: "string", default: DEFAULT_ART_MAP },
      "source-dir": { type: "string", default: DEFAULT_SOURCE_DIR },
      "desktop-dir": { type: "string", default: DEFAULT_DESKTOP_DIR },
      "dry-run": { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"];
  const campaignId = values["campaign-id"];
  const userId = values["user-id"];
  if (!UUID.test(campaignId) || !UUID.test(userId)) throw new Error("--campaign-id and --user-id must be UUIDs.");
  if (values.production && !dryRun && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --production --yes-production, or --dry-run).");
  }

  if (values["replace-art"] && !values.art) throw new Error("--replace-art only means something with --art.");

  const dir = resolve(expandHome(values.dir));
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files in ${dir}.`);

  // resolveTarget refuses anything but loopback unless --production is given.
  const target = resolveTarget(values.production);
  console.log(`${dryRun ? "Planning for" : "Writing to"} ${target.label}, campaign ${campaignId}, ${files.length} file(s) in ${dir}.`);
  await assertCampaignOwner(target, campaignId, userId);
  const existing = await existingMonsters(target, campaignId);
  const seen = new Set<string>();
  const outcomes: Outcome[] = [];
  let failed = 0;

  for (const file of files) {
    let row: MonsterRowFields;
    try {
      row = parseStatblockFile(readFileSync(join(dir, file), "utf8"), values.source);
    } catch (error) {
      if (!(error instanceof StatblockParseError)) throw error;
      outcomes.push({ file, action: "skip", reason: error.message });
      continue;
    }
    const key = normalizeName(row.name);
    if (seen.has(key)) {
      outcomes.push({ file, name: row.name, action: "skip", reason: "another file already defines this name" });
      continue;
    }
    seen.add(key);

    const matches = existing.get(key) ?? [];
    if (matches.length > 1) {
      outcomes.push({ file, name: row.name, action: "skip", reason: `${matches.length} monsters in the campaign share this name` });
      continue;
    }
    const match = matches[0];
    if (dryRun) {
      outcomes.push({ file, name: row.name, action: match ? "update" : "insert", id: match?.id });
      continue;
    }
    try {
      if (match) {
        await request(target, "PATCH", `monsters?id=eq.${match.id}&campaign_id=eq.${campaignId}`, updatePayload(row));
        outcomes.push({ file, name: row.name, action: "update", id: match.id });
      } else {
        const { stat_block, name, monster_type, size, alignment, tags, ruleset, source, notes } = row;
        const created = (await request(target, "POST", "monsters", {
          user_id: userId,
          campaign_id: campaignId,
          name,
          monster_type,
          size,
          alignment,
          tags,
          ruleset,
          source,
          notes,
          stat_block,
        })) as { id: string }[];
        outcomes.push({ file, name: row.name, action: "insert", id: created[0]?.id });
      }
    } catch (error) {
      failed++;
      outcomes.push({ file, name: row.name, action: "skip", reason: error instanceof Error ? error.message : "write failed" });
    }
  }

  printSummary(outcomes, dryRun);
  if (values.art) {
    let monsters: MonsterArtRow[];
    if (dryRun) {
      // Planned inserts do not exist yet; they are planned alongside the rows already there.
      const planned = outcomes.flatMap((o) => (o.action === "insert" ? [{ id: undefined, name: o.name, image_url: null }] : []));
      monsters = [...(await artRows(target, campaignId)), ...planned];
    } else {
      monsters = await artRows(target, campaignId);
    }
    failed += await applyArt(target, monsters, {
      mapPath: resolve(expandHome(values["art-map"])),
      sourceDir: resolve(expandHome(values["source-dir"])),
      desktopDir: resolve(expandHome(values["desktop-dir"])),
      replace: values["replace-art"],
      dryRun,
      production: values.production,
      campaignId,
      userId,
    });
  }
  if (failed > 0) {
    console.error(`${failed} write(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
