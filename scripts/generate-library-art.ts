#!/usr/bin/env tsx
/**
 * Generates canonical library art the way the app does, for a human to review,
 * then publishes the approved candidates (#947).
 *
 * ## Why
 *
 * Canonical spell, item and monster art went missing when files under a user folder were
 * bulk-deleted, and a few images have no surviving copy. This regenerates them
 * through the same pipeline `generate-entity-image` runs for a DM clicking
 * "Generate": a text model writes a subject from the entity's facts, the
 * `image_base` style prompt is put in front of it, and the platform image model
 * renders it at 1024x1536. The output is stored as real, efficient WebP.
 *
 * ## Two commands, one manifest between them
 *
 *   generate  Reads each entry's facts, `image_base`, `provider_config` (openai)
 *             and the `entity_image` quality tier from the project in the env,
 *             runs the two model calls, and writes into `--out <dir>`:
 *               <slug>.provider.<ext>  the provider's bytes, untouched
 *               <slug>.webp            1024x1536 WebP quality 82, EU AI Act marked
 *               manifest.json          context, subject, full prompt, model,
 *                                      quality, sizes, status "candidate"
 *             It prints the model, size, quality and image count BEFORE the first
 *             paid call and does nothing without `--yes-spend`. It writes to no
 *             database and no bucket.
 *
 *   publish   For each manifest entry whose status is "approved" (edit the
 *             manifest, or pass `--approve-all`): builds the four size variants,
 *             marks each, PUTs original + variants to R2 (HEAD first, identical
 *             objects are skipped), registers provenance, writes the database
 *             rows, and sets the entry to "published" with its URL. It never
 *             deletes anything.
 *
 * ## Spends money and writes production only when told to
 *
 * `generate` makes paid text and image calls and needs `--yes-spend`. `publish`
 * is a dry run that prints exactly what it would write; `--write` performs it,
 * and a non-loopback project additionally needs `--yes-production`. The target
 * is whatever `VITE_SUPABASE_URL` names, printed before anything happens.
 *
 * Usage:
 *   npm run library:art -- generate --spell srd_2024_fireball --item "Bag of Holding" --out art-947
 *   npm run library:art -- generate --spell srd_2024_fireball --out art-947 --yes-spend
 *   npm run library:art -- generate --spell srd_2024_fireball --out art-947 --only spell-srd_2024_fireball --yes-spend
 *   npm run library:art -- generate --monster srd_srd_sprite --out art-947 --yes-spend
 *   npm run library:art -- generate --item "Quarterstaff" --out art-947 --subject "<what the picture shows>" --yes-spend
 *   npm run library:art -- generate --item "Sack" --image-model gpt-image-2.5-sunburst --out art-955 --yes-spend
 *   npm run library:art -- generate --item "Longsword (+1)" --also "Longsword (+2)" --also "Longsword (+3)" --out art-955 --yes-spend
 *   npm run library:art -- publish --out art-947 --approve-all
 *   npm run library:art -- publish --out art-947 --approve-all --write --yes-production
 *
 * Spell art goes to `spell-images/srd/` with a `library_spell_art_canonical` row
 * and the namesake rule (a same-named spell without canonical art of its own
 * shows this image); item art goes to `item-images/srd/` with a
 * `library_art_defaults` row (content_type 'item') and every `library_items`
 * row of that name, and to every name given with `--also` (#955: variants of one item,
 * such as "Holy Avenger (Dagger)" beside "Holy Avenger", share one picture rather
 * than each costing a render); monster art goes to `monster-images/srd/` with a
 * `library_monster_art_canonical` row (only its `image_url` is written, never
 * its cutout or focal point) and that one `library_monsters` row, with no
 * namesake rule unless `--also <id>` names further rows to share it. `--library-owner <uuid>` names the owner recorded for the
 * provenance rows; by default the one admin account. `--cdn-base <url>` is
 * needed when `VITE_ASSET_CDN_URL` is not in the env.
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (generate),
 * R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (publish --write).
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { INJECTION_GUARD_SUFFIX, MAX_IMAGE_SUBJECT_CHARS, wrapUserInput } from "../supabase/functions/_shared/ai-prompt.ts";
import { assetCdnUrl } from "../supabase/functions/_shared/cdn-buckets.ts";
import { resolveImageQuality } from "../supabase/functions/_shared/imageQuality.ts";
import { buildImagePromptAuthorSystem, buildSimpleImagePrompt } from "../supabase/functions/_shared/image-prompt.ts";
import { buildXmpPacket, parseXmpPacket } from "../supabase/functions/_shared/provenance/xmp.ts";
import { embedXmpInWebp, readXmpFromWebp } from "../supabase/functions/_shared/provenance/embed.ts";
import { markGeneratedImage } from "../supabase/functions/_shared/provenance/mark.ts";
import { registerImageProvenance } from "../supabase/functions/_shared/provenance/register.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { headObject, putObject } from "../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom, r2ObjectKey, type R2Config } from "../supabase/functions/_shared/r2/config.ts";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same size and orientation the edge function renders entity portraits at. */
export const ENTITY_IMAGE_SIZE = "1024x1536";
const FINAL_WIDTH = 1024;
const FINAL_HEIGHT = 1536;
const FINAL_QUALITY = 82;
/** The app's variant widths (`VARIANT_WIDTHS` in src/lib/storage/buckets.ts) and quality (0.8). */
export const VARIANT_WIDTHS = [200, 300, 400, 600] as const;
const VARIANT_QUALITY = 80;
/** Mirrors `CONTEXT_LIMIT` in src/ai/useEntityImageGeneration.ts. */
const CONTEXT_LIMIT = 2000;
const MANIFEST_FILE = "manifest.json";

export type ArtKind = "spell" | "item" | "monster";

/** Storage bucket per kind. Canonical art lives under `srd/` in all three (see CLAUDE.md, Storage Path Convention). */
export const BUCKET_FOR_KIND: Record<ArtKind, string> = { spell: "spell-images", item: "item-images", monster: "monster-images" };

/**
 * How canonical item art is staged, passed where the app passes a campaign's
 * `ai_setting_prompt` (#955). Library art belongs to no campaign, so without a
 * setting the image model chose its own backdrop: sunlit castles, concept
 * sheets with lettering, bare studio shots, none of it matching the set that
 * already existed, which was made inside a wintry campaign. Every scene keeps
 * that set's thread (frost, a cold palette, one warm light), but a single
 * backdrop for a thousand items reads as wallpaper, so the scene varies with the
 * kind of item. Long things stand in something that fits their length: lying
 * diagonally in a tall frame, a staff or a sword was cropped or tiny.
 */
const ITEM_SCENE_COMMON = [
  "A painted still life set in a cold northern world: frost and a little snow, cold blues, greys and muted browns, with one restrained source of warm light.",
  "The object is the single clear focus, shown whole; the few background props stay small, dim and out of focus.",
  "No people, no hands, nothing worn by anyone, no lettering, labels or writing, no multiple views, panels or insets, no plain or studio background.",
].join(" ");

export const ITEM_SCENES = {
  hall: "The object rests on a weathered, frost-dusted dark wooden table in a cold stone hall, a lit iron lantern glowing behind it.",
  forge: "The object rests on a scarred smith's workbench in a cold forge, tongs and a whetstone nearby, the forge's embers glowing low behind it.",
  alchemist: "The object rests on an alchemist's bench by a frost-rimed window, stoppered glass vessels and bundles of dried herbs blurred behind it, a single candle burning.",
  study: "The object rests on a scholar's desk among candle stubs, an inkwell and stacked leather-bound books, frost creeping across the window behind it.",
  hearth: "The object rests on a fur-draped wooden chest in a timber lodge, a low hearth fire glowing behind it.",
  trader: "The object rests on a worn merchant's counter in a snowbound trading post, brass scales and a coin tray behind it, an oil lamp burning.",
  shrine: "The object rests on a stone ledge in a cold mountain shrine, votive candles flickering behind it.",
  camp: "The object rests on a snow-capped tree stump at a night camp, a small campfire's embers glowing behind it among dark pines.",
  rack: "The object stands upright, full length from top to bottom, in a timber weapon rack against the frost-rimed stone wall of a cold armory, a lantern hanging nearby.",
  lodgeWall: "The object leans upright, full length from top to bottom, against a rough log wall beside a low hearth fire in a timber lodge.",
  pillar: "The object leans upright, full length from top to bottom, against a carved stone pillar in a candlelit mountain shrine.",
  pine: "The object leans upright, full length from top to bottom, against a snow-laden pine at a night camp, a small campfire glowing nearby.",
  armorStand: "The object is displayed upright on a plain wooden armor stand in a cold armory, a lantern hanging on the frost-rimed stone wall behind it.",
  lodgeStand: "The object is displayed upright on a plain wooden stand beside a low hearth fire in a timber lodge.",
} as const;

export type ItemScene = keyof typeof ITEM_SCENES;

const UPRIGHT_SCENES: ItemScene[] = ["rack", "lodgeWall", "pillar", "pine"];
const STAND_SCENES: ItemScene[] = ["armorStand", "lodgeStand"];
const FLAT_SCENES: ItemScene[] = ["hall", "forge", "alchemist", "study", "hearth", "trader", "shrine", "camp"];

/** Flat scenes that suit each item type; anything unlisted may use any flat scene. */
const SCENES_FOR_TYPE: Readonly<Record<string, ItemScene[]>> = {
  weapon: ["forge", "hall", "hearth", "camp"],
  ammunition: ["forge", "hall", "camp"],
  shield: ["forge", "hall", "hearth"],
  potion: ["alchemist", "hall", "trader"],
  scroll: ["study", "shrine", "hall"],
  ring: ["trader", "shrine", "study", "hearth"],
  wand: ["study", "shrine", "alchemist", "hall"],
  gear: ["hall", "trader", "hearth", "camp"],
  provision: ["hearth", "camp", "trader"],
  crafting_material: ["alchemist", "forge", "trader"],
  trade_good: ["trader", "hall"],
  art_object: ["hall", "hearth", "study"],
};

/** Names of things too long to lie in a tall frame: staffs, poles, polearms, bows, firearms and swords. */
const LONG_NAME = /\b(pole|staff|quarterstaff|pike|lance|glaive|halberd|spear|trident|javelin|bow|longbow|shortbow|oathbow|musket|sword|longsword|greatsword|shortsword|rapier|scimitar|blade|avenger|defender|slayer|vorpal|stealer|greataxe|maul)\b/i;

export type ItemStaging = "upright" | "stand" | "short" | "flat";

export function itemStaging(item: Pick<ItemFacts, "name" | "item_type">): ItemStaging {
  if (item.item_type === "staff" || item.item_type === "rod") return "upright";
  if (item.item_type === "wand") return "short";
  if (item.item_type === "armor") return /shield/i.test(item.name) ? "flat" : "stand";
  if ((item.item_type === "weapon" || item.item_type === "gear") && LONG_NAME.test(item.name)) return "upright";
  return "flat";
}

/** FNV-1a, so an item keeps its scene from one run to the next. */
function stableIndex(key: string, size: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return (hash >>> 0) % size;
}

export function itemScene(item: Pick<ItemFacts, "name" | "item_type">): ItemScene {
  const staging = itemStaging(item);
  const choices =
    staging === "upright" ? UPRIGHT_SCENES : staging === "stand" ? STAND_SCENES : (SCENES_FOR_TYPE[item.item_type] ?? FLAT_SCENES);
  return choices[stableIndex(item.name.toLowerCase(), choices.length)];
}

/** The setting for one library item: its scene, a size cue for wands, and the thread every scene shares. */
export function itemSetting(item: Pick<ItemFacts, "name" | "item_type">): string {
  // Lying down, a wand still came out as a long diagonal however short it was told to be.
  const size = itemStaging(item) === "short" ? " The wand, about the length of a forearm, stands upright in a small wooden wand stand on that surface, shown whole from tip to handle." : "";
  return `${ITEM_SCENES[itemScene(item)]}${size} ${ITEM_SCENE_COMMON}`;
}

/**
 * Spells keep the look the existing canonical spell art has: the spell at the
 * moment of casting, caster and target allowed, palette and place free to suit
 * the spell (#955 matched it rather than giving spells the items' scene). Only
 * the rules every library picture keeps are added: the model otherwise painted
 * compass letters into a starry sky.
 */
export const SPELL_SETTING =
  "One clear moment of the spell taking effect, painted as a single scene. No lettering, letters, numbers, labels or writing anywhere in the picture, and no multiple views, panels or insets.";

/**
 * Appended to the subject author's instructions when the kind has a fixed
 * scene. The image prompt lets the subject override the setting, so a subject
 * that adds "against a plain grey background" or "in a red void" wins over it.
 */
export const SCENE_IS_FIXED = " The scene is fixed elsewhere: describe the object alone, never its background, surroundings or setting.";

/** The tables a publish writes, per kind, for the dry-run report. */
const TABLES_FOR_KIND: Record<ArtKind, string> = {
  spell: "library_spell_art_canonical + library_spells",
  monster: "library_monster_art_canonical + library_monsters",
  item: "library_art_defaults + library_items",
};

// ---------------------------------------------------------------------------
// Pure parts: context

interface TiptapNode {
  text?: string;
  content?: TiptapNode[];
}

/** Mirrors `toPlainText` in src/ai/utils.ts (a node script cannot resolve `@/`). */
export function toPlainText(content: string | null | undefined): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parts: string[] = [];
    const walk = (n: TiptapNode) => {
      if (n.text) parts.push(n.text);
      n.content?.forEach(walk);
    };
    walk(JSON.parse(trimmed) as TiptapNode);
    return parts.join(" ").trim();
  } catch {
    return trimmed;
  }
}

/** Mirrors `buildEntityContext` in src/ai/utils.ts. */
export function buildEntityContext(parts: (string | null | undefined)[]): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(". ");
}

/** Mirrors `ITEM_TYPE_LABELS` in src/types/item.types.ts. */
export const ITEM_TYPE_LABELS: Readonly<Record<string, string>> = {
  weapon: "Weapon",
  armor: "Armor",
  shield: "Shield",
  potion: "Potion",
  wondrous_item: "Wondrous Item",
  ring: "Ring",
  rod: "Rod",
  staff: "Staff",
  wand: "Wand",
  scroll: "Scroll",
  ammunition: "Ammunition",
  gear: "Adventuring Gear",
  tool: "Tool",
  vehicle: "Vehicle",
  trade_good: "Trade Good",
  crafting_material: "Crafting Material",
  provision: "Provision",
  art_object: "Art Object",
  service: "Service",
  pack: "Pack / Bundle",
};

/** Mirrors `ITEM_RARITY_LABELS` in src/types/item.types.ts. */
export const ITEM_RARITY_LABELS: Readonly<Record<string, string>> = {
  mundane: "Mundane",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  very_rare: "Very Rare",
  legendary: "Legendary",
  artifact: "Artifact",
};

export interface SpellFacts {
  id: string;
  name: string;
  level: number;
  school: string;
  description: string;
}

export interface ItemFacts {
  name: string;
  item_type: string;
  rarity: string;
  description: string;
}

export interface MonsterFacts {
  id: string;
  name: string;
  size: string | null;
  monster_type: string;
  alignment: string | null;
  habitat: string | null;
  /** Tiptap JSON or plain text. Every library monster has one since 5 Oct 2026. */
  description: string | null;
}

/**
 * Mirrors `aiContext` in MonsterDetail.vue (name, "<size> <type>", alignment,
 * habitat, description), clamped like `useEntityImageGeneration`. The
 * description is what tells the subject writer what the creature looks like;
 * without it a third-party creature is drawn from its name alone (Black Flag's
 * squat, tentacle-tongued Unska came back a lean horned fiend).
 */
export function monsterContext(monster: Omit<MonsterFacts, "id">): string {
  return buildEntityContext([
    monster.name,
    [monster.size, monster.monster_type].filter(Boolean).join(" "),
    monster.alignment,
    monster.habitat,
    toPlainText(monster.description),
  ]).slice(0, CONTEXT_LIMIT);
}

/** Mirrors `aiContext` in SpellDetail.vue, clamped like `useEntityImageGeneration`. */
export function spellContext(spell: Pick<SpellFacts, "name" | "level" | "school" | "description">): string {
  return buildEntityContext([
    spell.name,
    `${spell.level === 0 ? "cantrip" : `level ${spell.level}`} ${spell.school} spell`,
    toPlainText(spell.description),
  ]).slice(0, CONTEXT_LIMIT);
}

/** Mirrors the identified-art `aiContext` in ItemDetail.vue, clamped like `useEntityImageGeneration`. */
export function itemContext(item: ItemFacts): string {
  return buildEntityContext([
    item.name,
    ITEM_TYPE_LABELS[item.item_type] ?? item.item_type,
    ITEM_RARITY_LABELS[item.rarity] ?? item.rarity,
    toPlainText(item.description),
  ]).slice(0, CONTEXT_LIMIT);
}

// ---------------------------------------------------------------------------
// Pure parts: slugs, paths, variants

/** Lowercase, ASCII, `[a-z0-9_-]` only, so it is safe as a file name and a manifest key. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type EntryRef = { kind: "spell"; id: string } | { kind: "monster"; id: string } | { kind: "item"; name: string };

export function entrySlug(ref: EntryRef): string {
  const slug = ref.kind === "item" ? slugify(ref.name) : slugify(ref.id);
  if (slug === "") throw new Error(`Cannot derive a slug from ${JSON.stringify(ref)}.`);
  return `${ref.kind}-${slug}`;
}

/** `srd/<uuid>.webp`: the admin-only prefix, never a user folder. */
export function newOriginalPath(uuid: string = randomUUID()): string {
  return `srd/${uuid}.webp`;
}

/** Mirrors `variantPath` in src/lib/storage/buckets.ts. */
export function variantPath(originalPath: string, width: number): string {
  const lastDot = originalPath.lastIndexOf(".");
  const stem = lastDot === -1 ? originalPath : originalPath.slice(0, lastDot);
  return `${stem}_w${width}.webp`;
}

/** The size a variant is rendered at: scaled to `width`, never enlarged. */
export function variantSize(original: { width: number; height: number }, width: number): { width: number; height: number } {
  const scale = Math.min(1, width / original.width);
  return { width: Math.round(original.width * scale), height: Math.round(original.height * scale) };
}

// ---------------------------------------------------------------------------
// Pure parts: which rows get the URL

/** The `library_spells` rows a published spell image lands on: the spell itself, and each same-named spell with no canonical row of its own. */
export function selectSpellRowsToUpdate(
  target: { id: string; name: string },
  spells: readonly { id: string; name: string }[],
  idsWithCanonical: ReadonlySet<string>,
): string[] {
  const lowered = target.name.toLowerCase();
  const ids = new Set<string>([target.id]);
  for (const spell of spells) {
    if (spell.id === target.id) continue;
    if (spell.name.toLowerCase() !== lowered) continue;
    if (idsWithCanonical.has(spell.id)) continue;
    ids.add(spell.id);
  }
  return [...ids].sort();
}

/** Every name a published item image lands on: the entry's own, then its `--also` names. */
export function itemNames(entry: Pick<ManifestEntry, "name" | "alsoNames">): string[] {
  return [entry.name, ...entry.alsoNames];
}

/** The `library_items` rows a published item image lands on: every row of any of those names. */
export function selectItemRowsToUpdate(names: readonly string[], items: readonly { id: string; name: string }[]): string[] {
  const lowered = new Set(names.map((name) => name.toLowerCase()));
  return items.filter((item) => lowered.has(item.name.toLowerCase())).map((item) => item.id).sort();
}

/**
 * The `library_monsters` rows a published monster image lands on: that id and
 * its `--also` ids. `sync_library_monster_art()` matches `entry_id = id` and
 * nothing else, so there is no namesake rule; one creature's editions and
 * publishers share a picture only when they are named (#955).
 */
export function selectMonsterRowsToUpdate(target: Pick<ManifestEntry, "alsoIds"> & { id: string }): string[] {
  return [...new Set([target.id, ...target.alsoIds])].sort();
}

/** Escapes `%`, `_` and `\` so a name can be used as an exact-match `ilike` pattern. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Pure parts: manifest

export type EntryStatus = "candidate" | "approved" | "published";

export interface PublishRecord {
  bucket: string;
  /** Original object path, fixed on the first publish attempt so a re-run reuses it. */
  path: string;
  url: string | null;
  publishedAt: string | null;
  rowsUpdated: string[];
}

export interface ManifestEntry {
  slug: string;
  kind: ArtKind;
  /** Library spell or monster id; null for items. */
  id: string | null;
  /** The entry's name. */
  name: string;
  /** Item entries only: further library item names the same picture is published to (`--also`). */
  alsoNames: string[];
  /** Monster entries only: further library monster ids the same picture is published to (`--also`). */
  alsoIds: string[];
  context: string;
  subject: string;
  /** Who wrote the subject: the text model, as in the app, or a person through `--subject`. */
  subjectSource: "model" | "written";
  imagePrompt: string;
  provider: string;
  model: string;
  textModel: string;
  quality: string | null;
  size: string;
  generatedAt: string;
  providerFile: string;
  finalFile: string;
  providerBytes: number;
  finalBytes: number;
  /** Token usage the provider reported for the image call, or null when it sent none. What the image actually cost is this times the model's rates. */
  imageUsage: ImageUsage | null;
  status: EntryStatus;
  publish: PublishRecord | null;
}

/** The `usage` block of an OpenAI image response, as `openaiUsage` in `_shared/imageGen.ts` reads it. */
export interface ImageUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface Manifest {
  version: 1;
  entries: ManifestEntry[];
}

export function emptyManifest(): Manifest {
  return { version: 1, entries: [] };
}

/** Adds an entry, or replaces the one with the same slug in place. */
export function upsertEntry(manifest: Manifest, entry: ManifestEntry): Manifest {
  const at = manifest.entries.findIndex((e) => e.slug === entry.slug);
  const entries = at === -1 ? [...manifest.entries, entry] : manifest.entries.map((e, i) => (i === at ? entry : e));
  return { ...manifest, entries };
}

export function updateEntry(manifest: Manifest, slug: string, change: Partial<ManifestEntry>): Manifest {
  if (!manifest.entries.some((e) => e.slug === slug)) throw new Error(`No manifest entry "${slug}".`);
  return { ...manifest, entries: manifest.entries.map((e) => (e.slug === slug ? { ...e, ...change } : e)) };
}

export function isManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { version?: unknown; entries?: unknown };
  return v.version === 1 && Array.isArray(v.entries);
}

export function readManifest(dir: string): Manifest {
  const file = join(dir, MANIFEST_FILE);
  if (!existsSync(file)) return emptyManifest();
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isManifest(parsed)) throw new Error(`${file} is not a version 1 manifest.`);
  return parsed;
}

export function writeManifest(dir: string, manifest: Manifest): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** The entries `publish` acts on: approved ones, or every unpublished one with `approveAll`; `only` narrows to one slug. */
export function selectForPublish(manifest: Manifest, opts: { approveAll: boolean; only: string | null }): ManifestEntry[] {
  if (opts.only !== null && !manifest.entries.some((e) => e.slug === opts.only)) {
    throw new Error(`--only ${opts.only}: no such manifest entry.`);
  }
  return manifest.entries.filter((e) => {
    if (opts.only !== null && e.slug !== opts.only) return false;
    if (e.status === "published") return false;
    return e.status === "approved" || opts.approveAll;
  });
}

// ---------------------------------------------------------------------------
// Pure parts: arguments and refusals

export interface GenerateOptions {
  command: "generate";
  spells: string[];
  monsters: string[];
  items: string[];
  out: string;
  only: string | null;
  yesSpend: boolean;
  /**
   * A visual description written by a person, used in place of the text
   * model's for the one entry named. For when the model's subject keeps
   * producing the wrong picture: the style prompt and the image model are
   * unchanged, only the description is art-directed.
   */
  subject: string | null;
  /** Further item names that share the one `--item`'s picture. */
  also: string[];
  /** An OpenAI image model to render with instead of `provider_config`'s, e.g. `gpt-image-2.5-sunburst`. */
  imageModel: string | null;
}

export interface PublishOptions {
  command: "publish";
  out: string;
  only: string | null;
  approveAll: boolean;
  write: boolean;
  yesProduction: boolean;
  libraryOwner: string | null;
  cdnBase: string | null;
}

export type CliOptions = GenerateOptions | PublishOptions;

export function parseCli(argv: readonly string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      spell: { type: "string", multiple: true },
      monster: { type: "string", multiple: true },
      item: { type: "string", multiple: true },
      out: { type: "string" },
      only: { type: "string" },
      "yes-spend": { type: "boolean", default: false },
      subject: { type: "string" },
      also: { type: "string", multiple: true },
      "image-model": { type: "string" },
      "approve-all": { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      "library-owner": { type: "string" },
      "cdn-base": { type: "string" },
    },
  });
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== "generate" && command !== "publish")) {
    throw new Error("Usage: library:art <generate|publish> --out <dir> [options]. See the header of scripts/generate-library-art.ts.");
  }
  if (!values.out) throw new Error("--out <dir> is required.");
  const only = values.only ?? null;

  if (command === "generate") {
    const spells = values.spell ?? [];
    const monsters = values.monster ?? [];
    const items = values.item ?? [];
    const count = spells.length + monsters.length + items.length;
    if (count === 0) throw new Error("Name at least one entry with --spell <library id>, --monster <library id> or --item \"<name>\".");
    if (values.write || values["approve-all"]) throw new Error("--write and --approve-all belong to publish.");
    const subject = values.subject === undefined ? null : values.subject.trim();
    if (subject !== null) {
      if (subject === "") throw new Error("--subject must not be empty.");
      // One description cannot be right for two pictures.
      if (count !== 1) throw new Error("--subject describes one image: name exactly one --spell, --monster or --item with it.");
    }
    const also = (values.also ?? []).map((name) => name.trim());
    if (also.length > 0) {
      // A shared picture is drawn from one entry's facts, so it needs exactly one
      // item (the others are item names) or one monster (the others are monster ids).
      if (count !== 1 || spells.length > 0) throw new Error("--also shares one picture: name exactly one --item or --monster with it.");
      if (also.some((name) => name === "")) throw new Error("--also must not be empty.");
      const lowered = [...items, ...monsters, ...also].map((name) => name.toLowerCase());
      if (new Set(lowered).size !== lowered.length) throw new Error("--also names an entry twice.");
    }
    const imageModel = values["image-model"]?.trim() || null;
    if (imageModel !== null && !imageModel.startsWith("gpt-image-")) throw new Error("--image-model must name an OpenAI gpt-image model.");
    return { command, spells, monsters, items, out: values.out, only, yesSpend: values["yes-spend"], subject, also, imageModel };
  }

  if (values.subject !== undefined) throw new Error("--subject belongs to generate.");
  if (values.also !== undefined) throw new Error("--also belongs to generate.");
  if (values["image-model"] !== undefined) throw new Error("--image-model belongs to generate.");

  if (values.spell || values.monster || values.item) throw new Error("--spell, --monster and --item belong to generate.");
  if (values["yes-spend"]) throw new Error("--yes-spend belongs to generate.");
  const owner = values["library-owner"] ?? null;
  if (owner !== null && !UUID.test(owner)) throw new Error("--library-owner must be a uuid.");
  return {
    command,
    out: values.out,
    only,
    approveAll: values["approve-all"],
    write: values.write,
    yesProduction: values["yes-production"],
    libraryOwner: owner === null ? null : owner.toLowerCase(),
    cdnBase: values["cdn-base"]?.trim() || null,
  };
}

export function isLoopbackUrl(url: string): boolean {
  return LOOPBACK.has(new URL(url).hostname);
}

/** `generate` spends money: refuse until the caller has seen the plan and said so. */
export function assertMaySpend(opts: Pick<GenerateOptions, "yesSpend">): void {
  if (!opts.yesSpend) throw new Error("Refusing to make paid model calls without --yes-spend. Nothing was spent.");
}

/** `publish` writes only with `--write`; a non-loopback project also needs `--yes-production`. */
export function assertMayWrite(opts: Pick<PublishOptions, "write" | "yesProduction">, supabaseUrl: string): void {
  if (opts.write && !isLoopbackUrl(supabaseUrl) && !opts.yesProduction) {
    throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  }
}

/** Narrows the requested entries to `--only <slug>`, or throws when it names none of them. */
export function selectEntries<T extends EntryRef>(entries: readonly T[], only: string | null): T[] {
  if (only === null) return [...entries];
  const hit = entries.filter((e) => entrySlug(e) === only);
  if (hit.length === 0) throw new Error(`--only ${only}: it names none of the requested entries.`);
  return hit;
}

// ---------------------------------------------------------------------------
// Image encoding

export function sniffIsWebp(bytes: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return bytes.byteLength >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** Reads the provenance packet out of WebP bytes; null when there is none. */
export function readWebpProvenance(bytes: Uint8Array): AiProvenance | null {
  const packet = readXmpFromWebp(bytes);
  return packet === null ? null : parseXmpPacket(packet);
}

/**
 * The stored original: the provider's image as WebP at the target size, then
 * marked. Marking comes last because any re-encode drops the packet.
 */
export async function encodeFinal(
  provider: Uint8Array,
  prov: AiProvenance,
  target: { width: number; height: number; quality: number } = { width: FINAL_WIDTH, height: FINAL_HEIGHT, quality: FINAL_QUALITY },
): Promise<Uint8Array> {
  const webp = await sharp(provider)
    .resize(target.width, target.height, { fit: "cover" })
    .webp({ quality: target.quality })
    .toBuffer();
  return markGeneratedImage(new Uint8Array(webp), "image/webp", prov);
}

export interface Variant {
  width: number;
  path: string;
  bytes: Uint8Array;
}

/** The four size variants of a stored original, each re-marked (a re-encode drops the packet). */
export async function buildVariants(finalWebp: Uint8Array, originalPath: string, prov: AiProvenance): Promise<Variant[]> {
  const meta = await sharp(finalWebp).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read the original's dimensions.");
  const packet = buildXmpPacket(prov);
  return Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const size = variantSize({ width: meta.width as number, height: meta.height as number }, width);
      const resized = await sharp(finalWebp).resize(size.width, size.height).webp({ quality: VARIANT_QUALITY }).toBuffer();
      return { width, path: variantPath(originalPath, width), bytes: embedXmpInWebp(new Uint8Array(resized), packet) };
    }),
  );
}

export function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Pure parts: focal point guess

export interface FocalPoint {
  x: number;
  y: number;
}

/** What the vision model is asked to locate, per kind (#965: these answers held up on a spot check where image saliency did not). */
export function focalTarget(kind: ArtKind): string {
  if (kind === "monster") return "the creature's head or face (the point a portrait crop should centre on)";
  if (kind === "item") return "the centre of the main object (not the background props)";
  return "the centre of the main subject: the caster's face if a caster is the focus, otherwise the heart of the magical effect";
}

/** Reads the model's `{"x","y"}` answer as whole percents in 0-100; throws on anything else. */
export function parseFocalAnswer(text: string): FocalPoint {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error(`focal answer is not an object: ${text}`);
  const { x, y } = parsed as { x?: unknown; y?: unknown };
  const nx = Number(x), ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) throw new Error(`focal answer has no numeric x/y: ${text}`);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return { x: clamp(nx), y: clamp(ny) };
}

// ---------------------------------------------------------------------------
// I/O shell: database reads

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (npm run uses --env-file=.env.local).`);
  return value;
}

function connect(): { client: SupabaseClient; url: string } {
  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), url };
}

async function loadSpell(client: SupabaseClient, id: string): Promise<SpellFacts> {
  const { data, error } = await client
    .from("library_spells")
    .select("id, name, level, school, description")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read library_spells ${id}: ${error.message}`);
  if (!data) throw new Error(`No library spell with id "${id}".`);
  return data as SpellFacts;
}

async function loadItem(client: SupabaseClient, name: string): Promise<ItemFacts> {
  const { data, error } = await client
    .from("library_items")
    .select("id, name, item_type, rarity, description")
    .ilike("name", escapeLikePattern(name))
    .order("id");
  if (error) throw new Error(`Could not read library_items "${name}": ${error.message}`);
  const rows = (data as (ItemFacts & { id: string })[]).filter((r) => r.name.toLowerCase() === name.toLowerCase());
  if (rows.length === 0) throw new Error(`No library item named "${name}".`);
  // Rows of the same name (one per ruleset) share one image; the first by id supplies the facts.
  return rows[0];
}

async function loadMonster(client: SupabaseClient, id: string): Promise<MonsterFacts> {
  const { data, error } = await client
    .from("library_monsters")
    .select("id, name, size, monster_type, alignment, habitat, description")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read library_monsters ${id}: ${error.message}`);
  if (!data) throw new Error(`No library monster with id "${id}".`);
  return data as MonsterFacts;
}

interface GenerationSettings {
  imageBase: string;
  textModel: string;
  imageModel: string;
  quality: string | null;
}

async function loadSettings(client: SupabaseClient): Promise<GenerationSettings> {
  const base = await client.from("ai_system_prompts").select("content").eq("generator_type", "image_base").maybeSingle();
  if (base.error) throw new Error(`Could not read image_base: ${base.error.message}`);
  if (!base.data?.content) throw new Error("No image_base prompt on this project.");

  const config = await client
    .from("provider_config")
    .select("text_model, image_model, image_quality")
    .eq("provider", "openai")
    .maybeSingle();
  if (config.error) throw new Error(`Could not read provider_config: ${config.error.message}`);
  if (!config.data?.text_model || !config.data.image_model) throw new Error("provider_config for openai has no text_model or image_model.");

  const quality = await resolveImageQuality(client, "entity_image", { base: "openai", imageQuality: config.data.image_quality });
  return { imageBase: base.data.content, textModel: config.data.text_model, imageModel: config.data.image_model, quality };
}

// ---------------------------------------------------------------------------
// generate

interface PlannedEntry {
  ref: EntryRef;
  name: string;
  context: string;
  alsoNames: string[];
  alsoIds: string[];
  /** The setting passed to the image prompt: an item's staging, the spell guard rails, empty for monsters. */
  setting: string;
  scene: ItemScene | null;
}

async function planEntries(client: SupabaseClient, opts: GenerateOptions): Promise<PlannedEntry[]> {
  const refs: EntryRef[] = [
    ...opts.spells.map((id): EntryRef => ({ kind: "spell", id })),
    ...opts.monsters.map((id): EntryRef => ({ kind: "monster", id })),
    ...opts.items.map((name): EntryRef => ({ kind: "item", name })),
  ];
  const seen = new Set<string>();
  for (const ref of refs) {
    const slug = entrySlug(ref);
    if (seen.has(slug)) throw new Error(`Entry "${slug}" is named twice.`);
    seen.add(slug);
  }
  const chosen = selectEntries(refs, opts.only);
  const planned: PlannedEntry[] = [];
  for (const ref of chosen) {
    if (ref.kind === "spell") {
      const spell = await loadSpell(client, ref.id);
      planned.push({ ref, name: spell.name, context: spellContext(spell), alsoNames: [], alsoIds: [], setting: SPELL_SETTING, scene: null });
    } else if (ref.kind === "monster") {
      const monster = await loadMonster(client, ref.id);
      // Fail before spending when a shared id is wrong.
      const alsoIds: string[] = [];
      for (const id of opts.also) alsoIds.push((await loadMonster(client, id)).id);
      planned.push({ ref, name: monster.name, context: monsterContext(monster), alsoNames: [], alsoIds, setting: "", scene: null });
    } else {
      const item = await loadItem(client, ref.name);
      // Fail before spending when a shared name is misspelt, and record each as the library spells it.
      const alsoNames: string[] = [];
      for (const name of opts.also) alsoNames.push((await loadItem(client, name)).name);
      planned.push({ ref, name: item.name, context: itemContext(item), alsoNames, alsoIds: [], setting: itemSetting(item), scene: itemScene(item) });
    }
  }
  return planned;
}

/** Mirrors `openaiReasoningParams` in `_shared/textGen.ts`. */
function reasoningParams(model: string): Record<string, string> {
  return model === "gpt-5.6" || model.startsWith("gpt-5.6-") ? { reasoning_effort: "low" } : {};
}

interface OpenAiErrorBody {
  error?: { message?: string };
}

/**
 * The prompt-author call, as `openaiText` in `_shared/textGen.ts` makes it with
 * `outputFormat: "text"`. Called directly because `_shared/textGen.ts` and
 * `imageGen.ts` do not type-check under tsconfig.node.json (`Response.json()`
 * is `unknown` there), so importing them would fail the scripts' typecheck.
 */
async function openaiText(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      ...reasoningParams(model),
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as OpenAiErrorBody;
    throw new Error(body.error?.message ?? `OpenAI text error ${res.status}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

/** Valid OpenAI gpt-image `quality` values, as `OPENAI_QUALITIES` in `_shared/imageGen.ts`. */
const OPENAI_QUALITIES = new Set(["low", "medium", "high", "auto"]);

/**
 * The render call, as `openaiGenerate` in `_shared/imageGen.ts` makes it with no
 * source images and no screening: WebP output, `moderation: "low"`.
 */
async function openaiImage(
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  quality: string | null,
): Promise<{ b64: string; usage: ImageUsage | null }> {
  // The organization's image limit is a few renders a minute (#962), and a 429 is
  // not billed: wait as long as the error says, then try again.
  for (let attempt = 1; ; attempt++) {
    try {
      return await openaiImageOnce(apiKey, model, prompt, size, quality);
    } catch (error) {
      const wait = error instanceof RateLimitError && attempt < 6 ? error.retryAfterMs : null;
      if (wait === null) throw error;
      console.log(`  rate limited; retrying in ${Math.ceil(wait / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterMs: number) {
    super(message);
  }
}

/** Reads "try again in 12s" (or "1.5s", "500ms") out of an OpenAI rate-limit message; 20s when it names none. */
export function retryAfterMs(message: string): number {
  const match = message.match(/try again in (\d+(?:\.\d+)?)(ms|s)\b/i);
  if (!match) return 20000;
  const value = Number(match[1]);
  return Math.ceil(match[2].toLowerCase() === "ms" ? value : value * 1000) + 1000;
}

async function openaiImageOnce(
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  quality: string | null,
): Promise<{ b64: string; usage: ImageUsage | null }> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      size,
      output_format: "webp",
      moderation: "low",
      ...(quality !== null && OPENAI_QUALITIES.has(quality) ? { quality } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as OpenAiErrorBody;
    const message = body.error?.message ?? `OpenAI image generation error ${res.status}`;
    if (res.status === 429) throw new RateLimitError(message, retryAfterMs(message));
    throw new Error(message);
  }
  const data = (await res.json()) as {
    data: { b64_json: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage: ImageUsage | null = data.usage
    ? {
        inputTokens: typeof data.usage.input_tokens === "number" ? data.usage.input_tokens : null,
        outputTokens: typeof data.usage.output_tokens === "number" ? data.usage.output_tokens : null,
      }
    : null;
  return { b64: data.data[0].b64_json, usage };
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Asks the text model where the picture's focus is. `imageUrl` must be publicly fetchable (the CDN variant). */
async function guessFocalPoint(apiKey: string, model: string, imageUrl: string, kind: ArtKind): Promise<FocalPoint> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      ...reasoningParams(model),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You locate focal points in illustrations. Reply with JSON {"x": <0-100>, "y": <0-100>}: the position of ${focalTarget(kind)}, as a percentage of the image width (x, from the left) and height (y, from the top).`,
        },
        { role: "user", content: [{ type: "image_url", image_url: { url: imageUrl, detail: "low" } }] },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as OpenAiErrorBody;
    throw new Error(body.error?.message ?? `OpenAI focal guess error ${res.status}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return parseFocalAnswer(data.choices[0].message.content);
}

async function runGenerate(opts: GenerateOptions): Promise<void> {
  const { client, url } = connect();
  console.log(`Project: ${url} (${isLoopbackUrl(url) ? "loopback" : "NOT loopback"})`);
  const configured = await loadSettings(client);
  const settings = opts.imageModel === null ? configured : { ...configured, imageModel: opts.imageModel };
  const planned = await planEntries(client, opts);

  console.log(`Image model:  ${settings.imageModel}`);
  console.log(`Text model:   ${settings.textModel}`);
  console.log(`Size:         ${ENTITY_IMAGE_SIZE}`);
  console.log(`Quality:      ${settings.quality ?? "(provider default)"}`);
  console.log(`Images:       ${planned.length} (one text call and one paid image call each)`);
  for (const p of planned) console.log(`  ${entrySlug(p.ref)}: ${p.name}${p.scene ? ` [${p.scene}]` : ""}${[...p.alsoNames, ...p.alsoIds].length > 0 ? ` (also ${[...p.alsoNames, ...p.alsoIds].join("; ")})` : ""}`);
  assertMaySpend(opts);

  const openaiKey = requireEnv("OPENAI_API_KEY");
  mkdirSync(opts.out, { recursive: true });
  let manifest = readManifest(opts.out);

  for (const p of planned) {
    const slug = entrySlug(p.ref);
    const kind = p.ref.kind;
    console.log(`Generating ${slug} ...`);
    const text =
      opts.subject ??
      (await openaiText(
        openaiKey,
        settings.textModel,
        buildImagePromptAuthorSystem(kind) + (p.scene !== null ? SCENE_IS_FIXED : "") + INJECTION_GUARD_SUFFIX,
        wrapUserInput(p.context),
      ));
    const subject = text.trim().slice(0, MAX_IMAGE_SUBJECT_CHARS);
    if (!subject) throw new Error(`${slug}: the text model returned no image description.`);
    const imagePrompt = buildSimpleImagePrompt({ base: settings.imageBase, setting: p.setting, subject });

    const image = await openaiImage(openaiKey, settings.imageModel, imagePrompt, ENTITY_IMAGE_SIZE, settings.quality);
    const providerBytes = base64ToBytes(image.b64);
    const prov: AiProvenance = {
      generatorType: kind,
      provider: "openai",
      model: settings.imageModel,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    const finalBytes = await encodeFinal(providerBytes, prov);

    // The image call asks for WebP output, so the provider bytes are WebP.
    const providerFile = `${slug}.provider.webp`;
    const finalFile = `${slug}.webp`;
    writeFileSync(join(opts.out, providerFile), providerBytes);
    writeFileSync(join(opts.out, finalFile), finalBytes);

    manifest = upsertEntry(manifest, {
      slug,
      kind,
      id: p.ref.kind === "item" ? null : p.ref.id,
      name: p.name,
      alsoNames: p.alsoNames,
      alsoIds: p.alsoIds,
      context: p.context,
      subject,
      subjectSource: opts.subject === null ? "model" : "written",
      imagePrompt,
      provider: "openai",
      model: settings.imageModel,
      textModel: settings.textModel,
      quality: settings.quality,
      size: ENTITY_IMAGE_SIZE,
      generatedAt: prov.generatedAt,
      providerFile,
      finalFile,
      providerBytes: providerBytes.byteLength,
      finalBytes: finalBytes.byteLength,
      imageUsage: image.usage,
      status: "candidate",
      publish: null,
    });
    writeManifest(opts.out, manifest);
    const tokens = image.usage ? `, ${image.usage.inputTokens ?? "?"} in / ${image.usage.outputTokens ?? "?"} out tokens` : "";
    console.log(`  ${providerFile} ${providerBytes.byteLength} bytes -> ${finalFile} ${finalBytes.byteLength} bytes${tokens}`);
  }
  console.log(`Done. Look at the images in ${opts.out}, set "status": "approved" on the keepers in ${MANIFEST_FILE}, then run publish.`);
}

// ---------------------------------------------------------------------------
// publish

/** Admin accounts, by the `app_metadata.role` claim `private.is_app_admin()` reads. */
async function findAdmins(client: SupabaseClient): Promise<string[]> {
  const admins: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const user of data.users) if (user.app_metadata?.role === "admin") admins.push(user.id);
    if (data.users.length < 200) break;
  }
  return admins;
}

async function resolveOwner(client: SupabaseClient, explicit: string | null): Promise<string> {
  if (explicit !== null) return explicit;
  const admins = await findAdmins(client);
  if (admins.length !== 1) throw new Error(`Found ${admins.length} admin accounts; pass --library-owner <uuid> to name the owner of the provenance rows.`);
  return admins[0];
}

interface Upload {
  key: string;
  bytes: Uint8Array;
}

/** PUTs one object unless an identical one is already there (size and MD5 etag). */
async function putIfDifferent(r2: R2Config, upload: Upload): Promise<"skipped" | "uploaded" | "replaced"> {
  const existing = await headObject(r2, upload.key);
  if (existing !== null && existing.size === upload.bytes.byteLength && existing.etag === md5Hex(upload.bytes)) return "skipped";
  await putObject(r2, { key: upload.key, body: upload.bytes, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
  return existing === null ? "uploaded" : "replaced";
}

async function selectRows(client: SupabaseClient, entry: ManifestEntry): Promise<string[]> {
  if (entry.kind === "spell") {
    if (entry.id === null) throw new Error(`${entry.slug}: a spell entry needs an id.`);
    const found = await client.from("library_spells").select("id, name").eq("id", entry.id).maybeSingle();
    if (found.error) throw new Error(`Could not read library_spells ${entry.id}: ${found.error.message}`);
    if (!found.data) throw new Error(`${entry.slug}: library spell "${entry.id}" no longer exists.`);
    const spellName = (found.data as { name: string }).name;
    const same = await client.from("library_spells").select("id, name").ilike("name", escapeLikePattern(spellName));
    if (same.error) throw new Error(`Could not read same-named spells: ${same.error.message}`);
    const spells = (same.data as { id: string; name: string }[]).filter((s) => s.name.toLowerCase() === spellName.toLowerCase());
    const canon = await client.from("library_spell_art_canonical").select("entry_id").in("entry_id", spells.map((s) => s.id));
    if (canon.error) throw new Error(`Could not read library_spell_art_canonical: ${canon.error.message}`);
    const withCanonical = new Set((canon.data as { entry_id: string }[]).map((r) => r.entry_id));
    return selectSpellRowsToUpdate({ id: entry.id, name: spellName }, spells, withCanonical);
  }
  if (entry.kind === "monster") {
    if (entry.id === null) throw new Error(`${entry.slug}: a monster entry needs an id.`);
    const ids = selectMonsterRowsToUpdate({ id: entry.id, alsoIds: entry.alsoIds });
    const found = await client.from("library_monsters").select("id").in("id", ids);
    if (found.error) throw new Error(`Could not read library_monsters: ${found.error.message}`);
    const present = new Set((found.data as { id: string }[]).map((r) => r.id));
    const missing = ids.filter((id) => !present.has(id));
    if (missing.length > 0) throw new Error(`${entry.slug}: library monster ${missing.join(", ")} no longer exists.`);
    return ids;
  }
  const ids: string[] = [];
  for (const name of itemNames(entry)) {
    const { data, error } = await client.from("library_items").select("id, name").ilike("name", escapeLikePattern(name));
    if (error) throw new Error(`Could not read library_items: ${error.message}`);
    const found = selectItemRowsToUpdate([name], data as { id: string; name: string }[]);
    if (found.length === 0) throw new Error(`${entry.slug}: no library item named "${name}".`);
    ids.push(...found);
  }
  return [...new Set(ids)].sort();
}

async function writeRows(client: SupabaseClient, entry: ManifestEntry, ids: string[], url: string): Promise<void> {
  if (entry.kind === "spell") {
    if (entry.id === null) throw new Error(`${entry.slug}: a spell entry needs an id.`);
    const art = await client.from("library_spell_art_canonical").upsert({ entry_id: entry.id, image_url: url }, { onConflict: "entry_id" });
    if (art.error) throw new Error(`Could not upsert library_spell_art_canonical: ${art.error.message}`);
    const rows = await client.from("library_spells").update({ image_url: url }).in("id", ids);
    if (rows.error) throw new Error(`Could not update library_spells: ${rows.error.message}`);
    return;
  }
  if (entry.kind === "monster") {
    if (entry.id === null) throw new Error(`${entry.slug}: a monster entry needs an id.`);
    // The canonical row also carries cutout_url and portrait_focal_point, which an
    // upsert of {entry_id, image_url} would not null but which are not ours to
    // touch either: update only image_url when the row exists, insert when not.
    for (const id of ids) {
      const existing = await client.from("library_monster_art_canonical").select("entry_id").eq("entry_id", id).maybeSingle();
      if (existing.error) throw new Error(`Could not read library_monster_art_canonical: ${existing.error.message}`);
      const art = existing.data
        ? await client.from("library_monster_art_canonical").update({ image_url: url }).eq("entry_id", id)
        : await client.from("library_monster_art_canonical").insert({ entry_id: id, image_url: url });
      if (art.error) throw new Error(`Could not write library_monster_art_canonical: ${art.error.message}`);
    }
    const rows = await client.from("library_monsters").update({ image_url: url }).in("id", ids);
    if (rows.error) throw new Error(`Could not update library_monsters: ${rows.error.message}`);
    return;
  }
  const art = await client
    .from("library_art_defaults")
    .upsert(
      itemNames(entry).map((name) => ({ content_type: "item", content_name: name.toLowerCase(), image_url: url })),
      { onConflict: "content_type,content_name" },
    );
  if (art.error) throw new Error(`Could not upsert library_art_defaults: ${art.error.message}`);
  const rows = await client.from("library_items").update({ image_url: url }).in("id", ids);
  if (rows.error) throw new Error(`Could not update library_items: ${rows.error.message}`);
}

/**
 * Writes the focal point for a just-published picture and marks it unchecked
 * (`focal_point_checked_at` null) so the admin focal-point queue (#965) shows it
 * for review. A new picture always replaces the old point: that point was set
 * on the picture this one replaces. `null` (the guess failed) clears it, so the
 * cards fall back to their default crop instead of the old picture's point.
 */
async function writeFocalGuess(client: SupabaseClient, entry: ManifestEntry, ids: string[], focal: FocalPoint | null): Promise<void> {
  const check = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`Could not write the focal point on ${what}: ${error.message}`);
  };
  if (entry.kind === "spell") {
    if (entry.id === null) throw new Error(`${entry.slug}: a spell entry needs an id.`);
    check((await client.from("library_spell_art_canonical").update({ portrait_focal_point: focal, focal_point_checked_at: null }).eq("entry_id", entry.id)).error, "library_spell_art_canonical");
    check((await client.from("library_spells").update({ image_focal_point: focal }).in("id", ids)).error, "library_spells");
    return;
  }
  if (entry.kind === "monster") {
    check((await client.from("library_monster_art_canonical").update({ portrait_focal_point: focal, focal_point_checked_at: null }).in("entry_id", ids)).error, "library_monster_art_canonical");
    check((await client.from("library_monsters").update({ portrait_focal_point: focal }).in("id", ids)).error, "library_monsters");
    return;
  }
  const names = itemNames(entry).map((name) => name.toLowerCase());
  check((await client.from("library_art_defaults").update({ image_focal_point: focal, focal_point_checked_at: null }).eq("content_type", "item").in("content_name", names)).error, "library_art_defaults");
  check((await client.from("library_items").update({ image_focal_point: focal }).in("id", ids)).error, "library_items");
}

async function runPublish(opts: PublishOptions): Promise<void> {
  const { client, url: supabaseUrl } = connect();
  const loopback = isLoopbackUrl(supabaseUrl);
  console.log(`Target: ${supabaseUrl} (${loopback ? "loopback" : "NOT loopback"})`);
  console.log(`Mode:   ${opts.write ? "write" : "dry-run"}`);
  assertMayWrite(opts, supabaseUrl);

  const cdnBase = opts.cdnBase ?? process.env.VITE_ASSET_CDN_URL?.trim() ?? null;
  const r2 = r2ConfigFrom((key) => process.env[key]);
  if (opts.write) {
    if (!cdnBase) throw new Error("Refusing to publish without a CDN base: set VITE_ASSET_CDN_URL or pass --cdn-base.");
    if (r2 === null) throw new Error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set to publish.");
  }

  let manifest = readManifest(opts.out);
  const entries = selectForPublish(manifest, { approveAll: opts.approveAll, only: opts.only });
  if (entries.length === 0) {
    console.log('Nothing to publish: no entry has status "approved" (edit manifest.json, or pass --approve-all).');
    return;
  }
  const owner = opts.write ? await resolveOwner(client, opts.libraryOwner) : opts.libraryOwner;
  // The focal guess reuses the platform text model, as `generate` does for subjects.
  const focalModel = opts.write ? (await loadSettings(client)).textModel : null;
  const openaiKey = opts.write ? requireEnv("OPENAI_API_KEY") : null;

  for (const entry of entries) {
    const bucket = BUCKET_FOR_KIND[entry.kind];
    const path = entry.publish?.path ?? newOriginalPath();
    const finalBytes = new Uint8Array(readFileSync(join(opts.out, entry.finalFile)));
    if (!sniffIsWebp(finalBytes)) throw new Error(`${entry.finalFile} is not a WebP file.`);
    const found = readWebpProvenance(finalBytes);
    if (found === null) throw new Error(`${entry.finalFile} carries no provenance packet; regenerate it.`);
    const prov: AiProvenance = { generatorType: entry.kind, provider: entry.provider, model: entry.model, generatedAt: entry.generatedAt, edited: false };
    const variants = await buildVariants(finalBytes, path, prov);
    const uploads: Upload[] = [
      { key: r2ObjectKey(bucket, path), bytes: finalBytes },
      ...variants.map((v) => ({ key: r2ObjectKey(bucket, v.path), bytes: v.bytes })),
    ];
    const storedUrl = assetCdnUrl(bucket, path, cdnBase);
    if (storedUrl === null) throw new Error(`Bucket ${bucket} is not served through the asset CDN (or no CDN base is set).`);
    const rowIds = await selectRows(client, entry);

    console.log(`${entry.slug} (${itemNames(entry).join("; ")})`);
    for (const u of uploads) console.log(`  R2 ${u.key} ${u.bytes.byteLength} bytes`);
    console.log(`  provenance ${bucket} ${path} owner ${owner ?? "(resolved at --write)"}`);
    console.log(`  ${TABLES_FOR_KIND[entry.kind]} -> ${storedUrl}`);
    console.log(`  rows: ${rowIds.join(", ")}`);
    console.log("  focal: guessed by the text model after upload, marked unchecked for the focal-point queue");
    if (!opts.write || r2 === null || owner === null) continue;

    // Fix the path before the first byte leaves, so a re-run reuses it.
    manifest = updateEntry(manifest, entry.slug, {
      publish: { bucket, path, url: null, publishedAt: null, rowsUpdated: [] },
    });
    writeManifest(opts.out, manifest);

    for (const u of uploads) {
      const result = await putIfDifferent(r2, u);
      console.log(`  ${result} ${u.key}`);
    }
    await registerImageProvenance(client, bucket, path, owner, prov);
    await writeRows(client, entry, rowIds, storedUrl);
    let focal: FocalPoint | null = null;
    try {
      if (openaiKey === null || focalModel === null) throw new Error("no model");
      focal = await guessFocalPoint(openaiKey, focalModel, assetCdnUrl(bucket, variantPath(path, 400), cdnBase) ?? storedUrl, entry.kind);
    } catch (error) {
      console.log(`  focal guess failed (${error instanceof Error ? error.message : String(error)}); cleared, the card uses its default crop`);
    }
    await writeFocalGuess(client, entry, rowIds, focal);
    if (focal) console.log(`  focal ${focal.x},${focal.y} (unchecked)`);
    manifest = updateEntry(manifest, entry.slug, {
      status: "published",
      publish: { bucket, path, url: storedUrl, publishedAt: new Date().toISOString(), rowsUpdated: rowIds },
    });
    writeManifest(opts.out, manifest);
    console.log(`  published ${storedUrl}`);
  }
  if (!opts.write) console.log("Dry run: nothing written. Re-run with --write (and --yes-production on a hosted project) to apply.");
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  if (opts.command === "generate") await runGenerate(opts);
  else await runPublish(opts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
