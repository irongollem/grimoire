#!/usr/bin/env tsx
/**
 * Generate `src/generated/artManifest.json` (#864).
 *
 * Maps every build-relative art path to the content-hashed CDN key it will
 * live under once published to R2 under `ART_PREFIX` (`app-art/`) — see
 * `src/lib/assets/artUrl.ts`, which is the only reader of this file at
 * runtime, and `scripts/art-publish.ts` (A3), which uploads bytes to the keys
 * this file names.
 *
 * Needs **no credentials**: it only hashes files already on disk, so the
 * manifest can be committed and kept in sync independently of any upload —
 * new art lands with its manifest entry in the same commit, and publishing to
 * R2 is a separate, later step.
 *
 * Two source trees, both folded into one virtual `/assets/...` namespace so
 * every art path — regardless of which physical tree it happens to live in —
 * resolves through the same lookup:
 *
 *   public/assets/**      → /assets/**      (served verbatim by Vite today)
 *   src/assets/sheets/**  → /assets/sheets/** (bundled + hashed by Vite today)
 *
 * Usage:
 *   npm run art:manifest             # regenerate src/generated/artManifest.json
 *   npm run art:manifest -- --check  # exit 1 if the committed file is stale
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
// Imported from artPrefix directly, never from artUrl.ts — artUrl.ts pulls in
// src/lib/storage/buckets.ts, which reads import.meta.env at module scope and
// throws under plain Node (see artPrefix.ts's docstring).
import { ART_PREFIX } from "@/lib/assets/artPrefix";
import { isCliEntry } from "./lib/cli";

const REPO_ROOT = join(import.meta.dirname, "..");
const MANIFEST_PATH = join(REPO_ROOT, "src/generated/artManifest.json");

/**
 * Art trees to scan, each mapped onto the shared `/assets/...` manifest
 * namespace. Walking the whole of `public/assets` (rather than naming its
 * subfolders one by one) is deliberate: it is the only way a new subfolder —
 * or a loose file dropped straight in `public/assets/` — is picked up without
 * anyone remembering to add it here.
 */
const ROOTS: { dir: string; keyPrefix: string }[] = [
  { dir: join(REPO_ROOT, "public/assets"), keyPrefix: "/assets" },
  { dir: join(REPO_ROOT, "src/assets/sheets"), keyPrefix: "/assets/sheets" },
];

/**
 * Recognised art file extensions. Anything else under a scanned tree (an
 * editor artifact like `.DS_Store`, a stray text file) is silently skipped
 * rather than hashed into the manifest.
 */
const ART_EXTENSIONS = new Set([
  ".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".avif",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm",
]);

/**
 * Manifest keys deliberately withheld from the manifest, so `artStripPlugin`
 * (vite.config.ts) can never strip them from `dist/` and `artUrl()` can never
 * resolve them to a CDN URL. Add an entry only with a documented reason.
 *
 * `/assets/scriptorium/page-background.webp` — referenced by literal
 * `url()`s in two plain CSS files (src/assets/scriptorium-editor.css,
 * src/assets/scriptorium/theme-base.css) that cannot call `artUrl()`.
 * Worse, theme-base.css is also `?inline`-imported into
 * `useScriptoriumPrint.ts` and injected as raw CSS text into an isolated
 * print iframe — and, per its own docstring, will later be handed unmodified
 * to a headless server renderer (Phase E). Neither context runs app JS or
 * inherits the main document's CSS custom properties, so a runtime-set
 * `--sc-*` variable can't reach it either. The only fix that works
 * everywhere is to keep this one file living at its literal path forever.
 */
const MANIFEST_EXCLUSIONS = new Set<string>(["/assets/scriptorium/page-background.webp"]);

export interface ArtFile {
  /** Absolute path on disk. */
  absPath: string;
  /** Manifest key — the build-relative path, e.g. `/assets/placeholders/npc.webp`. */
  key: string;
}

/** Recursively list every recognised art file under `roots`, sorted by key. */
export function scanArtFiles(roots: { dir: string; keyPrefix: string }[] = ROOTS): ArtFile[] {
  const files: ArtFile[] = [];

  function walk(dir: string, keyPrefix: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue; // .DS_Store and friends
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, `${keyPrefix}/${entry.name}`);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (!ART_EXTENSIONS.has(ext.toLowerCase())) continue;
      files.push({ absPath: abs, key: `${keyPrefix}/${entry.name}` });
    }
  }

  for (const { dir, keyPrefix } of roots) walk(dir, keyPrefix);
  files.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return files;
}

/** First 8 hex characters of the file's SHA-256 — short, stable, collision-safe at this scale. */
export function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

/** Insert `.<hash>` before a path's final extension: `a/b.webp` → `a/b.<hash>.webp`. */
function withHash(path: string, hash: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? `${path}.${hash}` : `${path.slice(0, dot)}.${hash}${path.slice(dot)}`;
}

export interface ManifestResult {
  /** key → CDN object key, sorted by key so the on-disk diff is stable. */
  manifest: Record<string, string>;
  fileCount: number;
  totalBytes: number;
}

/** Build the full manifest by hashing every file `scanArtFiles` finds. */
export function buildManifest(files: ArtFile[] = scanArtFiles()): ManifestResult {
  const entries: [string, string][] = [];
  let totalBytes = 0;

  for (const { absPath, key } of files) {
    if (MANIFEST_EXCLUSIONS.has(key)) continue;
    const bytes = readFileSync(absPath);
    totalBytes += bytes.byteLength;
    const hash = hashBytes(bytes);
    // Manifest keys are written with a leading slash; the CDN key is always
    // ART_PREFIX-relative and never carries one.
    const relKey = key.startsWith("/") ? key.slice(1) : key;
    entries.push([key, `${ART_PREFIX}/${withHash(relKey, hash)}`]);
  }

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { manifest: Object.fromEntries(entries), fileCount: entries.length, totalBytes };
}

/** Canonical on-disk form: two-space indent, trailing newline. */
export function formatManifest(manifest: Record<string, string>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function readCommitted(): string | null {
  return existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, "utf8") : null;
}

function main(): number {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const { manifest, fileCount, totalBytes } = buildManifest();
  const formatted = formatManifest(manifest);

  if (values.check) {
    const committed = readCommitted();
    if (committed === formatted) {
      console.log(
        `${relative(REPO_ROOT, MANIFEST_PATH)}: up to date — ${fileCount} entr${fileCount === 1 ? "y" : "ies"}, ${totalBytes} bytes.`,
      );
      return 0;
    }
    console.error(
      `${relative(REPO_ROOT, MANIFEST_PATH)}: stale.\n` +
        (committed === null
          ? "File does not exist yet."
          : "Run `npm run art:manifest` and commit the result. Diff:\n" +
            diffLines(committed, formatted)),
    );
    return 1;
  }

  writeFileSync(MANIFEST_PATH, formatted);
  console.log(
    `${relative(REPO_ROOT, MANIFEST_PATH)}: wrote ${fileCount} entr${fileCount === 1 ? "y" : "ies"}, ${totalBytes} bytes covered.`,
  );
  return 0;
}

/** Minimal line-level diff, readable enough for a terminal — not meant to be a real differ. */
function diffLines(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`  - ${a[i]}`);
    if (b[i] !== undefined) out.push(`  + ${b[i]}`);
  }
  return out.slice(0, 40).join("\n") + (out.length > 40 ? "\n  … and more" : "");
}

if (isCliEntry(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err: unknown) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
