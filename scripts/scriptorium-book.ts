#!/usr/bin/env tsx
/**
 * Assembles a setting book's markdown files into ONE Scriptorium book, one chapter
 * per file (epic #1115, story 5), so it can be laid out and exported to PDF in the app. The
 * conversion is `markdownToScriptoriumContent` (src/lib/scriptorium/markdownImport.ts);
 * the pure decisions (which chapters a re-import updates, adds or deletes; where each art's picture comes from) live
 * in `lib/scriptoriumBook.ts`.
 *
 * Usage:
 *   npm run scriptorium:book -- --dry-run                      # local stack, writes nothing
 *   npm run scriptorium:book                                   # import into the local stack
 *   npm run scriptorium:book -- --production --dry-run         # read production, write nothing
 *   npm run scriptorium:book -- --production --yes-production  # write production
 *   Options: --dir <chapters folder> --campaign-id <uuid> --user-id <uuid> --title <text>
 *            --desktop-dir <folder holding art-955/...> --source-dir <the book's source folder>
 *
 * Idempotent: the book is found by (user_id, campaign_id, title) and only its chapters
 * are written, so layout settings the author changed in the app survive a re-import.
 * The nth file lands on the book's nth chapter (its id is kept, so review notes pinned
 * to it survive); extra files add chapters and chapters no file reaches are deleted.
 * A first run inserts the book with its layout defaults (onednd2024, two columns, A4,
 * page numbers).
 *
 * Images: each distinct picture is resized to at most 2400px on its long edge,
 * encoded as WebP, marked with the AI provenance packet, and stored under
 * `asset-images/<owner>/<sha256>.webp`, so a re-run finds it already there and uploads
 * nothing. Production writes Cloudflare R2 (the R2_* variables) and stores the CDN URL
 * (ASSET_CDN_URL); the local stack stores into its own Storage. Each image also gets an
 * `image_provenance` row (the art is AI-generated; the registry is what the app's
 * disclosure badge reads). Campaign-NPC portraits are reused by URL, never copied.
 *
 * The default target is the local stack and anything but loopback is refused; production
 * needs both --production and --yes-production. Output never includes a key.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chapterTitle, countWords } from "../src/lib/scriptorium/chapterTitle.ts";
import { markdownToScriptoriumContent, type ArtSlot, type MarkdownImportOptions } from "../src/lib/scriptorium/markdownImport.ts";
import { type PreparedImage, localStorage, prepareImage, r2Storage, writeProvenance } from "./lib/bookImages.ts";
import { assertCampaignOwner, loadNpcPortraits, readAll, request } from "./lib/campaignRest.ts";
import { pooled } from "./lib/pool.ts";
import { r2ConfigFrom } from "../supabase/functions/_shared/r2/config.ts";
import { normalizeName } from "./lib/name-matching.ts";
import {
  chapterFileNames,
  chapterSources,
  countNodes,
  expandHome,
  planChapterSync,
  type ExistingChapter,
  resolveArtSlot,
  type ResolvedArt,
} from "./lib/scriptoriumBook.ts";
import { type Target, resolveTarget } from "./stat-blocks/rows.ts";

const DEFAULT_DIR = "~/Documents/Claude/Projects/Sothery Book I - manuscript/chapters/";
const DEFAULT_SOURCE_DIR = "~/Documents/Claude/Projects/Late in the Kind Country - stay as long as you like/";
const DEFAULT_DESKTOP_DIR = "~/Desktop";
const DEFAULT_CAMPAIGN = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";
const DEFAULT_OWNER = "fc8ae595-641f-4127-87ad-03588f3710d1";
const DEFAULT_TITLE = "Sothery: A Campaign Setting";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET = "asset-images";
/** render-pdf refuses a page over 40 MB; leave room for the text. */
const IMAGE_BYTES_WARNING = 30 * 1024 * 1024;

/** Embed types and the table + name column each is looked up in. */
const EMBED_TABLES: Record<string, { table: string; column: string }> = {
  monster: { table: "monsters", column: "name" },
  npc: { table: "npcs", column: "name" },
  item: { table: "items", column: "name" },
  location: { table: "locations", column: "name" },
  spell: { table: "spells", column: "name" },
  quest: { table: "quests", column: "title" },
  deity: { table: "deities", column: "name" },
  species: { table: "species", column: "name" },
  faction: { table: "factions", column: "name" },
  subclass: { table: "custom_subclasses", column: "subclass_name" },
};



type EmbedIndex = Map<string, Map<string, string[]>>;

async function loadEmbedIndex(target: Target, campaignId: string): Promise<EmbedIndex> {
  const index: EmbedIndex = new Map();
  for (const [type, { table, column }] of Object.entries(EMBED_TABLES)) {
    const rows = await readAll<Record<string, string>>(target, `${table}?campaign_id=eq.${campaignId}&select=id,${column}`);
    const byName = new Map<string, string[]>();
    for (const row of rows) {
      const key = normalizeName(row[column]);
      byName.set(key, [...(byName.get(key) ?? []), row.id]);
    }
    index.set(type, byName);
  }
  return index;
}

function slotKey(slot: ArtSlot): string {
  return JSON.stringify([slot.slug, slot.existing ?? null, slot.alt ?? null]);
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: DEFAULT_DIR },
      "source-dir": { type: "string", default: DEFAULT_SOURCE_DIR },
      "desktop-dir": { type: "string", default: DEFAULT_DESKTOP_DIR },
      "campaign-id": { type: "string", default: DEFAULT_CAMPAIGN },
      "user-id": { type: "string", default: DEFAULT_OWNER },
      title: { type: "string", default: DEFAULT_TITLE },
      "dry-run": { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"];
  const campaignId = values["campaign-id"];
  const userId = values["user-id"];
  const title = values.title;
  if (!UUID.test(campaignId) || !UUID.test(userId)) throw new Error("--campaign-id and --user-id must be UUIDs.");
  if (values.production && !dryRun && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --production --yes-production, or --dry-run).");
  }

  const dir = resolve(expandHome(values.dir));
  const sourceDir = resolve(expandHome(values["source-dir"]));
  const desktopDir = resolve(expandHome(values["desktop-dir"]));
  const files = chapterFileNames(readdirSync(dir));
  if (files.length === 0) throw new Error(`No .md files in ${dir}.`);

  // resolveTarget refuses anything but loopback unless --production is given.
  const target = resolveTarget(values.production);
  console.log(`${dryRun ? "Planning for" : "Writing to"} ${target.label}, campaign ${campaignId}, ${files.length} chapter(s) in ${dir}.`);
  await assertCampaignOwner(target, campaignId, userId);

  const storage = values.production
    ? r2Storage(r2ConfigFrom((k) => process.env[k]), process.env.ASSET_CDN_URL?.trim() || null, BUCKET)
    : localStorage(target, BUCKET);
  if (values.production && !dryRun) {
    if (r2ConfigFrom((k) => process.env[k]) === null) throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
    if (!process.env.ASSET_CDN_URL?.trim()) throw new Error("ASSET_CDN_URL is not set.");
  }

  // A production dry run may have no CDN base; it prints the storage key rather than throwing.
  const urlFor = (path: string) => (dryRun && values.production && !process.env.ASSET_CDN_URL?.trim() ? `(planned) ${BUCKET}/${path}` : storage.url(path));

  const sources = chapterSources(files.map((f) => readFileSync(join(dir, f), "utf8")));
  if (sources.length === 0) throw new Error(`Every .md file in ${dir} is empty.`);
  const { portraits, ambiguous } = await loadNpcPortraits(target, campaignId);
  const embedIndex = await loadEmbedIndex(target, campaignId);

  // Pass 1: find every slot and embed the book asks for, and where each picture would come from.
  const resolvedBySlot = new Map<string, ResolvedArt | null>();
  const slotNames = new Map<string, string>();
  const lookups = { npcPortraits: portraits, fileExists: existsSync, desktopDir, sourceDir };
  for (const source of sources) {
    markdownToScriptoriumContent(source, {
      resolveArt: (slot) => {
        const key = slotKey(slot);
        if (!resolvedBySlot.has(key)) {
          resolvedBySlot.set(key, resolveArtSlot(slot, lookups));
          slotNames.set(key, `${slot.slug} (${slot.existing ?? slot.alt ?? "no source"})`);
        }
        return null;
      },
    });
  }

  // Prepare each distinct file once, then store what is not stored yet.
  const distinctFiles = [...new Set([...resolvedBySlot.values()].flatMap((r) => (r?.kind === "file" ? [r.path] : [])))];
  const prepared = new Map<string, PreparedImage>();
  await pooled(distinctFiles, 4, async (file) => {
    prepared.set(file, await prepareImage(file, userId));
  });
  const stored = new Map<string, boolean | null>();
  let uploaded = 0;
  let reused = 0;
  const uploadFailures: string[] = [];
  await pooled([...prepared.entries()], 4, async ([file, image]) => {
    const has = await storage.has(image.path);
    stored.set(file, has);
    if (dryRun) return;
    try {
      if (has) {
        reused++;
      } else {
        await storage.put(image.path, image.bytes);
        uploaded++;
      }
      await writeProvenance(target, BUCKET, image, userId);
    } catch (error) {
      uploadFailures.push(`${file}: ${error instanceof Error ? error.message : "failed"}`);
    }
  });
  if (uploadFailures.length > 0) {
    for (const f of uploadFailures) console.error(`  upload failed ${f}`);
    throw new Error(`${uploadFailures.length} image(s) failed to store; the document was not written.`);
  }

  // Pass 2: the real conversion.
  const embedsResolved: string[] = [];
  const embedsUnresolved: string[] = [];
  const embedSeen = new Set<string>();
  const convertOptions: MarkdownImportOptions = {
    resolveArt: (slot) => {
      const resolved = resolvedBySlot.get(slotKey(slot));
      if (!resolved) return null;
      if (resolved.kind === "url") return { src: resolved.url };
      const image = prepared.get(resolved.path);
      return image ? { src: urlFor(image.path) } : null;
    },
    resolveEmbed: ({ type, name }) => {
      const ids = embedIndex.get(type)?.get(normalizeName(name)) ?? [];
      const label = `${type}: ${name}${ids.length > 1 ? ` (${ids.length} share the name)` : ""}`;
      if (!embedSeen.has(label)) {
        embedSeen.add(label);
        (ids.length === 1 ? embedsResolved : embedsUnresolved).push(label);
      }
      return ids.length === 1 ? { id: ids[0] } : null;
    },
  };
  const contents = sources.map((source) => markdownToScriptoriumContent(source, convertOptions));
  const contentBytes = Buffer.byteLength(JSON.stringify(contents), "utf8");
  const wordCount = contents.reduce((n, c) => n + countWords(c), 0);
  const nodeTotal = (type: string) => contents.reduce((n, c) => n + countNodes(c, type), 0);

  // Report.
  const slotsTotal = resolvedBySlot.size;
  const unresolvedSlots = [...resolvedBySlot.entries()].filter(([, r]) => r === null).map(([k]) => slotNames.get(k) ?? k);
  const viaNpc = [...resolvedBySlot.values()].filter((r) => r?.kind === "url").length;
  const imageBytes = [...prepared.values()].reduce((n, i) => n + i.bytes.byteLength, 0);
  const alreadyStored = [...stored.values()].filter((v) => v === true).length;
  const unknownStored = [...stored.values()].filter((v) => v === null).length;
  console.log(`\nChapters ${contents.length} (from ${files.length} file(s)), markdown ${(Buffer.byteLength(sources.join("")) / 1024).toFixed(0)} KB, ${wordCount} words.`);
  console.log(`Art slots ${slotsTotal}: resolved ${slotsTotal - unresolvedSlots.length} (${viaNpc} NPC portraits, ${slotsTotal - unresolvedSlots.length - viaNpc} files), unresolved ${unresolvedSlots.length}.`);
  console.log(`Distinct images ${prepared.size}, ${mb(imageBytes)} as WebP (source ${mb([...prepared.values()].reduce((n, i) => n + i.sourceBytes, 0))}); ` +
    (dryRun
      ? `already stored ${alreadyStored}, to upload ${prepared.size - alreadyStored - unknownStored}${unknownStored ? `, unknown ${unknownStored} (no R2 credentials)` : ""}.`
      : `uploaded ${uploaded}, reused ${reused}.`));
  if (imageBytes > IMAGE_BYTES_WARNING) console.warn(`WARNING: images total ${mb(imageBytes)}, close to the 40 MB render-pdf HTML cap.`);
  console.log(`Embeds resolved ${embedsResolved.length}, unresolved ${embedsUnresolved.length}.`);
  console.log(`Nodes: image ${nodeTotal("image")}, lensPair ${nodeTotal("lensPair")}, noteBlock ${nodeTotal("noteBlock")}, entityEmbed ${nodeTotal("entityEmbed")}, pageBreak ${nodeTotal("pageBreak")}.`);
  console.log(`Content ${(contentBytes / 1024).toFixed(0)} KB (${contentBytes} bytes).`);
  if (unresolvedSlots.length) console.log(`\nUnresolved art (stay placeholders):\n${unresolvedSlots.map((s) => `  - ${s}`).join("\n")}`);
  if (ambiguous.size) console.log(`\nNPC names with several different portraits (skipped): ${[...ambiguous].join(", ")}`);
  if (embedsUnresolved.length) console.log(`\nUnresolved embeds:\n${embedsUnresolved.map((s) => `  - ${s}`).join("\n")}`);

  // The book row, then its chapters.
  const found = (await request(
    target,
    "GET",
    `scriptorium_documents?user_id=eq.${userId}&campaign_id=eq.${campaignId}&title=eq.${encodeURIComponent(title)}&select=id`,
  )) as { id: string }[];
  if (found.length > 1) throw new Error(`${found.length} documents titled "${title}" exist in the campaign; refusing to guess which to replace.`);
  const existing = found.length === 1
    ? ((await request(target, "GET", `scriptorium_chapters?document_id=eq.${found[0].id}&select=id,position`)) as ExistingChapter[])
    : [];
  const plan = planChapterSync(existing, contents.length);
  if (dryRun) {
    console.log(
      `\nWould ${found.length === 1 ? "update" : "insert"} "${title}"${found[0] ? ` (${found[0].id})` : ""}: ` +
        `${plan.updates.length} chapter(s) rewritten in place, ${plan.inserts.length} added, ${plan.deletes.length} deleted. Dry run: nothing written.`,
    );
    return;
  }

  let documentId: string;
  if (found.length === 1) {
    documentId = found[0].id;
  } else {
    const created = (await request(target, "POST", "scriptorium_documents", {
      user_id: userId,
      campaign_id: campaignId,
      title,
      kind: "book",
      doc_type: "custom",
      theme: "onednd2024",
      is_two_column: true,
      page_size: "A4",
      show_page_numbers: true,
    })) as { id: string }[];
    documentId = created[0].id;
  }

  // The chapter's text is its own jsonb object; its title and word count are the editor's.
  const row = (index: number) => ({
    title: chapterTitle(contents[index]),
    content: contents[index],
    word_count: countWords(contents[index]),
  });
  for (const update of plan.updates) {
    await request(target, "PATCH", `scriptorium_chapters?id=eq.${update.id}&document_id=eq.${documentId}`, {
      position: update.position,
      ...row(update.index),
    });
  }
  if (plan.inserts.length > 0) {
    await request(
      target,
      "POST",
      "scriptorium_chapters",
      plan.inserts.map((insert) => ({ document_id: documentId, position: insert.position, ...row(insert.index) })),
    );
  }
  if (plan.deletes.length > 0) {
    await request(target, "DELETE", `scriptorium_chapters?document_id=eq.${documentId}&id=in.(${plan.deletes.join(",")})`);
  }
  console.log(`\n${found.length === 1 ? "Updated" : "Inserted"} "${title}" (${documentId}): ${plan.updates.length} rewritten, ${plan.inserts.length} added, ${plan.deletes.length} deleted.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
