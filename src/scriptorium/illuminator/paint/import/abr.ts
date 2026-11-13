import type { TipImage } from "../engine/types";
import { Reader } from "./byteReader";
import { newBrush, tipId } from "./brushDefaults";
import { readDescriptor } from "./abrDescriptor";
import { collectPresets, presetFromDescriptor } from "./abrPreset";
import { unpackBits } from "./packbits";
import { checkDimensions, makeTip } from "./tipImage";
import { ImportError, type ImportLimits, type ImportResult } from "./types";

/*
 * Photoshop .abr. Version 1 and 2 are a list of computed or sampled brushes; version 6 and up are
 * "8BIM" blocks: `samp` holds the sampled tips, `desc` an action descriptor with every preset's settings.
 * Layouts follow the public reverse-engineering notes (GIMP's and Krita's readers).
 */

interface Sample {
  width: number;
  height: number;
  coverage: Uint8Array;
}

/** Depth, compression flag, then the picture: raw rows, or a row-length table followed by PackBits rows. */
function readPicture(r: Reader, width: number, height: number, depth: number, limits: ImportLimits): Sample {
  checkDimensions(width, height, limits);
  if (depth !== 8 && depth !== 16) throw new ImportError(`A brush tip has an unsupported bit depth (${depth}).`);
  const bytesPer = depth / 8;
  const compression = r.u8();
  const rowBytes = width * bytesPer;
  const raw = new Uint8Array(height * rowBytes);
  if (compression === 0) {
    raw.set(r.take(raw.length));
  } else if (compression === 1) {
    const lengths: number[] = [];
    for (let y = 0; y < height; y++) lengths.push(r.u16());
    for (let y = 0; y < height; y++) raw.set(unpackBits(r.take(lengths[y]), rowBytes), y * rowBytes);
  } else {
    throw new ImportError("A brush tip uses a compression this reader does not know.");
  }
  // 16-bit samples are big-endian; the high byte is all a tip needs.
  const samples = new Uint8Array(width * height);
  for (let i = 0; i < samples.length; i++) samples[i] = raw[i * bytesPer];
  // Stored as coverage: 255 is paint (Krita's reader inverts it only to draw ink dark).
  return { width, height, coverage: samples };
}

/**
 * One version 6 `samp` item: a 37-byte key (a length byte and a 36-character id), then 10 bytes (sub-version 1)
 * or 264 bytes (sub-version 2) of bookkeeping, the bounds, the depth and the compression flag.
 */
function readSampleV6(item: Reader, subVersion: number, limits: ImportLimits): { id: string; sample: Sample } {
  const id = item.pascal();
  item.skip(36 - id.length);
  item.skip(subVersion === 1 ? 10 : 264);
  const top = item.u32();
  const left = item.u32();
  const bottom = item.u32();
  const right = item.u32();
  const depth = item.u16();
  return { id, sample: readPicture(item, right - left, bottom - top, depth, limits) };
}

function readBlocksV6(r: Reader, limits: ImportLimits, result: ImportResult): void {
  const subVersion = r.u16();
  const samples = new Map<string, Sample>();
  const sampleOrder: string[] = [];
  let descriptor: ReturnType<typeof readDescriptor> | null = null;
  let descriptorProblem: string | null = null;

  while (r.remaining >= 12) {
    if (r.ascii(4) !== "8BIM") throw new ImportError("The brush file's block list is damaged.");
    const key = r.ascii(4);
    const block = r.slice(r.u32());
    if (key === "samp") {
      let n = 0;
      while (block.remaining >= 4) {
        const len = block.u32();
        const item = block.slice(len);
        block.skip(Math.min(block.remaining, (4 - (len % 4)) % 4));
        n++;
        try {
          const { id, sample } = readSampleV6(item, subVersion, limits);
          samples.set(id, sample);
          sampleOrder.push(id);
        } catch (e) {
          if (!(e instanceof ImportError)) throw e;
          result.skipped.push({ name: `Tip ${n}`, reason: e.message });
        }
      }
    } else if (key === "desc") {
      try {
        descriptor = readDescriptor(block);
      } catch (e) {
        if (!(e instanceof ImportError)) throw e;
        descriptorProblem = e.message;
      }
    }
  }

  const used = new Set<string>();
  let index = 0;
  if (descriptor) {
    for (const node of collectPresets(descriptor)) {
      const mapped = presetFromDescriptor(node, index);
      if (!mapped) continue;
      let tip: TipImage | null = null;
      const notes = mapped.notes;
      if (mapped.sampledId !== null) {
        const sample = samples.get(mapped.sampledId);
        if (!sample) {
          result.skipped.push({ name: mapped.preset.name, reason: "Its tip picture is not in the file." });
          continue;
        }
        used.add(mapped.sampledId);
        tip = makeTip(sample.coverage, sample.width, sample.height, limits);
        mapped.preset.tip.source = { kind: "image", id: tipId(index) };
        if (!(mapped.preset.tip.size > 0)) mapped.preset.tip.size = Math.max(sample.width, sample.height);
      }
      result.brushes.push({ preset: mapped.preset, tip, grain: null, notes });
      index++;
    }
  }

  // Tips the presets do not name, or all of them when the settings could not be read: a brush each, default settings.
  for (const id of sampleOrder) {
    if (used.has(id)) continue;
    const sample = samples.get(id);
    if (!sample) continue;
    const brush = newBrush(index, `Brush ${index + 1}`);
    brush.tip.source = { kind: "image", id: tipId(index) };
    brush.tip.size = Math.max(sample.width, sample.height);
    brush.tip.spacing = 0.25;
    const notes = descriptorProblem === null ? [] : ["Its settings could not be read, so it comes with default ones"];
    result.brushes.push({ preset: brush, tip: makeTip(sample.coverage, sample.width, sample.height, limits), grain: null, notes });
    index++;
  }
  if (descriptorProblem !== null && result.brushes.length === 0) {
    result.skipped.push({ name: "Brush settings", reason: descriptorProblem });
  }
}

/** Versions 1 and 2: a count, then per brush a type (1 computed, 2 sampled), a size and the body. */
function readOld(r: Reader, version: number, limits: ImportLimits, result: ImportResult): void {
  const count = r.u16();
  for (let i = 0; i < count; i++) {
    if (r.remaining < 6) {
      result.skipped.push({ name: `Brush ${i + 1}`, reason: "The file ends before this brush does." });
      return;
    }
    const type = r.u16();
    const body = r.slice(r.u32());
    const fallback = `Brush ${result.brushes.length + 1}`;
    try {
      const index = result.brushes.length;
      const brush = newBrush(index, fallback);
      let tip: TipImage | null = null;
      if (type === 1) {
        body.skip(4);
        const spacing = body.u16();
        const diameter = body.u16();
        const roundness = body.u16();
        const hardness = body.u16();
        const angle = body.u16();
        brush.tip.spacing = Math.min(10, Math.max(0.01, spacing / 100));
        if (diameter > 0) brush.tip.size = diameter;
        brush.tip.roundness = Math.max(0.05, Math.min(1, roundness / 100));
        brush.tip.source = { kind: "round", hardness: Math.min(1, hardness / 100) };
        brush.tip.angle = (360 - (angle % 360)) % 360;
      } else if (type === 2) {
        body.skip(4);
        const spacing = body.u16();
        if (version === 2) {
          const name = body.unicode();
          if (name !== "") brush.name = name;
        }
        body.skip(1); // anti-aliasing
        body.skip(8); // bounds as shorts
        const top = body.u32();
        const left = body.u32();
        const bottom = body.u32();
        const right = body.u32();
        const depth = body.u16();
        const sample = readPicture(body, right - left, bottom - top, depth, limits);
        brush.tip.spacing = Math.min(10, Math.max(0.01, spacing / 100));
        brush.tip.size = Math.max(sample.width, sample.height);
        brush.tip.source = { kind: "image", id: tipId(index) };
        tip = makeTip(sample.coverage, sample.width, sample.height, limits);
      } else {
        throw new ImportError(`It is a kind of brush (${type}) this reader does not know.`);
      }
      result.brushes.push({ preset: brush, tip, grain: null, notes: [] });
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      result.skipped.push({ name: fallback, reason: e.message });
    }
  }
}

export function importAbr(bytes: Uint8Array, limits: ImportLimits): ImportResult {
  const result: ImportResult = { brushes: [], skipped: [] };
  const r = new Reader(bytes);
  const version = r.u16();
  if (version === 1 || version === 2) readOld(r, version, limits, result);
  else if (version >= 6) readBlocksV6(r, limits, result);
  else throw new ImportError(`This .abr version ${version} is not supported.`);
  return result;
}
