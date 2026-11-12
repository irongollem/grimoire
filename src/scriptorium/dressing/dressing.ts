/*
 * Page dressing (#1181, Paintbox): the hand-painted marks a book or handout carries on its pages, a darker stain
 * low on the page, a wash along the outer edge and flourishes in the corners.
 *
 * Pure. The document stores only the choices (`scriptorium_documents.page_dressing`: which parts, how strong, and
 * a seed); where the marks fall is worked out here from the seed and the page number, so the same page always gets
 * the same marks, in the editor, the paged preview, the PDF and the reader, and neighbouring pages differ.
 */
import { createRng } from "@/scriptorium/illuminator/paint/engine/rng";

export interface DressingPart {
  on: boolean;
  /** 0..1: how dark the part prints (its marks' opacity). */
  strength: number;
}

export interface Dressing {
  v: 1;
  /** An integer that moves every mark when it changes (Shuffle) and nothing else. */
  seed: number;
  stain: DressingPart;
  wash: DressingPart;
  corners: DressingPart;
}

export const DRESSING_PARTS = ["stain", "wash", "corners"] as const;
export type DressingPartId = (typeof DRESSING_PARTS)[number];

/** The page a mark lands on: a cover or a blank page is left bare. */
export type PageKind = "text" | "cover" | "blank";

export type MarkAsset = "stain-edge-bottom" | "stain-ring" | "edge-wash-band" | "corner-flourish";

/**
 * The marks as shipped (scripts/paintbox/markAssets.ts): where they are served from and their trimmed proportions
 * (width over height), which a placement needs to keep a mark from stretching. A test holds this equal to the files.
 */
const markPath = (asset: MarkAsset, ext: "webp" | "svg") => `/assets/paintbox/marks/${asset}.${ext}`;

export const MARK_ASSETS: Record<MarkAsset, { path: string; aspect: number }> = {
  "stain-edge-bottom": { path: markPath("stain-edge-bottom", "webp"), aspect: 1471 / 493 },
  "stain-ring": { path: markPath("stain-ring", "webp"), aspect: 734 / 743 },
  "edge-wash-band": { path: markPath("edge-wash-band", "webp"), aspect: 1515 / 520 },
  // Line art: traced to a vector so it stays crisp in print.
  "corner-flourish": { path: markPath("corner-flourish", "svg"), aspect: 914 / 878 },
};

/** One mark on one page. Position and size are % of the page box, turn in degrees about the mark's centre. */
export interface Mark {
  asset: MarkAsset;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
}

export interface DressPageOptions {
  /** The page's height over its width; A4 and A5 are the default, 1.414. */
  aspect?: number;
  /** A handout is one sheet: its wash runs along the top, where a book's runs along the outer edge. */
  handout?: boolean;
}

export const DEFAULT_PAGE_ASPECT = Math.SQRT2;

function isPart(value: unknown): value is DressingPart {
  if (typeof value !== "object" || value === null) return false;
  const { on, strength } = value as Record<string, unknown>;
  return typeof on === "boolean" && typeof strength === "number" && Number.isFinite(strength) && strength >= 0 && strength <= 1;
}

/** What the column holds, checked in full; anything that is not a version 1 dressing is null, never an error. */
export function parseDressing(json: unknown): Dressing | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const { v, seed, stain, wash, corners } = json as Record<string, unknown>;
  if (v !== 1) return null;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0) return null;
  if (!isPart(stain) || !isPart(wash) || !isPart(corners)) return null;
  return {
    v: 1,
    seed,
    stain: { on: stain.on, strength: stain.strength },
    wash: { on: wash.on, strength: wash.strength },
    corners: { on: corners.on, strength: corners.strength },
  };
}

/**
 * The dressing a page is drawn with: the document's, unless it prints ink-friendly, which leaves paper and
 * dressing off alike. Every renderer asks here, so none can forget the finish.
 */
export function activeDressing(json: unknown, inkFriendly: boolean): Dressing | null {
  return inkFriendly ? null : parseDressing(json);
}

/** A fresh seed, for a first dressing and for Shuffle. */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}

/** The dressing a part switched on for the first time starts from: every part off but the one asked for. */
export const DEFAULT_STRENGTH: Record<DressingPartId, number> = { stain: 0.6, wash: 0.5, corners: 0.8 };

export function emptyDressing(seed: number): Dressing {
  return {
    v: 1,
    seed,
    stain: { on: false, strength: DEFAULT_STRENGTH.stain },
    wash: { on: false, strength: DEFAULT_STRENGTH.wash },
    corners: { on: false, strength: DEFAULT_STRENGTH.corners },
  };
}

/** True when nothing would be drawn: the column can go back to null. */
export function isBare(dressing: Dressing): boolean {
  return !dressing.stain.on && !dressing.wash.on && !dressing.corners.on;
}

const draws = (part: DressingPart): boolean => part.on && part.strength > 0;

/** Whether any page of this dressing carries a mark (a part on, above strength 0). */
export function isDrawn(dressing: Dressing | null): boolean {
  return dressing !== null && (draws(dressing.stain) || draws(dressing.wash) || draws(dressing.corners));
}

const PART_SALT: Record<DressingPartId, number> = { stain: 0x51a1, wash: 0x7a5b, corners: 0x3c07 };

/** A random source for one part of one page: the seed, the part and the page number, mixed so neighbours differ. */
function rngFor(seed: number, part: DressingPartId, pageNumber: number): () => number {
  let h = (seed ^ Math.imul(pageNumber + 1, 0x9e3779b1) ^ Math.imul(PART_SALT[part], 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return createRng(h);
}

const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** Height as a % of the page for a mark `width` % wide: its proportions kept on a page of this aspect. */
function heightFor(asset: MarkAsset, width: number, aspect: number): number {
  return width / (MARK_ASSETS[asset].aspect * aspect);
}

function stainMarks(part: DressingPart, seed: number, pageNumber: number, aspect: number): Mark[] {
  const rng = rngFor(seed, "stain", pageNumber);
  const ring = rng() < 0.25;
  const asset: MarkAsset = ring ? "stain-ring" : "stain-edge-bottom";
  const scale = between(rng, 0.9, 1.15);
  const flipX = rng() < 0.5;
  const turn = between(rng, -4, 4);
  const opacity = part.strength * between(rng, 0.7, 1);
  const slide = rng();
  const lift = rng();
  if (ring) {
    // A cup ring sits in the lower part of the page, anywhere across it.
    const width = 36 * scale;
    const height = heightFor(asset, width, aspect);
    return [{ asset, left: 6 + slide * (88 - width), top: 100 - height - 4 - lift * 10, width, height, rotate: turn, flipX, flipY: false, opacity }];
  }
  // The stain runs off the lower edge, wider than the page so it bleeds off a side as well.
  const width = 112 * scale;
  const height = heightFor(asset, width, aspect);
  return [{ asset, left: -(width - 100) * slide, top: 100 - height + lift * 2, width, height, rotate: turn, flipX, flipY: false, opacity }];
}

function washMarks(part: DressingPart, seed: number, pageNumber: number, aspect: number, handout: boolean): Mark[] {
  const rng = rngFor(seed, "wash", pageNumber);
  const flipX = rng() < 0.5;
  const along = rng();
  const opacity = part.strength * between(rng, 0.8, 1);
  const jitter = between(rng, -1.5, 1.5);
  const asset: MarkAsset = "edge-wash-band";
  const ratio = MARK_ASSETS[asset].aspect;
  if (handout) {
    // One sheet: the band hangs from the top edge, as it was painted.
    const width = 108;
    const height = heightFor(asset, width, aspect);
    return [{ asset, left: -(width - 100) * along, top: -1, width, height, rotate: jitter, flipX, flipY: false, opacity }];
  }
  // A book opens in spreads: odd pages are on the right and take the wash on their right edge, even ones on the left.
  const right = pageNumber % 2 === 1;
  // Length along the edge, as % of the page height; its thickness follows from the band's proportions.
  const lengthOfPage = between(rng, 58, 78);
  const lengthPx = lengthOfPage * aspect; // in units of the page width (height = aspect * width)
  const thickness = lengthPx / ratio; // across the edge, in units of the page width
  const width = lengthPx; // % of the page width, before turning
  const height = thickness / aspect; // % of the page height, before turning
  const cx = right ? 100 - thickness / 2 + 1 : thickness / 2 - 1;
  const cy = 50 + (along - 0.5) * (100 - lengthOfPage);
  return [{ asset, left: cx - width / 2, top: cy - height / 2, width, height, rotate: (right ? 90 : -90) + jitter, flipX, flipY: false, opacity }];
}

/** The inset of the corner flourishes, as % of the page width (and the same distance down, whatever the aspect). */
const CORNER_INSET = 3.5;
const CORNER_WIDTH = 17;

function cornerMarks(part: DressingPart, aspect: number): Mark[] {
  const asset: MarkAsset = "corner-flourish";
  const width = CORNER_WIDTH;
  const height = heightFor(asset, width, aspect);
  const insetY = CORNER_INSET / aspect;
  const out: Mark[] = [];
  for (const flipY of [false, true]) {
    for (const flipX of [false, true]) {
      out.push({
        asset,
        left: flipX ? 100 - CORNER_INSET - width : CORNER_INSET,
        top: flipY ? 100 - insetY - height : insetY,
        width,
        height,
        rotate: 0,
        flipX,
        flipY,
        opacity: part.strength,
      });
    }
  }
  return out;
}

/**
 * The marks one page carries. Page numbers are the book's own physical numbers (the first page of the book is 1,
 * a cover and a blank page count), so every renderer numbers a page the same way. A cover, a blank page or no
 * dressing is no marks; a part that is off, or at strength 0, adds none.
 */
export function dressPage(dressing: Dressing | null, pageNumber: number, kind: PageKind, opts: DressPageOptions = {}): Mark[] {
  if (!dressing || kind !== "text") return [];
  const aspect = opts.aspect !== undefined && opts.aspect > 0 ? opts.aspect : DEFAULT_PAGE_ASPECT;
  const marks: Mark[] = [];
  if (draws(dressing.stain)) marks.push(...stainMarks(dressing.stain, dressing.seed, pageNumber, aspect));
  if (draws(dressing.wash)) marks.push(...washMarks(dressing.wash, dressing.seed, pageNumber, aspect, opts.handout === true));
  if (draws(dressing.corners)) marks.push(...cornerMarks(dressing.corners, aspect));
  return marks;
}
