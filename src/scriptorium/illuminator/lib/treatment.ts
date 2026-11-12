/*
 * A picture's edits as a recipe (#1176 story 9, "the recipe, not the bake").
 *
 * The document holds these settings; the baked image is a cache derived from
 * them. A treated picture carries { src, original, illuminate, bakedFor }:
 * `illuminate` is what is in this file, `original` is the untouched picture
 * and `bakedFor` is hashSettings() of the settings the current `src` was
 * baked from, so a stale bake is any picture whose hash differs.
 *
 * Steps always run in one fixed order (STEP_ORDER), whatever order the array
 * lists them in, and at most one step of each type counts. normaliseSettings()
 * makes that true, and the hash is taken over the normalised form so two
 * spellings of the same recipe never look like an edit.
 *
 * Pure: no canvas, no network, importable by a Worker.
 */
import { DEFAULT_COLOUR_GRADING, type ColourGradingOptions } from "./colourGrading";
import { DEFAULT_DOF_BLUR, type DofBlurOptions, type FalloffCurve } from "./dofBlur";
import { DEFAULT_EDGE_OPTIONS, type EdgeOptions } from "./edgeTreatment";
import { BLEND_MODES, DEFAULT_TEXTURE_OVERLAY, type TextureBlendMode } from "./textureOverlay";
import { DEFAULT_VIGNETTE, type VignetteMode, type VignetteOptions } from "./vignette";
import { DEFAULT_PAPER_SIDE, type PaperSideOptions } from "./tornPaper";

export type DofStepOptions = Omit<DofBlurOptions, "enabled">;
export type VignetteStepOptions = Omit<VignetteOptions, "enabled">;

export interface GradeStep { type: "grade"; options: ColourGradingOptions }
export interface DofStep { type: "dof"; options: DofStepOptions }
export interface VignetteStep { type: "vignette"; options: VignetteStepOptions }
export interface TextureStep { type: "texture"; url: string; blendMode: TextureBlendMode; opacity: number; scale: number }
export interface ClassicEdgesStep { type: "edges"; style: "classic"; top: EdgeOptions; right: EdgeOptions; bottom: EdgeOptions; left: EdgeOptions }
export interface PaperEdgesStep { type: "edges"; style: "paper"; top: PaperSideOptions; right: PaperSideOptions; bottom: PaperSideOptions; left: PaperSideOptions }
export type EdgesStep = ClassicEdgesStep | PaperEdgesStep;
/** An alpha PNG: wherever it is painted, the picture is erased. */
export interface MaskStep { type: "mask"; url: string }
/** Which side of the picture the paper wash comes in from. */
export type WashSide = "left" | "right" | "top" | "bottom";
export const WASH_SIDES: readonly WashSide[] = ["left", "right", "top", "bottom"];
export const WASH_REACH = { min: 0.15, max: 0.9 } as const;
/**
 * A brushed paper wash painted over the picture, like a homebrew supplement page: wherever the brush went the
 * picture is erased (the page's paper shows through), with a ragged dry-brush edge. Sizes are fractions of the
 * picture and every stroke is seeded, so the preview, the bake and print draw the same wash (paperWash.ts).
 */
export interface WashStep {
  type: "wash";
  from: WashSide;
  /** The share of the picture the paper covers from that side. */
  reach: number;
  /** 0 fine strokes to 1 broad ones. */
  brush: number;
  /** 0 a wet even edge to 1 long dry streaks. */
  dry: number;
  seed: number;
}

/**
 * An AI picture action's stored output (#1176 story 10). It is the recipe's base image, not a filter: every
 * renderer starts from baseImageUrl() and applySteps skips it. `action` records the chain ("cutout+ink").
 */
export interface AiStep { type: "ai"; action: string; output: string }

/**
 * The part of the base picture that is kept, as fractions of it (0 to 1, from the top left). It is applied
 * before every other step, so they all work on the cropped picture, and the bake, the page and print are all
 * the cropped size. It is not drawn by applySteps: the renderers cut the base with it (crop.ts).
 */
export interface CropStep { type: "crop"; x: number; y: number; w: number; h: number }

export type IlluminateStep = GradeStep | DofStep | VignetteStep | TextureStep | EdgesStep | WashStep | MaskStep | AiStep | CropStep;
export type StepType = IlluminateStep["type"];

export interface IlluminateSettings {
  v: 1;
  /** Seeds every random-looking thing (the paper tear), so the same recipe tears the same way. */
  seed: number;
  steps: IlluminateStep[];
}

/** The order the steps run in: the crop comes first, the texture sits under the vignette on purpose, the wash goes on after the edges, and the mask the Eraser paints on the picture erases last. */
export const STEP_ORDER: readonly StepType[] = ["ai", "crop", "grade", "dof", "texture", "vignette", "edges", "wash", "mask"];

// ─── Defensive parsing ──────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === v) ?? fallback;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

const FALLOFFS: readonly FalloffCurve[] = ["linear", "quadratic", "cubic"];
const VIGNETTE_MODES: readonly VignetteMode[] = ["transparent", "colour"];

function parseGrade(raw: Record<string, unknown>): GradeStep {
  const o = isRecord(raw.options) ? raw.options : {};
  const d = DEFAULT_COLOUR_GRADING;
  return {
    type: "grade",
    options: {
      brightness: num(o.brightness, d.brightness),
      contrast: num(o.contrast, d.contrast),
      saturation: num(o.saturation, d.saturation),
      temperature: num(o.temperature, d.temperature),
      hue: num(o.hue, d.hue),
    },
  };
}

function parseDof(raw: Record<string, unknown>): DofStep {
  const o = isRecord(raw.options) ? raw.options : {};
  const d = DEFAULT_DOF_BLUR;
  return {
    type: "dof",
    options: {
      focalX: num(o.focalX, d.focalX),
      focalY: num(o.focalY, d.focalY),
      focusRadius: num(o.focusRadius, d.focusRadius),
      blurStrength: num(o.blurStrength, d.blurStrength),
      desaturation: num(o.desaturation, d.desaturation),
      falloff: oneOf(o.falloff, FALLOFFS, d.falloff),
    },
  };
}

function parseVignette(raw: Record<string, unknown>): VignetteStep {
  const o = isRecord(raw.options) ? raw.options : {};
  const d = DEFAULT_VIGNETTE;
  return {
    type: "vignette",
    options: {
      strength: num(o.strength, d.strength),
      softness: num(o.softness, d.softness),
      mode: oneOf(o.mode, VIGNETTE_MODES, d.mode),
      colour: typeof o.colour === "string" ? o.colour : d.colour,
    },
  };
}

function parseTexture(raw: Record<string, unknown>): TextureStep | null {
  const url = nonEmptyString(raw.url);
  if (!url) return null;
  const d = DEFAULT_TEXTURE_OVERLAY;
  return {
    type: "texture",
    url,
    blendMode: oneOf(raw.blendMode, BLEND_MODES, d.blendMode),
    opacity: num(raw.opacity, d.opacity),
    scale: num(raw.scale, d.scale),
  };
}

function parseClassicSide(v: unknown): EdgeOptions {
  const o = isRecord(v) ? v : {};
  const d = DEFAULT_EDGE_OPTIONS;
  return {
    enabled: bool(o.enabled, d.enabled),
    roughness: num(o.roughness, d.roughness),
    fadeWidth: num(o.fadeWidth, d.fadeWidth),
    tearDepth: num(o.tearDepth, d.tearDepth),
    passes: num(o.passes, d.passes),
    variation: num(o.variation, d.variation),
  };
}

function parsePaperSide(v: unknown): PaperSideOptions {
  const o = isRecord(v) ? v : {};
  const d = DEFAULT_PAPER_SIDE;
  return {
    enabled: bool(o.enabled, d.enabled),
    roughness: num(o.roughness, d.roughness),
    depth: num(o.depth, d.depth),
    fibres: num(o.fibres, d.fibres),
    shadow: num(o.shadow, d.shadow),
  };
}

function parseEdges(raw: Record<string, unknown>): EdgesStep {
  if (raw.style === "paper") {
    return {
      type: "edges",
      style: "paper",
      top: parsePaperSide(raw.top),
      right: parsePaperSide(raw.right),
      bottom: parsePaperSide(raw.bottom),
      left: parsePaperSide(raw.left),
    };
  }
  return {
    type: "edges",
    style: "classic",
    top: parseClassicSide(raw.top),
    right: parseClassicSide(raw.right),
    bottom: parseClassicSide(raw.bottom),
    left: parseClassicSide(raw.left),
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function parseWash(raw: Record<string, unknown>): WashStep {
  return {
    type: "wash",
    from: oneOf(raw.from, WASH_SIDES, "left"),
    reach: Math.min(WASH_REACH.max, Math.max(WASH_REACH.min, num(raw.reach, 0.6))),
    brush: clamp01(num(raw.brush, 0.55)),
    dry: clamp01(num(raw.dry, 0.65)),
    seed: Math.trunc(num(raw.seed, 0)),
  };
}

/** Smallest side a crop may keep, as a fraction: a sliver is a mistake, and it would bake to nothing. */
export const MIN_CROP = 0.05;

/** A crop clamped into the picture, or null when it keeps all of it (so it is no edit at all). */
export function clampCrop(x: number, y: number, w: number, h: number): CropStep | null {
  const cw = Math.min(1, Math.max(MIN_CROP, w));
  const ch = Math.min(1, Math.max(MIN_CROP, h));
  const cx = Math.min(1 - cw, Math.max(0, x));
  const cy = Math.min(1 - ch, Math.max(0, y));
  if (cw >= 0.9999 && ch >= 0.9999) return null;
  return { type: "crop", x: cx, y: cy, w: cw, h: ch };
}

function parseCrop(raw: Record<string, unknown>): CropStep | null {
  return clampCrop(num(raw.x, 0), num(raw.y, 0), num(raw.w, 1), num(raw.h, 1));
}

function parseStep(raw: unknown): IlluminateStep | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "grade": return parseGrade(raw);
    case "dof": return parseDof(raw);
    case "vignette": return parseVignette(raw);
    case "texture": return parseTexture(raw);
    case "edges": return parseEdges(raw);
    case "crop": return parseCrop(raw);
    case "wash": return parseWash(raw);
    case "mask": {
      const url = nonEmptyString(raw.url);
      return url ? { type: "mask", url } : null;
    }
    case "ai": {
      const output = nonEmptyString(raw.output);
      return output ? { type: "ai", action: typeof raw.action === "string" ? raw.action : "", output } : null;
    }
    default: return null;
  }
}

/** One step per type (the last wins), in the order they run. */
export function normaliseSettings(settings: IlluminateSettings): IlluminateSettings {
  const byType = new Map<StepType, IlluminateStep>();
  for (const step of settings.steps) byType.set(step.type, step);
  const steps = STEP_ORDER.flatMap((type) => {
    const step = byType.get(type);
    return step ? [step] : [];
  });
  return { v: 1, seed: settings.seed, steps };
}

/**
 * Read settings from whatever a document holds: an object, or the JSON string
 * furniture props store. Anything that is not version 1 settings is null (no
 * recipe), unknown or broken steps are dropped, and this never throws.
 */
export function parseSettings(input: unknown): IlluminateSettings | null {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps.flatMap((s) => {
    const step = parseStep(s);
    return step ? [step] : [];
  });
  return normaliseSettings({ v: 1, seed: Math.trunc(num(raw.seed, 0)), steps });
}

// ─── Hash ───────────────────────────────────────────────────────────────────

/** JSON with every object's keys sorted, so key order never changes the text. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** cyrb53: a fast 53-bit string hash. Not cryptographic; it only has to notice an edit. */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A stable hash of the normalised recipe: the same recipe always gives the same string. */
export function hashSettings(settings: IlluminateSettings): string {
  return cyrb53(stableStringify(normaliseSettings(settings))).toString(36);
}

// ─── URLs ───────────────────────────────────────────────────────────────────

/** Every stored picture the steps point at (a texture, a mask, an AI output). */
export function pictureUrls(settings: IlluminateSettings | null): string[] {
  if (!settings) return [];
  return settings.steps.flatMap((step) => {
    switch (step.type) {
      case "texture":
      case "mask":
        return [step.url];
      case "ai":
        return [step.output];
      default:
        return [];
    }
  });
}

/** The AI step of a recipe, if it has one. */
export function aiStepOf(settings: IlluminateSettings | null): AiStep | null {
  const step = settings?.steps.find((s): s is AiStep => s.type === "ai");
  return step ?? null;
}

/**
 * The picture every other step is drawn over: an AI result when the recipe has one, else the original. One
 * rule for the workbench, the quick preview, the bake and the print redraw, so they cannot disagree about it.
 */
export function baseImageUrl(original: string, settings: IlluminateSettings | null): string {
  return aiStepOf(settings)?.output ?? original;
}

/** The recipe with its AI step set (replacing any), or removed when `step` is null. */
export function withAiStep(settings: IlluminateSettings | null, step: AiStep | null, seed: number): IlluminateSettings {
  const rest = (settings?.steps ?? []).filter((s) => s.type !== "ai");
  return normaliseSettings({ v: 1, seed: settings?.seed ?? seed, steps: step ? [step, ...rest] : rest });
}

/** Whether the recipe changes the picture at all. */
export function hasSteps(settings: IlluminateSettings | null): settings is IlluminateSettings {
  return settings !== null && settings.steps.length > 0;
}
