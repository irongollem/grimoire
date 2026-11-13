import { unzipSync } from "fflate";
import type { GrainImage, TipImage } from "../engine/types";
import { parseBplist, type PlistValue } from "./bplist";
import { clamp01, grainId, newBrush, tipId, varied } from "./brushDefaults";
import { unarchive } from "./keyedArchive";
import { decodePng } from "./png";
import { checkDimensions, invertInPlace, makeGrain, makeTip } from "./tipImage";
import {
  ImportError,
  type ImportLimits,
  type ImportResult,
  type ImportedBrush,
  type PngPixels,
} from "./types";

/*
 * Procreate .brush (one brush) and .brushset (several): zip archives. Each brush is a folder holding
 * Brush.archive (an NSKeyedArchiver binary plist of its settings), Shape.png (white paints on black)
 * and usually Grain.png. Key names are the ones Procreate writes into the archive.
 */

type Settings = Map<string, PlistValue>;

/** Procreate keeps a factory copy of each brush in a Reset/ folder beside it; it is the same brush, so it is not imported. */
const isFactoryCopy = (path: string): boolean => path.startsWith("__MACOSX") || path.split("/").includes("Reset");

const BASENAMES = ["Brush.archive", "Shape.png", "Grain.png"];

/** Unzip only the files a brush needs, refusing an archive that is too big, has too many entries, or inflates beyond the limit. */
function unzipBrushFiles(bytes: Uint8Array, limits: ImportLimits): Map<string, Uint8Array> {
  let entries = 0;
  let declared = 0;
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries++;
        declared += f.originalSize;
        if (entries > limits.maxEntries) throw new ImportError("The archive holds too many files to be a brush set.");
        if (declared > limits.maxInflatedBytes) throw new ImportError("The archive would unpack to far more than any brush set.");
        return false;
      },
    });
    const wanted = new Map<string, Uint8Array>();
    let actual = 0;
    const files = unzipSync(bytes, {
      filter: (f) => !isFactoryCopy(f.name) && BASENAMES.includes(f.name.split("/").pop() ?? ""),
    });
    for (const [name, data] of Object.entries(files)) {
      actual += data.length;
      if (actual > limits.maxInflatedBytes) throw new ImportError("The archive unpacked to far more than it said.");
      wanted.set(name, data);
    }
    return wanted;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("The archive is damaged and could not be unpacked.");
  }
}

const num = (s: Settings, ...keys: string[]): number | undefined => {
  for (const k of keys) {
    const v = s.get(k);
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
};

/** Settings this brush model has no home for; each is noted when the brush has it switched on (a number above zero, or true). */
const UNSUPPORTED: readonly (readonly [string, string])[] = [
  ["dynamicsSpeedSize", "Speed-driven size is not supported"],
  ["dynamicsSpeedOpacity", "Speed-driven opacity is not supported"],
  ["dynamicsTiltSize", "Tilt-driven size is not supported"],
  ["dynamicsTiltOpacity", "Tilt-driven opacity is not supported"],
  ["dynamicsPressureBleed", "Bleed is not supported"],
  ["dynamicsTiltBleed", "Bleed is not supported"],
  ["dynamicsBlur", "Blur is not supported"],
  ["dynamicsMix", "Colour mixing is not supported"],
  ["dynamicsPressureMix", "Colour mixing is not supported"],
  ["renderingRecursiveMixing", "Colour mixing is not supported"],
  ["dynamicsFalloff", "Falloff is not supported"],
  ["taperSize", "Taper is not supported"],
  ["taperOpacity", "Taper is not supported"],
  ["pencilTaperSize", "Taper is not supported"],
  ["pencilTaperOpacity", "Taper is not supported"],
  ["shapeAzimuth", "Following the pencil's direction is not supported"],
];

/**
 * The built-in shapes a brush can name instead of carrying a Shape.png ("Brush-Preset-Hard.png"). The
 * pictures are not in the file, so each becomes a round tip of about the same hardness.
 */
const BUILT_IN_SHAPES: Record<string, { hardness: number; roundness: number }> = {
  hard: { hardness: 1, roundness: 1 },
  "medium-hard": { hardness: 0.75, roundness: 1 },
  medium: { hardness: 0.5, roundness: 1 },
  "medium-soft": { hardness: 0.3, roundness: 1 },
  soft: { hardness: 0.1, roundness: 1 },
  oval: { hardness: 1, roundness: 0.5 },
};

export interface ProcreateFolder {
  name: string;
  archive: Uint8Array;
  shape: Uint8Array | null;
  grain: Uint8Array | null;
}

function groupFolders(files: Map<string, Uint8Array>): ProcreateFolder[] {
  const folders = new Map<string, ProcreateFolder>();
  for (const [path, data] of files) {
    const cut = path.lastIndexOf("/");
    const dir = cut < 0 ? "" : path.slice(0, cut);
    const base = path.slice(cut + 1);
    let f = folders.get(dir);
    if (!f && base === "Brush.archive") {
      f = { name: dir, archive: data, shape: null, grain: null };
      folders.set(dir, f);
    }
  }
  for (const [path, data] of files) {
    const cut = path.lastIndexOf("/");
    const f = folders.get(cut < 0 ? "" : path.slice(0, cut));
    const base = path.slice(cut + 1);
    if (f && base === "Shape.png") f.shape = data;
    if (f && base === "Grain.png") f.grain = data;
  }
  return [...folders.values()];
}

/** Luminance times alpha, 0 to 255: white paints. */
function coverageOf(px: PngPixels, invert: boolean): Uint8Array {
  const out = new Uint8Array(px.width * px.height);
  for (let i = 0; i < out.length; i++) {
    const r = px.rgba[i * 4];
    const g = px.rgba[i * 4 + 1];
    const b = px.rgba[i * 4 + 2];
    const a = px.rgba[i * 4 + 3];
    out[i] = Math.round(((0.299 * r + 0.587 * g + 0.114 * b) * a) / 255);
  }
  return invert ? invertInPlace(out) : out;
}

function grainOf(px: PngPixels, invert: boolean): Uint8Array {
  const out = new Uint8Array(px.width * px.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(0.299 * px.rgba[i * 4] + 0.587 * px.rgba[i * 4 + 1] + 0.114 * px.rgba[i * 4 + 2]);
  }
  return invert ? invertInPlace(out) : out;
}

/** A number above zero, or a flag that is true: the setting is switched on. */
const isOn = (s: Settings, key: string): boolean => {
  const v = s.get(key);
  return v === true || (typeof v === "number" && v > 0);
};

function importFolder(
  folder: ProcreateFolder,
  index: number,
  limits: ImportLimits,
  decode: (bytes: Uint8Array) => PngPixels,
): ImportedBrush {
  const archived = unarchive(parseBplist(folder.archive));
  if (!(archived instanceof Map)) throw new ImportError("The brush's settings are not in a form this reader knows.");
  const s = archived;
  const nameValue = s.get("name");
  const name = typeof nameValue === "string" && nameValue !== "" ? nameValue : `Brush ${index + 1}`;
  const brush = newBrush(index, name);
  const notes: string[] = [];

  // paintSize is the size slider as a fraction of its range, so the pixel size is a starting point to set by eye.
  const paintSize = num(s, "paintSize");
  if (paintSize !== undefined) brush.tip.size = Math.round(4 + clamp01(paintSize) * 400);
  const spacing = num(s, "plotSpacing");
  if (spacing !== undefined) brush.tip.spacing = Math.min(2, Math.max(0.01, spacing));
  const roundness = num(s, "shapeRoundness");
  if (roundness !== undefined && roundness > 0) brush.tip.roundness = Math.min(1, roundness);

  // Rotation is a fraction of a turn: a fixed angle, or the range of a random one when Randomise is on.
  const rotation = num(s, "shapeRotation") ?? 0;
  const randomise = s.get("shapeRandomise") === true;
  if (!randomise) brush.tip.angle = (((rotation % 1) + 1) % 1) * 360;

  const pressureSize = num(s, "dynamicsPressureSize") ?? 0;
  const sizeJitter = num(s, "dynamicsJitterSize") ?? 0;
  if (pressureSize > 0 || sizeJitter > 0 || (randomise && rotation > 0)) {
    brush.shape = {
      size: varied(clamp01(sizeJitter), pressureSize > 0 ? "pressure" : "off", clamp01(1 - pressureSize)),
      angle: varied(randomise ? clamp01(rotation) : 0),
      roundness: varied(),
    };
  }

  const scatter = (num(s, "plotJitter") ?? 0) + (num(s, "shapeScatter") ?? 0);
  const count = Math.max(1, Math.round(num(s, "shapeCount") ?? 1));
  if (scatter > 0 || count > 1) {
    brush.scatter = {
      amount: Math.min(10, scatter),
      bothAxes: true,
      count: Math.min(16, count),
      countJitter: clamp01(num(s, "shapeCountJitter") ?? 0),
    };
  }

  const opacity = num(s, "paintOpacity");
  if (opacity !== undefined) brush.transfer.opacity = clamp01(opacity);
  const pressureOpacity = num(s, "dynamicsPressureOpacity") ?? 0;
  const opacityJitter = num(s, "dynamicsJitterOpacity") ?? 0;
  if (pressureOpacity > 0 || opacityJitter > 0) {
    brush.transfer.opacityDynamics = varied(clamp01(opacityJitter), pressureOpacity > 0 ? "pressure" : "off", clamp01(1 - pressureOpacity));
  }
  const smoothing = num(s, "plotSmoothing");
  if (smoothing !== undefined) brush.smoothing = clamp01(smoothing);
  if ((num(s, "wetEdgesAmount") ?? 0) > 0) brush.wetEdges = true;
  const colour = {
    hue: clamp01(num(s, "dynamicsJitterHue") ?? 0),
    saturation: clamp01(num(s, "dynamicsJitterSaturation") ?? 0),
    value: clamp01(Math.max(num(s, "dynamicsJitterLightness") ?? 0, num(s, "dynamicsJitterDarkness") ?? 0)),
  };
  if (colour.hue > 0 || colour.saturation > 0 || colour.value > 0) brush.colour = colour;

  let tip: TipImage | null = null;
  if (folder.shape) {
    const px = decode(folder.shape);
    checkDimensions(px.width, px.height, limits);
    tip = makeTip(coverageOf(px, s.get("shapeInverted") === true), px.width, px.height, limits);
    brush.tip.source = { kind: "image", id: tipId(index) };
  } else {
    const named = s.get("bundledShapePath");
    const key = typeof named === "string" ? named.replace(/^Brush-Preset-/, "").replace(/\.png$/, "").toLowerCase() : "";
    const builtIn = BUILT_IN_SHAPES[key];
    if (builtIn) {
      brush.tip.source = { kind: "round", hardness: builtIn.hardness };
      brush.tip.roundness = Math.min(brush.tip.roundness, builtIn.roundness);
      notes.push(`Its shape is the built-in "${key}" one, so it uses a round tip of about the same hardness`);
    } else {
      notes.push("It has no shape picture, so it uses a soft round tip");
    }
  }

  let grain: GrainImage | null = null;
  if (folder.grain) {
    const px = decode(folder.grain);
    checkDimensions(px.width, px.height, limits);
    grain = makeGrain(grainOf(px, s.get("textureInverted") === true), px.width, px.height, limits);
    brush.grain = {
      id: grainId(index),
      scale: Math.max(0.05, num(s, "textureScale") ?? 1),
      depth: clamp01(num(s, "grainDepth") ?? 0.5),
      mode: (num(s, "textureMovement") ?? 1) < 0.5 ? "moving" : "paper",
    };
  } else {
    const named = s.get("bundledGrainPath");
    if (typeof named === "string" && !/blank/i.test(named)) notes.push("Its grain is a built-in one that is not in the file, so it has none");
  }

  if ((num(s, "blendMode") ?? 0) !== 0) notes.push("The brush's blend mode is not carried over");
  for (const [key, message] of UNSUPPORTED) {
    if (isOn(s, key) && !notes.includes(message)) notes.push(message);
  }
  return { preset: brush, tip, grain, notes };
}

export function importProcreate(
  bytes: Uint8Array,
  limits: ImportLimits,
  decode: (bytes: Uint8Array) => PngPixels = (b) => decodePng(b, limits),
): ImportResult {
  const files = unzipBrushFiles(bytes, limits);
  const folders = groupFolders(files);
  if (folders.length === 0) throw new ImportError("The archive holds no brush (no Brush.archive).");
  const result: ImportResult = { brushes: [], skipped: [] };
  folders.forEach((folder, i) => {
    try {
      result.brushes.push(importFolder(folder, result.brushes.length, limits, decode));
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      result.skipped.push({ name: folder.name === "" ? `Brush ${i + 1}` : folder.name, reason: e.message });
    }
  });
  return result;
}
