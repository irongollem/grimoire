#!/usr/bin/env tsx
/**
 * Assembles a setting book's markdown chapters into ONE Scriptorium document (epic
 * #1115, story 5), so it can be laid out and exported to PDF in the app. The
 * conversion is `markdownToScriptoriumContent` (src/lib/scriptorium/markdownImport.ts);
 * the pure decisions (chapter joining, where each art slot's picture comes from) live
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
 * Idempotent: the document is found by (user_id, campaign_id, title) and only its
 * `content` and `word_count` are replaced, so layout settings the author changed in
 * the app survive a re-import. A first run inserts the row with the book's layout
 * defaults (onednd2024, two columns, A4, page numbers).
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
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { markdownToScriptoriumContent, type ArtSlot } from "../src/lib/scriptorium/markdownImport.ts";
import { assetCdnUrl } from "../supabase/functions/_shared/cdn-buckets.ts";
import { r2ConfigFrom, r2ObjectKey, IMMUTABLE_CACHE_CONTROL, type R2Config } from "../supabase/functions/_shared/r2/config.ts";
import { headObject, putObject } from "../supabase/functions/_shared/r2/client.ts";
import { markGeneratedImage } from "../supabase/functions/_shared/provenance/mark.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { imageProvenanceStem } from "../supabase/functions/_shared/provenance/key.ts";
import { pooled } from "./lib/pool.ts";
import { normalizeName } from "./lib/name-matching.ts";
import {
  assetImagePath,
  chapterFileNames,
  countNodes,
  countWords,
  expandHome,
  joinChapters,
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
const MAX_EDGE = 2400;
const WEBP_QUALITY = 82;
/** render-pdf refuses a page over 40 MB; leave room for the text. */
const IMAGE_BYTES_WARNING = 30 * 1024 * 1024;

const GENERATOR_TYPE = "setting-book-art";
/** The GPT art pipeline's output folder: the only pictures whose generator is known. */
const GPT_OUTPUT = "/art-955/kind-country/out/";

/**
 * Every picture in the book is AI-generated, so every one is marked. Only the
 * GPT pipeline's output has a known generator; the author's own illustrations
 * folder was made with tools this script cannot name, so those say "unknown"
 * rather than claim a model they were not made with.
 */
function provenanceFor(file: string, generatedAt: string): AiProvenance {
  const gpt = file.includes(GPT_OUTPUT);
  return {
    generatorType: GENERATOR_TYPE,
    provider: gpt ? "openai" : "unknown",
    model: gpt ? "gpt-image-2" : "unknown",
    generatedAt,
    edited: false,
  };
}

/** Embed types and the table + name column each is looked up in. */
const EMBED_TABLES: Record<string, { table: string; column: string }> = {
  monster: { table: "monsters", column: "name" },
  npc: { table: "npcs", column: "name" },
  item: { table: "items", column: "name" },
  location: { table: "locations", column: "name" },
  spell: { table: "spells", column: "name" },
  quest: { table: "quests", column: "title" },
};

function headers(target: Target, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: target.key, Authorization: `Bearer ${target.key}`, ...extra };
}

/** Status only: a body could echo row content. */
async function request(target: Target, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(`${target.origin}/rest/v1/${path}`, {
    method,
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=representation", ...extra }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const parsed = JSON.parse(await response.text()) as { message?: string };
      if (parsed.message) message += ` ${parsed.message}`;
    } catch {
      // Not JSON: status alone.
    }
    throw new Error(`${method} ${path.split("?")[0]} failed (${message}).`);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

async function readAll<T>(target: Target, path: string): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const batch = (await request(target, "GET", `${path}&order=id&limit=${page}&offset=${offset}`)) as T[];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

async function assertCampaignOwner(target: Target, campaignId: string, userId: string): Promise<void> {
  const rows = (await request(target, "GET", `campaigns?id=eq.${campaignId}&select=id,user_id`)) as { id: string; user_id: string }[];
  if (rows.length === 0) throw new Error(`Campaign ${campaignId} does not exist on ${target.label}.`);
  if (rows[0].user_id !== userId) throw new Error(`Campaign ${campaignId} is not owned by ${userId} on ${target.label}.`);
}

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

/** Portrait URL by normalised name; a name shared by several NPCs with portraits is left out as ambiguous. */
async function loadNpcPortraits(target: Target, campaignId: string): Promise<{ portraits: Map<string, string>; ambiguous: Set<string> }> {
  const rows = await readAll<{ name: string; portrait_url: string | null }>(target, `npcs?campaign_id=eq.${campaignId}&select=id,name,portrait_url`);
  const portraits = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (!row.portrait_url) continue;
    const key = normalizeName(row.name);
    if (portraits.has(key) && portraits.get(key) !== row.portrait_url) ambiguous.add(key);
    portraits.set(key, row.portrait_url);
  }
  for (const key of ambiguous) portraits.delete(key);
  return { portraits, ambiguous };
}

interface PreparedImage {
  path: string;
  bytes: Uint8Array;
  provenance: AiProvenance;
  sourceBytes: number;
}

/** Resize, encode as WebP, mark as AI-generated, and key by the hash of the final bytes. */
async function prepareImage(file: string, userId: string): Promise<PreparedImage> {
  const prov = provenanceFor(file, statSync(file).mtime.toISOString());
  const source = readFileSync(file);
  const webp = await sharp(source)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const bytes = markGeneratedImage(new Uint8Array(webp), "image/webp", prov);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 40);
  return { path: assetImagePath(userId, hash), bytes, provenance: prov, sourceBytes: source.byteLength };
}

interface Storage {
  /** Whether the object is already stored; null when it cannot be told (a dry run without R2 credentials). */
  has: (path: string) => Promise<boolean | null>;
  put: (path: string, bytes: Uint8Array) => Promise<void>;
  url: (path: string) => string;
}

function localStorage(target: Target): Storage {
  const publicUrl = (path: string) => `${target.origin}/storage/v1/object/public/${BUCKET}/${path}`;
  return {
    has: async (path) => (await fetch(publicUrl(path), { method: "HEAD" })).ok,
    put: async (path, bytes) => {
      const response = await fetch(`${target.origin}/storage/v1/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: headers(target, { "Content-Type": "image/webp", "x-upsert": "true" }),
        body: Buffer.from(bytes),
      });
      if (!response.ok) throw new Error(`Local storage upload of ${path} failed (${response.status}).`);
    },
    url: publicUrl,
  };
}

function r2Storage(config: R2Config | null, cdnBase: string | null): Storage {
  return {
    has: async (path) => (config === null ? null : (await headObject(config, r2ObjectKey(BUCKET, path))) !== null),
    put: async (path, bytes) => {
      if (config === null) throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
      await putObject(config, { key: r2ObjectKey(BUCKET, path), body: bytes, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
    },
    url: (path) => {
      const url = assetCdnUrl(BUCKET, path, cdnBase);
      if (url === null) throw new Error("ASSET_CDN_URL is not set, so the stored URL cannot be built.");
      return url;
    },
  };
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
    ? r2Storage(r2ConfigFrom((k) => process.env[k]), process.env.ASSET_CDN_URL?.trim() || null)
    : localStorage(target);
  if (values.production && !dryRun) {
    if (r2ConfigFrom((k) => process.env[k]) === null) throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
    if (!process.env.ASSET_CDN_URL?.trim()) throw new Error("ASSET_CDN_URL is not set.");
  }

  const markdown = joinChapters(files.map((f) => readFileSync(join(dir, f), "utf8")));
  const { portraits, ambiguous } = await loadNpcPortraits(target, campaignId);
  const embedIndex = await loadEmbedIndex(target, campaignId);

  // Pass 1: find every slot and embed the book asks for, and where each picture would come from.
  const resolvedBySlot = new Map<string, ResolvedArt | null>();
  const slotNames = new Map<string, string>();
  const lookups = { npcPortraits: portraits, fileExists: existsSync, desktopDir, sourceDir };
  markdownToScriptoriumContent(markdown, {
    resolveArt: (slot) => {
      const key = slotKey(slot);
      if (!resolvedBySlot.has(key)) {
        resolvedBySlot.set(key, resolveArtSlot(slot, lookups));
        slotNames.set(key, `${slot.slug} (${slot.existing ?? slot.alt ?? "no source"})`);
      }
      return null;
    },
  });

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
      await request(
        target,
        "POST",
        "image_provenance?on_conflict=bucket,stem",
        { bucket: BUCKET, stem: imageProvenanceStem(image.path), user_id: userId, provenance: image.provenance },
        { Prefer: "resolution=merge-duplicates,return=minimal" },
      );
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
  const content = markdownToScriptoriumContent(markdown, {
    resolveArt: (slot) => {
      const resolved = resolvedBySlot.get(slotKey(slot));
      if (!resolved) return null;
      if (resolved.kind === "url") return { src: resolved.url };
      const image = prepared.get(resolved.path);
      return image ? { src: storage.url(image.path) } : null;
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
  });
  const json = JSON.stringify(content);
  const contentBytes = Buffer.byteLength(json, "utf8");
  const wordCount = countWords(content);

  // Report.
  const slotsTotal = resolvedBySlot.size;
  const unresolvedSlots = [...resolvedBySlot.entries()].filter(([, r]) => r === null).map(([k]) => slotNames.get(k) ?? k);
  const viaNpc = [...resolvedBySlot.values()].filter((r) => r?.kind === "url").length;
  const imageBytes = [...prepared.values()].reduce((n, i) => n + i.bytes.byteLength, 0);
  const alreadyStored = [...stored.values()].filter((v) => v === true).length;
  const unknownStored = [...stored.values()].filter((v) => v === null).length;
  console.log(`\nChapters ${files.length}, markdown ${(Buffer.byteLength(markdown) / 1024).toFixed(0)} KB, ${wordCount} words.`);
  console.log(`Art slots ${slotsTotal}: resolved ${slotsTotal - unresolvedSlots.length} (${viaNpc} NPC portraits, ${slotsTotal - unresolvedSlots.length - viaNpc} files), unresolved ${unresolvedSlots.length}.`);
  console.log(`Distinct images ${prepared.size}, ${mb(imageBytes)} as WebP (source ${mb([...prepared.values()].reduce((n, i) => n + i.sourceBytes, 0))}); ` +
    (dryRun
      ? `already stored ${alreadyStored}, to upload ${prepared.size - alreadyStored - unknownStored}${unknownStored ? `, unknown ${unknownStored} (no R2 credentials)` : ""}.`
      : `uploaded ${uploaded}, reused ${reused}.`));
  if (imageBytes > IMAGE_BYTES_WARNING) console.warn(`WARNING: images total ${mb(imageBytes)}, close to the 40 MB render-pdf HTML cap.`);
  console.log(`Embeds resolved ${embedsResolved.length}, unresolved ${embedsUnresolved.length}.`);
  console.log(`Nodes: image ${countNodes(content, "image")}, lensPair ${countNodes(content, "lensPair")}, noteBlock ${countNodes(content, "noteBlock")}, entityEmbed ${countNodes(content, "entityEmbed")}, pageBreak ${countNodes(content, "pageBreak")}.`);
  console.log(`Content ${(contentBytes / 1024).toFixed(0)} KB (${contentBytes} bytes).`);
  if (unresolvedSlots.length) console.log(`\nUnresolved art (stay placeholders):\n${unresolvedSlots.map((s) => `  - ${s}`).join("\n")}`);
  if (ambiguous.size) console.log(`\nNPC names with several different portraits (skipped): ${[...ambiguous].join(", ")}`);
  if (embedsUnresolved.length) console.log(`\nUnresolved embeds:\n${embedsUnresolved.map((s) => `  - ${s}`).join("\n")}`);

  // The document row.
  const found = (await request(
    target,
    "GET",
    `scriptorium_documents?user_id=eq.${userId}&campaign_id=eq.${campaignId}&title=eq.${encodeURIComponent(title)}&select=id`,
  )) as { id: string }[];
  if (found.length > 1) throw new Error(`${found.length} documents titled "${title}" exist in the campaign; refusing to guess which to replace.`);
  const action = found.length === 1 ? "update" : "insert";
  if (dryRun) {
    console.log(`\nWould ${action} "${title}"${found[0] ? ` (${found[0].id})` : ""}. Dry run: nothing written.`);
    return;
  }
  if (found.length === 1) {
    await request(target, "PATCH", `scriptorium_documents?id=eq.${found[0].id}&user_id=eq.${userId}`, { content: json, word_count: wordCount });
    console.log(`\nUpdated "${title}" (${found[0].id}).`);
  } else {
    const created = (await request(target, "POST", "scriptorium_documents", {
      user_id: userId,
      campaign_id: campaignId,
      title,
      doc_type: "custom",
      content: json,
      word_count: wordCount,
      theme: "onednd2024",
      is_two_column: true,
      page_size: "A4",
      show_page_numbers: true,
    })) as { id: string }[];
    console.log(`\nInserted "${title}" (${created[0]?.id}).`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
