#!/usr/bin/env tsx
/**
 * Turns the generated page-dressing marks into app assets (#1181, page dressing).
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/paintbox/markAssets.ts [--dir <marks>]
 *
 * Reads black-on-white PNGs from the painter folder and writes under public/assets/paintbox/marks/:
 * a lossless WebP per painted mark (black RGB, alpha = darkness, trimmed to the mark, long side at most MAX_SIDE)
 * and, instead, for the corner flourish, which is line art that must stay crisp in print, an SVG traced with potrace.
 * The page draws each as a tint through a mask, so one mark takes any ink. Run `npm run art:manifest`
 * afterwards. Re-running reproduces the same bytes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { isCliEntry } from "../lib/cli.ts";
import { alphaFromLuminance, markBounds, type Box } from "./stockAssets.ts";

export const MARK_IDS = ["stain-edge-bottom", "stain-ring", "edge-wash-band", "corner-flourish"] as const;
/** The marks that are also traced to a vector. */
export const TRACED_IDS: readonly string[] = ["corner-flourish"];
export const MAX_SIDE = 1600;
export const DEFAULT_DIR = path.join(os.homedir(), "Desktop/art-955/paintbox/marks");
const OUT_DIR = path.join(import.meta.dirname, "../../public/assets/paintbox/marks");

/** The size with its long side at most `max`, keeping the proportions; never larger than the source. */
export function fitLongSide(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A binary-less greyscale PGM (P5) of the mark: dark where there is paint, which is what potrace traces. */
export function pgmFromAlpha(alpha: Uint8Array, width: number, height: number): Buffer {
  const head = Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii");
  const body = Buffer.alloc(width * height);
  for (let i = 0; i < body.length; i++) body[i] = 255 - alpha[i];
  return Buffer.concat([head, body]);
}

/**
 * potrace's SVG made fit to be a mask: a viewBox and no width/height (so the box that draws it decides the
 * size), black fill and no stroke. It reads the viewBox potrace already wrote; one without is an error.
 */
export function maskSvg(traced: string): string {
  const viewBox = /viewBox="([^"]+)"/.exec(traced)?.[1];
  if (!viewBox) throw new Error("potrace wrote no viewBox");
  const paths = [...traced.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
  const group = /<g\b[^>]*transform="([^"]+)"/.exec(traced)?.[1];
  if (paths.length === 0 || !group) throw new Error("potrace traced nothing");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
    `<g transform="${group}" fill="#000000" stroke="none">${paths.join("")}</g></svg>\n`
  );
}

async function alphaOf(file: string): Promise<{ alpha: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alphaFromLuminance(data[i]);
  return { alpha, width: info.width, height: info.height };
}

function crop(alpha: Uint8Array, width: number, box: Box): Uint8Array {
  const out = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    out.set(alpha.subarray((box.top + y) * width + box.left, (box.top + y) * width + box.left + box.width), y * box.width);
  }
  return out;
}

async function buildMark(id: string, file: string): Promise<string> {
  const { alpha, width, height } = await alphaOf(file);
  const box = markBounds(alpha, width, height);
  if (!box) throw new Error(`${file} has no mark`);
  if (!TRACED_IDS.includes(id)) {
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = alpha[i];
    const size = fitLongSide(box.width, box.height, MAX_SIDE);
    await sharp(rgba, { raw: { width, height, channels: 4 } })
      .extract(box)
      .resize(size.width, size.height, { fit: "fill" })
      .webp({ lossless: true, exact: true })
      .toFile(path.join(OUT_DIR, `${id}.webp`));
    return `${id}.webp ${size.width}x${size.height}`;
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), "marks-"));
  try {
    const pgm = path.join(tmp, "mark.pgm");
    writeFileSync(pgm, pgmFromAlpha(crop(alpha, width, box), box.width, box.height));
    execFileSync("potrace", ["-s", "-t", "4", "-O", "0.4", "-o", path.join(tmp, "mark.svg"), pgm]);
    writeFileSync(path.join(OUT_DIR, `${id}.svg`), maskSvg(readFileSync(path.join(tmp, "mark.svg"), "utf8")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return `${id}.svg`;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { dir: { type: "string" } } });
  const dir = values.dir ?? DEFAULT_DIR;
  mkdirSync(OUT_DIR, { recursive: true });
  for (const id of MARK_IDS) console.log(await buildMark(id, path.join(dir, `${id}.png`)));
}

if (isCliEntry(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
