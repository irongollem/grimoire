/**
 * Paints a picture-book scene's layers through the image API, from the same queue the painter works by hand
 * (`~/Desktop/art-955/scenes/briefs.json`, see its PROMPT.md and next.mjs): the empty room first, then each part on a
 * transparent background with the room attached, so it takes the room's style and light. The maintainer asked for
 * the API route on 15 Nov 2026 (Brilianto! in the circus tent); the hand queue stays for anything else.
 *
 *   tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/promo/scenes/paint.ts --only circus-
 *   ... --only circus- --yes-spend [--model gpt-image-2.6-sunburst] [--quality high] [--redo circus-apple.png]
 *
 * Without --yes-spend it prints what it would paint and spends nothing. A brief already painted (its file in out/) is
 * skipped unless named with --redo. Writes out/<file> and a line per picture to out/log-api.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { OPENAI_IMAGE_SUNBURST } from "../../../supabase/functions/_shared/platformModels.ts";

interface Brief {
  file: string;
  lane: string;
  size?: string;
  subject: string;
  rules?: string;
  alpha?: boolean;
  /** Pictures the part belongs in (`out/<file>` for another brief's output): style and light come from them. */
  references?: string[];
  /** What a creature or person looks like, shape and colours only (next.mjs's ANATOMY_NOTE). */
  anatomy?: string[];
  /** A picture to change rather than paint anew: sent first, kept as it is except what the brief asks (next.mjs's EDIT_NOTE). */
  editReference?: string;
  check?: string;
}

/**
 * The lanes, as next.mjs words them (its LANE table, which the hand painter reads): change both together. `figure` is
 * the API route's own, for a person of the setting on their own, which the room lane forbids.
 */
const LANE: Record<string, string> = {
  scene:
    "A quiet painted picture-book illustration: gouache and oil with visible, controlled brushwork and soft edges where the light falls, the feel of a classic illustrated storybook. Warm light from one source against calm, deep, warm shadow, in a restrained palette of cream, rose, caramel and copper. Simple and uncluttered: few objects, large calm areas, nothing decorative the brief does not ask for. Not photographic: no lens blur, no depth of field, no glossy realism; not cartoon or anime. No people, no animals, no hands. No legible writing, letters, numbers or logos anywhere.",
  part:
    "A quiet painted picture-book illustration of one single thing on its own: gouache and oil with visible, controlled brushwork and soft edges where the light falls, the feel of a classic illustrated storybook. Not photographic: no lens blur, no depth of field, no glossy realism; not cartoon or anime. No people, no animals. No legible writing, letters, numbers or logos anywhere. The background is fully transparent (a real alpha channel).",
  figure:
    "A quiet painted picture-book illustration of one figure on their own: gouache and oil with visible, controlled brushwork and soft edges where the light falls, the feel of a classic illustrated storybook. Not photographic: no lens blur, no depth of field, no glossy realism; not cartoon or anime. No other people or animals. No legible writing, letters, numbers or logos anywhere. The background is fully transparent (a real alpha channel).",
};
const REF_NOTE =
  "The first attached image(s) are the scene this part belongs in: match their painting style, brushwork, palette, light direction and light colour exactly, but paint only the subject the brief names, never the scene, its furniture or its background.";
const EDIT_NOTE =
  "The first attached image is the edit target. Preserve its figures, composition, pose, setting and finish; change only what the brief explicitly requests. Any later attached references are for anatomy, materials and finish only, and must not replace the edit target's subjects or composition.";
const ANATOMY_NOTE =
  "The last attached image(s) show only what the figure looks like: its shape, features and colours. Paint it in the scene's own quiet style and light, never in the style, finish or setting of those images.";

const sizeOf = (b: Brief) => b.size ?? "1024x1536";
const orientation = (size: string) => {
  const [w, h] = size.split("x").map(Number);
  return w > h ? "landscape" : w < h ? "portrait" : "square";
};
export function promptFor(b: Brief): string {
  const lane = LANE[b.lane];
  if (!lane) throw new Error(`${b.file}: no lane "${b.lane}" (one of ${Object.keys(LANE).join(", ")}).`);
  return [
    lane,
    b.subject,
    b.rules,
    b.editReference ? EDIT_NOTE : (b.references ?? []).length ? REF_NOTE : null,
    (b.anatomy ?? []).length ? ANATOMY_NOTE : null,
    `Single image, no panels, ${orientation(sizeOf(b))} ${sizeOf(b)}.`,
  ]
    .filter((s): s is string => typeof s === "string" && s !== "")
    .join(" — ");
}

/** A PNG with a real alpha channel: colour type 6 or 4, or a palette with a tRNS chunk (as next.mjs checks). */
export function hasAlpha(bytes: Buffer): boolean {
  const type = bytes[25];
  const trns = bytes.indexOf("tRNS");
  return type === 6 || type === 4 || (type === 3 && trns > 0 && trns < bytes.indexOf("IDAT"));
}

const MIME: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };

async function paint(apiKey: string, model: string, quality: string, b: Brief, dir: string): Promise<Buffer> {
  // The edit target goes first, as next.mjs sends it: the model keeps the first image and changes what is asked.
  const refs = [...(b.editReference ? [b.editReference] : []), ...(b.references ?? []).filter((r) => r !== b.editReference), ...(b.anatomy ?? [])].map((r) => join(dir, r));
  for (const r of refs) if (!existsSync(r)) throw new Error(`${b.file}: reference ${r} is not there yet.`);
  const common = { model, prompt: promptFor(b), size: sizeOf(b), quality, output_format: "png", moderation: "low", ...(b.alpha ? { background: "transparent" } : {}) };
  let res: Response;
  if (refs.length === 0) {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(common),
    });
  } else {
    const form = new FormData();
    for (const [k, v] of Object.entries(common)) form.append(k, v);
    for (const r of refs) form.append("image[]", new Blob([readFileSync(r)], { type: MIME[r.split(".").pop() ?? ""] ?? "image/png" }), basename(r));
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`${b.file}: ${body.error?.message ?? `OpenAI image error ${res.status}`}`);
  }
  const data = (await res.json()) as { data: { b64_json: string }[] };
  return Buffer.from(data.data[0].b64_json, "base64");
}

async function main() {
  const { values } = parseArgs({
    options: {
      only: { type: "string" },
      redo: { type: "string", multiple: true, default: [] },
      model: { type: "string", default: OPENAI_IMAGE_SUNBURST },
      quality: { type: "string", default: "high" },
      dir: { type: "string", default: join(homedir(), "Desktop/art-955/scenes") },
      "yes-spend": { type: "boolean", default: false },
    },
  });
  if (!values.only) throw new Error("Name the scene with --only <file prefix>, e.g. --only circus-.");
  const dir = values.dir;
  const briefs = (JSON.parse(readFileSync(join(dir, "briefs.json"), "utf8")) as Brief[]).filter((b) => b.file.startsWith(values.only ?? ""));
  const redo = new Set(values.redo);
  // The room before its parts: a part is painted with its room attached.
  const todo = briefs
    .filter((b) => redo.has(b.file) || !existsSync(join(dir, "out", b.file)))
    .sort((a, b) => (a.references ?? []).length - (b.references ?? []).length);
  console.log(`${todo.length} picture(s) with ${values.model}, quality ${values.quality}:`);
  for (const b of todo) console.log(`  ${b.file}  ${sizeOf(b)}${b.alpha ? "  transparent" : ""}${(b.references ?? []).length ? `  with ${b.references?.join(", ")}` : ""}`);
  if (!values["yes-spend"]) return console.log("\nNothing painted. Add --yes-spend to make these paid calls.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Run with --env-file=.env.local.");
  mkdirSync(join(dir, "out", "rejected"), { recursive: true });
  for (const b of todo) {
    const out = join(dir, "out", b.file);
    if (existsSync(out)) renameSync(out, join(dir, "out", "rejected", `${b.file.replace(/\.png$/, "")}-replaced-${Date.now()}.png`));
    const bytes = await paint(apiKey, values.model, values.quality, b, dir);
    if (b.alpha && !hasAlpha(bytes)) {
      writeFileSync(join(dir, "out", "rejected", `${b.file.replace(/\.png$/, "")}-no-alpha-${Date.now()}.png`), bytes);
      console.log(`  ${b.file}: came back without transparency, set aside`);
      continue;
    }
    writeFileSync(out, bytes);
    appendFileSync(join(dir, "out", "log-api.jsonl"), JSON.stringify({ file: b.file, model: values.model, at: new Date().toISOString(), source: "api" }) + "\n");
    console.log(`  ${b.file}: painted`);
  }
}

if (process.argv[1]?.endsWith("paint.ts")) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
