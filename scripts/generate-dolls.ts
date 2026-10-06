/**
 * Makes the paper-doll sprite sheets (#975) with the platform image model.
 *
 * A Deno script, not tsx: it reuses the Deno-native edge modules directly
 * (`_shared/imageGen.ts`, `_shared/paperDoll/*`, provenance marking and the
 * R2-aware storage upload), so the art here is made by exactly the code the
 * `generate-character-doll` function runs.
 *
 *   templates  The two size templates (small, medium): a garb sheet drawn from
 *              text, then an armour sheet and a burden sheet drawn from it.
 *              This is APP ART. It writes public/assets/doll/<size>-<sheet>.webp,
 *              copies the garb and armour sheets into
 *              supabase/functions/generate-character-doll/templates/ (the edge
 *              function sends them as the reference for every character) and
 *              regenerates src/data/dollTemplates.ts (sheet paths + measured
 *              layouts). Never edit that file by hand.
 *
 *   species    Canonical species dolls (library art): one doll per
 *              `library_species` row (named by its `id`, e.g. `srd_srd_elf`; the table has no slug column), drawn from the template of its size.
 *              Writes to --out for review; `--write` uploads it under
 *              `species-images/srd/dolls/<slug>/` and sets library_species.doll.
 *
 * Every render is a paid call (about 5 cents each, 3 per doll: garb, armour,
 * burden; `templates` makes 3 per size). Use `--dry-run` to read the prompts
 * first; it calls and writes nothing.
 *
 * `templates` output is app art: after it runs, go through `npm run art:manifest`
 * and publish the bytes with `npm run art:publish` BEFORE a push, or production
 * serves 404s for the new files. Species `--write` to a hosted project is the
 * maintainer's call (`--yes-production`).
 *
 * Usage (npm scripts add the Deno flags and `--env-file=.env.local`):
 *   npm run doll:templates -- --dry-run
 *   npm run doll:templates                       both sizes
 *   npm run doll:templates -- --size small       one size, keeps the other's entries
 *   npm run doll:templates -- --remeasure        re-fit from the sheets on disk (after a layout.ts rule change), no render
 *   npm run doll:species -- srd_srd_elf srd_srd_dwarf --dry-run
 *   npm run doll:species -- srd_srd_elf                  review in ./.doll-out/srd_srd_elf/
 *   npm run doll:species -- srd_srd_elf --out some/dir
 *   npm run doll:species -- srd_srd_elf --write          upload (loopback project only)
 *   npm run doll:species -- srd_srd_elf --from .doll-out/srd_srd_elf --write --yes-production
 *
 * Env: OPENAI_API_KEY (renders); VITE_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY (species); ASSET_CDN_URL and the R2 variables for
 * `--write`, read through Deno.env exactly as the edge functions read them.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import decode from "npm:@jsquash/webp@1.5.0/decode.js";
import { generateImage } from "../supabase/functions/_shared/imageGen.ts";
import { markGeneratedImage } from "../supabase/functions/_shared/provenance/mark.ts";
import { publicUrlFor, uploadWithRetry } from "../supabase/functions/_shared/storage-upload.ts";
import { buildDollLayout, sheetCuts } from "../supabase/functions/_shared/paperDoll/layout.ts";
import {
  armourPrompt,
  burdenPrompt,
  DOLL_IMAGE_MODEL,
  DOLL_SHEET_SIZE,
  speciesGarbPrompt,
  templateGarbPrompt,
} from "../supabase/functions/_shared/paperDoll/prompts.ts";
import {
  DOLL_SHEET_KEYS,
  SHEET_WIDTH,
  templateSizeFor,
  type DollLayout,
  type DollSheetKey,
  type DollSheets,
  type DollTemplateSize,
} from "../supabase/functions/_shared/paperDoll/types.ts";

const SIZES: readonly DollTemplateSize[] = ["small", "medium"];
const ART_DIR = "public/assets/doll";
const EDGE_TEMPLATE_DIR = "supabase/functions/generate-character-doll/templates";
const GENERATED_FILE = "src/data/dollTemplates.ts";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SPECIES_BUCKET = "species-images";

// ---------------------------------------------------------------------------
// Small helpers

type Bytes = Uint8Array;
type Rendered = { raw: Bytes; marked: Bytes };

/** Report a fatal CLI error and exit with status 1. */
function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

/** Recognize localhost and loopback IP hosts; malformed URLs throw TypeError. */
function isLoopbackUrl(url: string): boolean {
  return LOOPBACK.has(new URL(url).hostname);
}

/** Read a required environment value, exiting with status 1 when missing or empty. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) fail(`${name} must be set (the npm script passes --env-file=.env.local).`);
  return value;
}

/** Wrap sheet bytes as a WebP source image. */
const blobOf = (bytes: Bytes): Blob => new Blob([bytes as BlobPart], { type: "image/webp" });

/**
 * Decode WebP bytes to RGBA for layout measurement. Reject decoder failures
 * and sheets whose width is not 1536 pixels; height is not validated here.
 */
async function decodeSheet(bytes: Bytes): Promise<Uint8Array> {
  const img = await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  if (img.width !== SHEET_WIDTH) throw new Error(`Sheet is ${img.width}px wide, expected ${SHEET_WIDTH}.`);
  return new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
}

/** Decode base64 image data; malformed base64 throws. */
function b64ToBytes(b64: string): Bytes {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * One paid render, marked for the EU AI Act before the bytes go anywhere.
 * Return both raw and provenance-marked bytes.
 * `generatorType` labels the provenance; `sources` are ordered reference images.
 * Missing OPENAI_API_KEY exits the script; generation and decoding errors propagate.
 */
async function render(label: string, generatorType: string, prompt: string, sources: Bytes[]): Promise<Rendered> {
  const started = performance.now();
  const result = await generateImage({
    provider: "openai",
    model: DOLL_IMAGE_MODEL,
    apiKey: requireEnv("OPENAI_API_KEY"),
    prompt,
    size: DOLL_SHEET_SIZE,
    quality: "high",
    sourceImages: sources.length ? sources.map(blobOf) : undefined,
    background: "transparent",
    boostStyle: false,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const u = result.usage;
  console.log(
    `  ${label}: ${seconds}s, tokens in ${u.input_tokens ?? "?"} (image ${u.input_image_tokens ?? "?"}) out ${u.output_tokens ?? "?"}`,
  );
  const raw = b64ToBytes(result.b64);
  const marked = markGeneratedImage(raw, result.contentType, {
    generatorType,
    provider: "openai",
    model: DOLL_IMAGE_MODEL,
    generatedAt: new Date().toISOString(),
    edited: false,
  });
  return { raw, marked };
}

/** Print a labeled prompt and reference-image descriptions for dry-run inspection. */
function printPrompt(label: string, prompt: string, sources: string[]) {
  console.log(`\n--- ${label} ---`);
  console.log(`sources: ${sources.length ? sources.join(", ") : "(none, text only)"}`);
  console.log(prompt);
}

/**
 * Render garb, then armor and burden from it, and return sheets plus measured
 * layout. Retry each sheet once if figures lack a separating gap, keeping the
 * second result. Rendering, decoding, and layout errors propagate.
 */
async function renderDoll(opts: {
  tag: string;
  generatorType: string;
  garbPrompt: string;
  garbSources: Bytes[];
  armourSources: (garb: Bytes) => Bytes[];
  armourText: string;
}): Promise<{ sheets: Record<DollSheetKey, Rendered>; layout: DollLayout }> {
  // Same rule as the edge function: a sheet whose figures touch is drawn once more.
  const renderSheet = async (label: string, prompt: string, sources: Bytes[]) => {
    const first = await render(label, opts.generatorType, prompt, sources);
    const firstPixels = await decodeSheet(first.raw);
    if (sheetCuts(firstPixels).clean) return { rendered: first, pixels: firstPixels };
    console.log(`  ${label}: figures touch, drawing it again`);
    const second = await render(`${label} (again)`, opts.generatorType, prompt, sources);
    return { rendered: second, pixels: await decodeSheet(second.raw) };
  };
  console.log(`${opts.tag}: rendering garb`);
  const garb = await renderSheet("garb", opts.garbPrompt, opts.garbSources);
  console.log(`${opts.tag}: rendering armour and burden in parallel`);
  const [armour, burden] = await Promise.all([
    renderSheet("armour", opts.armourText, opts.armourSources(garb.rendered.raw)),
    renderSheet("burden", burdenPrompt(), [garb.rendered.raw]),
  ]);
  const layout = buildDollLayout(garb.pixels, armour.pixels, burden.pixels);
  return { sheets: { garb: garb.rendered, armour: armour.rendered, burden: burden.rendered }, layout };
}

/**
 * Measure three WebP sheets named `<prefix><sheet>.webp` in `dir`. File read,
 * decoding, width validation, and empty-outfit measurement errors propagate.
 */
async function measureLayoutFromDisk(dir: string, prefix: string): Promise<DollLayout> {
  const read = (sheet: DollSheetKey) => Deno.readFile(`${dir}/${prefix}${sheet}.webp`);
  const [garb, armour, burden] = await Promise.all([read("garb"), read("armour"), read("burden")]);
  return buildDollLayout(await decodeSheet(garb), await decodeSheet(armour), await decodeSheet(burden));
}

// ---------------------------------------------------------------------------
// templates

/** Build the template URL and layout module source without writing it to disk. */
function generatedFileSource(layouts: Record<DollTemplateSize, DollLayout>): string {
  // Each path is written inside artUrl() so the art manifest resolves it to the
  // CDN (artUrl.literalPaths.test.ts holds every manifest key to that rule).
  const sheetsSource = SIZES.map((size) => {
    const entries = DOLL_SHEET_KEYS.map((k) => `    ${k}: artUrl("/assets/doll/${size}-${k}.webp"),`).join("\n");
    return `  ${size}: {\n${entries}\n  },`;
  }).join("\n");
  return `// GENERATED by \`npm run doll:templates\` (scripts/generate-dolls.ts). Never edit by hand:
// the sheets are AI renders and the layouts are measured from them, so a hand edit
// describes a picture that does not exist. Regenerate the command to change either.
import type { DollLayout, DollSheetKey, DollTemplateSize } from "@edge-shared/paperDoll/types.ts";
import { artUrl } from "@/lib/assets/artUrl";

/** The template sheets' URLs (app art, through the CDN). */
export const DOLL_TEMPLATE_SHEETS: Record<DollTemplateSize, Record<DollSheetKey, string>> = {
${sheetsSource}
};

/** Per-piece fits measured from each template's own sheets. */
export const DOLL_TEMPLATE_LAYOUTS: Record<DollTemplateSize, DollLayout> = ${JSON.stringify(layouts, null, 2)};
`;
}

/**
 * Render the selected size (both when null), write app and edge references,
 * and regenerate the layout module. Unselected sizes are remeasured from disk;
 * failure to read or measure them exits the script. Dry runs only print prompts.
 * Other rendering, measurement, and file errors propagate; writes are not atomic.
 */
async function runTemplates(args: { size: DollTemplateSize | null; dryRun: boolean }) {
  const sizes = args.size ? [args.size] : [...SIZES];

  if (args.dryRun) {
    for (const size of sizes) {
      printPrompt(`${size} garb`, templateGarbPrompt(size), []);
      printPrompt(`${size} armour`, armourPrompt({ withTemplate: false }), [`${size} garb (rendered)`]);
      printPrompt(`${size} burden`, burdenPrompt(), [`${size} garb (rendered)`]);
    }
    console.log(`\nDry run: ${sizes.length * 3} renders would be made (~${sizes.length * 3 * 5} cents). Nothing was called or written.`);
    return;
  }

  // Layouts of the size not being regenerated are re-measured from its existing webp files.
  const layouts = {} as Record<DollTemplateSize, DollLayout>;
  for (const size of SIZES) {
    if (sizes.includes(size)) continue;
    try {
      layouts[size] = await measureLayoutFromDisk(ART_DIR, `${size}-`);
    } catch (e) {
      fail(`--size ${args.size} keeps ${size}, but its sheets could not be read from ${ART_DIR}: ${(e as Error).message}\nRun without --size to make both.`);
    }
  }

  await Deno.mkdir(ART_DIR, { recursive: true });
  await Deno.mkdir(EDGE_TEMPLATE_DIR, { recursive: true });
  for (const size of sizes) {
    const doll = await renderDoll({
      tag: size,
      generatorType: "paper-doll-template",
      garbPrompt: templateGarbPrompt(size),
      garbSources: [],
      armourSources: (garb) => [garb],
      armourText: armourPrompt({ withTemplate: false }),
    });
    for (const key of DOLL_SHEET_KEYS) {
      await Deno.writeFile(`${ART_DIR}/${size}-${key}.webp`, doll.sheets[key].marked);
    }
    // The edge function's references: byte-identical to the app copies (dollTemplates.test.ts holds them equal).
    for (const key of ["garb", "armour"] as const) {
      await Deno.writeFile(`${EDGE_TEMPLATE_DIR}/${size}-${key}.webp`, doll.sheets[key].marked);
    }
    layouts[size] = doll.layout;
    console.log(`${size}: wrote ${ART_DIR}/${size}-*.webp and ${EDGE_TEMPLATE_DIR}/${size}-{garb,armour}.webp`);
  }
  await Deno.writeTextFile(GENERATED_FILE, generatedFileSource(layouts));
  console.log(`Wrote ${GENERATED_FILE}.`);
  console.log("Next: npm run art:manifest, then npm run art:publish BEFORE pushing, or production 404s.");
}

/**
 * Re-measures both templates from the sheets already on disk and rewrites the
 * generated layouts, without a render. For when a fit rule in layout.ts
 * changes: the pictures are unchanged, only how the pieces are placed on them.
 * File, decoding, and measurement errors propagate.
 */
async function remeasureTemplates() {
  const layouts = {} as Record<DollTemplateSize, DollLayout>;
  for (const size of SIZES) layouts[size] = await measureLayoutFromDisk(ART_DIR, `${size}-`);
  await Deno.writeTextFile(GENERATED_FILE, generatedFileSource(layouts));
  console.log(`Re-measured both templates; wrote ${GENERATED_FILE}. No render was made.`);
}

// ---------------------------------------------------------------------------
// species

interface SpeciesRow {
  id: string;
  name: string;
  description: string | null;
  size: string | null;
}

/** Read canonical species facts by library_species ID (`slug`); reject query errors or a missing row. */
async function loadSpecies(client: SupabaseClient, slug: string): Promise<SpeciesRow> {
  const { data, error } = await client
    .from("library_species")
    .select("id, name, description, size")
    .eq("id", slug)
    .maybeSingle();
  if (error) throw new Error(`Could not read library_species "${slug}": ${error.message}`);
  if (!data) throw new Error(`No library species with id "${slug}".`);
  return data as SpeciesRow;
}

interface LayoutFile {
  layout: DollLayout;
  model: string;
  generatedAt: string;
}

/** Write marked sheets and layout metadata for review, creating dir; file errors propagate. */
async function writeOutDir(dir: string, doll: { sheets: Record<DollSheetKey, Rendered>; layout: DollLayout }) {
  await Deno.mkdir(dir, { recursive: true });
  for (const key of DOLL_SHEET_KEYS) await Deno.writeFile(`${dir}/${key}.webp`, doll.sheets[key].marked);
  const file: LayoutFile = { layout: doll.layout, model: DOLL_IMAGE_MODEL, generatedAt: new Date().toISOString() };
  await Deno.writeTextFile(`${dir}/layout.json`, JSON.stringify(file, null, 2) + "\n");
}

/**
 * Upload a fresh species sheet set, then update library_species.doll by ID
 * (`slug`). Upload and database errors propagate; uploaded files and older sets
 * are not removed on failure.
 */
async function publishSpecies(
  admin: SupabaseClient,
  slug: string,
  sheets: Record<DollSheetKey, Bytes>,
  meta: LayoutFile,
) {
  const setId = crypto.randomUUID();
  const urls = {} as Record<DollSheetKey, string>;
  for (const key of DOLL_SHEET_KEYS) {
    // Canonical art lives under srd/ (CLAUDE.md, Storage Path Convention).
    const path = `srd/dolls/${slug}/${setId}/${key}.webp`;
    await uploadWithRetry(admin, SPECIES_BUCKET, path, sheets[key], "image/webp");
    urls[key] = publicUrlFor(admin, SPECIES_BUCKET, path);
  }
  const doll: DollSheets = { version: 1, sheets: urls, layout: meta.layout, model: meta.model, generatedAt: meta.generatedAt };
  const { error } = await admin.from("library_species").update({ doll }).eq("id", slug);
  if (error) throw new Error(`Could not set library_species.doll for "${slug}": ${error.message}`);
  console.log(`${slug}: published set ${setId}, library_species.doll updated.`);
}

/**
 * Render species by library ID into review directories and optionally publish,
 * or publish an existing directory with `from`. Dry runs still read species
 * and any `from` files, but do not render or write. Remote writes require
 * yesProduction. Invalid options, missing configuration, or unreadable template
 * files exit the script; other read, render, parse, and publish errors propagate.
 */
async function runSpecies(args: {
  slugs: string[];
  out: string | null;
  from: string | null;
  write: boolean;
  yesProduction: boolean;
  dryRun: boolean;
}) {
  if (args.slugs.length === 0) fail("species needs at least one library_species id (e.g. srd_srd_elf).");
  if (args.from && args.slugs.length !== 1) fail("--from publishes one reviewed directory, so give exactly one slug.");
  if (args.from && !args.write) fail("--from only makes sense with --write (it publishes an already-reviewed directory).");

  const url = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  if (!url) fail("VITE_SUPABASE_URL (or SUPABASE_URL) must be set.");
  const loopback = isLoopbackUrl(url);
  console.log(`Project: ${url} (${loopback ? "loopback" : "NOT loopback"})`);
  if (args.write && !loopback && !args.yesProduction) {
    fail("Refusing to write to a non-loopback project without --yes-production.");
  }
  const admin = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const slug of args.slugs) {
    const species = await loadSpecies(admin, slug);
    const size = templateSizeFor(species.size);
    const garbPath = `${ART_DIR}/${size}-garb.webp`;
    const armourPath = `${ART_DIR}/${size}-armour.webp`;
    const speciesFacts = { name: species.name, description: species.description, size };
    console.log(`\n== ${slug} (${species.name}, size ${species.size ?? "null"} -> ${size} template)`);

    if (args.from) {
      const meta = JSON.parse(await Deno.readTextFile(`${args.from}/layout.json`)) as LayoutFile;
      const sheets = {} as Record<DollSheetKey, Bytes>;
      for (const key of DOLL_SHEET_KEYS) sheets[key] = await Deno.readFile(`${args.from}/${key}.webp`);
      if (args.dryRun) {
        console.log(`Dry run: would publish ${args.from} for ${slug}.`);
        continue;
      }
      await publishSpecies(admin, slug, sheets, meta);
      continue;
    }

    if (args.dryRun) {
      printPrompt(`${slug} garb`, speciesGarbPrompt(speciesFacts), [garbPath]);
      printPrompt(`${slug} armour`, armourPrompt({ withTemplate: true }), [`${slug} garb (rendered)`, armourPath]);
      printPrompt(`${slug} burden`, burdenPrompt(), [`${slug} garb (rendered)`]);
      console.log("\nDry run: 3 renders would be made (~15 cents). Nothing was called or written.");
      continue;
    }

    const [templateGarb, templateArmour] = await Promise.all([Deno.readFile(garbPath), Deno.readFile(armourPath)]).catch(() =>
      fail(`Template sheets missing under ${ART_DIR}. Run npm run doll:templates first.`),
    );
    const doll = await renderDoll({
      tag: slug,
      generatorType: "paper-doll-species",
      garbPrompt: speciesGarbPrompt(speciesFacts),
      garbSources: [templateGarb],
      armourSources: (garb) => [garb, templateArmour],
      armourText: armourPrompt({ withTemplate: true }),
    });
    const out = args.out ?? `.doll-out/${slug}`;
    await writeOutDir(out, doll);
    console.log(`${slug}: wrote ${out}/ (garb, armour, burden, layout.json) for review.`);
    if (args.write) {
      const meta = JSON.parse(await Deno.readTextFile(`${out}/layout.json`)) as LayoutFile;
      const sheets = Object.fromEntries(DOLL_SHEET_KEYS.map((k) => [k, doll.sheets[k].marked])) as Record<DollSheetKey, Bytes>;
      await publishSpecies(admin, slug, sheets, meta);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI

/**
 * Split positional arguments from supported flags, with later duplicate flags
 * winning. Exit with status 1 for unknown flags or a missing option value.
 * Command and size validation are left to the caller.
 */
function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const name = a.slice(2);
    if (["size", "out", "from"].includes(name)) {
      const value = argv[++i];
      if (!value) fail(`--${name} needs a value.`);
      flags.set(name, value);
    } else if (["dry-run", "write", "yes-production", "remeasure"].includes(name)) {
      flags.set(name, true);
    } else {
      fail(`Unknown flag --${name}.`);
    }
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(Deno.args);
const [command, ...rest] = positional;

if (command === "templates") {
  const size = flags.get("size");
  if (size !== undefined && size !== "small" && size !== "medium") fail("--size must be small or medium.");
  if (flags.has("remeasure")) await remeasureTemplates();
  else await runTemplates({ size: (size as DollTemplateSize | undefined) ?? null, dryRun: flags.has("dry-run") });
} else if (command === "species") {
  await runSpecies({
    slugs: rest,
    out: (flags.get("out") as string | undefined) ?? null,
    from: (flags.get("from") as string | undefined) ?? null,
    write: flags.has("write"),
    yesProduction: flags.has("yes-production"),
    dryRun: flags.has("dry-run"),
  });
} else {
  fail("Usage: generate-dolls.ts templates [--size small|medium] [--dry-run] [--remeasure]\n       generate-dolls.ts species <slug>... [--out dir] [--from dir] [--write] [--yes-production] [--dry-run]");
}
