/**
 * Publishes ONE library tile pack's art from a folder of runtime tiles (#891), as a draft.
 *
 * `seed-library-tile-packs` cannot do this: it re-reads all twelve packs from `public/cartographer/` and stamps `byteSize`
 * only on slots whose file is on disk, so running it would erase every tile the admin lane made. This script touches the one
 * pack it is named, and only the version it is named.
 *
 * The folder holds finished 128×128 WebP tiles at the paths a manifest names (`floor/0.webp`, `stairsUp/E/0.webp`), the
 * rotated slots included: it is what the art pipeline outside this repo produces after cutting, keying and rotating. Each
 * tile is marked with its AI provenance as it goes up, the pack row carries the same `ai_provenance`, and the manifest is
 * rebuilt from the folder alone (see `buildManifest`).
 *
 * Bytes go to R2 at `library-tile-packs/<row id>/v<version>/<path>`, the key the CDN serves and `libraryTileUrl` reads.
 * An optional `pack.json` in the folder carries what no tile can: `{ continuous?, labels?, doorLeaf?, lights?, flush?, motion? }` (see `parsePackSidecar`).
 * It is the only source of those manifest fields; they are never carried over from an older published version.
 *
 * The row stays a draft unless `--publish` is passed AND the pack has every required tile; publishing a reviewed draft is
 * otherwise the admin's Publish button, which runs the same check (`publish_library_pack`).
 *
 * A version that does not exist yet is created as a new draft row beside the old one, which is how a repaint of a published
 * pack is compared with it before either is retired.
 *
 * Usage:
 *   npm run tile-pack:publish -- --pack black-rock --dir ~/art/tiles/out/black-rock            (dry run)
 *   npm run tile-pack:publish -- --pack black-rock --dir … --exclude wallRoundJoint --write --yes-production
 *   flags: --version <n> (default: the pack's latest), --description <text>, --provider/--model/--generated-at,
 *          --exclude <category>[,…], --publish
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { headObject, putObject } from "../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom, r2ObjectKey } from "../supabase/functions/_shared/r2/config.ts";
import { markGeneratedImage } from "../supabase/functions/_shared/provenance/mark.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { webpDimensions } from "../supabase/functions/_shared/tilePackGeneration.ts";
import { hasCompleteArt } from "../src/cartographer/packCoverage.ts";
import { BASE_TILE_SIZE, type TilePackManifest } from "../src/cartographer/packSchema.ts";
import { isLoopback } from "./lib/dev-stack.ts";
import { createServiceClient, requireEnv } from "./lib/seed-helpers.ts";
import { SIDECAR_FILE, buildManifest, parsePackSidecar, type TileFile } from "./lib/tile-pack-publish.ts";

/** Literal, as in seed-library-tile-packs: `src/lib/storage/buckets.ts` reads `import.meta.env` and cannot load under node. */
const BUCKET = "library-tile-packs";

interface PackRow {
  id: string;
  pack_id: string;
  pack_version: number;
  name: string;
  description: string | null;
  status: string;
  manifest: TilePackManifest;
  sort_order: number;
  content_source_key: string | null;
  license_keys: string[];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function parseSidecarFile(path: string): ReturnType<typeof parsePackSidecar> {
  try {
    return parsePackSidecar(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return { sidecar: {}, errors: [`${SIDECAR_FILE}: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pack: { type: "string" }, dir: { type: "string" }, version: { type: "string" }, description: { type: "string" },
      provider: { type: "string", default: "openai" }, model: { type: "string", default: "chatgpt" }, "generated-at": { type: "string" },
      exclude: { type: "string" }, publish: { type: "boolean", default: false },
      write: { type: "boolean", default: false }, "yes-production": { type: "boolean", default: false },
    },
  });
  if (!values.pack || !values.dir) throw new Error("--pack and --dir are required.");
  const env = requireEnv();
  const loopback = isLoopback(new URL(env.supabaseUrl).hostname);
  console.log(`Target: ${env.supabaseUrl} (${loopback ? "loopback" : "NOT loopback"}), ${values.write ? "write" : "dry run"}`);
  if (values.write && !loopback && !values["yes-production"]) throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  const r2 = r2ConfigFrom((key) => process.env[key]);
  if (values.write && r2 === null) throw new Error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set to publish.");
  const client = createServiceClient(env);

  // The pack's rows: the named version, or the latest. A version beyond the latest becomes a new draft row.
  const { data, error } = await client.from("library_tile_packs").select("*").eq("pack_id", values.pack).order("pack_version", { ascending: false });
  if (error) throw error;
  const rows = data as PackRow[];
  if (rows.length === 0) throw new Error(`No library_tile_packs row for ${values.pack}.`);
  const version = values.version ? Number(values.version) : rows[0].pack_version;
  const existing = rows.find((r) => r.pack_version === version) ?? null;
  const template = existing ?? rows[0];
  if (!existing && version !== rows[0].pack_version + 1) throw new Error(`Version ${version} skips ahead of ${rows[0].pack_version}; a new version must be the next one.`);

  // The tiles: every .webp under --dir, minus excluded categories, each exactly 128×128.
  const excluded = new Set((values.exclude ?? "").split(",").filter(Boolean));
  const files: (TileFile & { bytes: Uint8Array })[] = [];
  const problems: string[] = [];
  for (const path of walk(values.dir).filter((p) => p.endsWith(".webp"))) {
    const rel = relative(values.dir, path).split("\\").join("/");
    if (excluded.has(rel.split("/")[0])) continue;
    const bytes = new Uint8Array(readFileSync(path));
    const size = webpDimensions(bytes);
    // A motion overlay (#1073) is a seamless tile of its own size, not a 128 px slot: it only has to be a WebP.
    if (rel.startsWith("motion/")) {
      if (!size) problems.push(`${rel}: not a WebP`);
      else files.push({ relative: rel, byteSize: bytes.byteLength, bytes });
      continue;
    }
    if (!size || size.width !== BASE_TILE_SIZE || size.height !== BASE_TILE_SIZE) { problems.push(`${rel}: not a ${BASE_TILE_SIZE}×${BASE_TILE_SIZE} WebP`); continue; }
    files.push({ relative: rel, byteSize: bytes.byteLength, bytes });
  }
  const generatedAt = values["generated-at"] ?? new Date(Math.max(...walk(values.dir).map((p) => statSync(p).mtimeMs))).toISOString();
  const prov: AiProvenance = { generatorType: "tile", provider: values.provider, model: values.model, generatedAt, edited: false };
  // Marking changes the bytes, so byteSize is taken after it: it is what the bucket will hold.
  const marked = files.map((f) => ({ ...f, bytes: markGeneratedImage(f.bytes, "image/webp", prov) })).map((f) => ({ ...f, byteSize: f.bytes.byteLength }));

  const description = values.description ?? template.description ?? "";
  const sidecarPath = join(values.dir, SIDECAR_FILE);
  const parsed = existsSync(sidecarPath) ? parseSidecarFile(sidecarPath) : { sidecar: {}, errors: [] };
  problems.push(...parsed.errors);
  const { manifest, errors } = buildManifest({ pack_id: template.pack_id, name: template.name, description, pack_version: version, palette: template.manifest.palette }, marked, Date.now(), parsed.sidecar);
  problems.push(...errors);
  if (problems.length) throw new Error(`Refusing to publish ${values.pack}:\n  ${problems.join("\n  ")}`);
  const complete = hasCompleteArt(manifest);
  if (values.publish && !complete) throw new Error(`${values.pack} v${version} lacks a required tile; it cannot be published.`);
  if (existing?.status === "published") throw new Error(`${values.pack} v${version} is published; replacing its art in place would change it for every DM. Publish a new --version instead.`);
  const status = values.publish ? "published" : "draft";

  const slots = Object.values(manifest.assets).reduce((n, list) => n + (list?.length ?? 0), 0);
  console.log(`${values.pack} v${version}: ${slots} tiles, ${complete ? "every required tile present" : "INCOMPLETE"}, row ${existing ? `${existing.id} (${existing.status})` : "new"} -> ${status}`);
  console.log(`  description: ${description}`);
  if (!values.write || r2 === null) { console.log("Dry run: nothing written. Re-run with --write (and --yes-production on a hosted project)."); return; }

  // The row first, so a new version has its id (the key prefix) before any byte leaves.
  const rowValues = { pack_id: template.pack_id, pack_version: version, name: template.name, description, schema_version: manifest.schema_version,
    manifest, status: "draft", content_source_key: template.content_source_key, license_keys: template.license_keys, ai_provenance: prov, sort_order: template.sort_order };
  const { data: saved, error: saveError } = existing
    ? await client.from("library_tile_packs").update({ description, schema_version: manifest.schema_version, ai_provenance: prov }).eq("id", existing.id).select("id").single()
    : await client.from("library_tile_packs").insert(rowValues).select("id").single();
  if (saveError) throw saveError;
  const rowId = (saved as { id: string }).id;

  let uploaded = 0;
  for (const file of marked) {
    const key = r2ObjectKey(BUCKET, `${rowId}/v${version}/${file.relative}`);
    const head = await headObject(r2, key);
    if (head?.size === file.byteSize && head.etag === createHash("md5").update(file.bytes).digest("hex")) continue;
    await putObject(r2, { key, body: file.bytes, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
    uploaded++;
  }
  // The manifest last: it is what makes a tile drawn, so it must never name bytes that are not there yet.
  const { error: manifestError } = await client.from("library_tile_packs").update({ manifest, status }).eq("id", rowId);
  if (manifestError) throw manifestError;
  console.log(`  ${uploaded} uploaded, ${marked.length - uploaded} already there; row ${rowId} is ${status}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
