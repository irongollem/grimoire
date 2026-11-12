/*
 * Page-furniture model helpers (Phase D, #456).
 *
 * Creation defaults per kind and a defensive parser for the JSONB column.
 * Pure — no DOM. The rendering lives in renderFurniture.ts; the editor overlay
 * (drag/resize) consumes these later.
 */

import type {
  PageFurnitureItem,
  FurnitureKind,
  FurnitureAnchor,
  FurnitureCorner,
} from "@/scriptorium/types";

/** Sensible position + props defaults per decoration kind. */
const KIND_DEFAULTS: Record<
  FurnitureKind,
  { x: number; y: number; width: number; z: "under" | "over"; props: Record<string, string | number> }
> = {
  // A splatter blob, behind the text.
  watercolor: { x: 8, y: 10, width: 35, z: "under", props: { variant: 1, color: "#2a2018", opacity: 80 } },
  // Page-spanning diagonal text behind the body (x/y/width ignored by the renderer).
  watermark: { x: 0, y: 0, width: 100, z: "under", props: { text: "DRAFT", rotation: -30, opacity: 15 } },
  // Corner caption above the art.
  artistCredit: { x: 0, y: 0, width: 40, z: "over", props: { artistName: "", position: "bottom-right" } },
  // Free-floating art, above the text by default.
  art: { x: 20, y: 20, width: 40, z: "over", props: { src: "" } },
};

function randomId(): string {
  // crypto.randomUUID is available in the browser + happy-dom; fall back just in case.
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f_${Date.now()}_${Math.round(performance.now())}`;
}

/** Build a furniture item of `kind` anchored to `anchor`, with overridable fields. */
export function createFurnitureItem(
  kind: FurnitureKind,
  anchor: FurnitureAnchor,
  overrides: Partial<Omit<PageFurnitureItem, "id" | "kind" | "anchor">> = {},
): PageFurnitureItem {
  const d = KIND_DEFAULTS[kind];
  return {
    id: randomId(),
    kind,
    anchor,
    x: overrides.x ?? d.x,
    y: overrides.y ?? d.y,
    width: overrides.width ?? d.width,
    z: overrides.z ?? d.z,
    props: { ...d.props, ...overrides.props },
  };
}

export const FURNITURE_CORNERS: readonly FurnitureCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * How close, in % of the page, a dragged picture's edges must come to a corner
 * (on both axes) before it snaps flush into it. 2.5% is about 5 mm on an A4
 * sheet: near enough that a hand aiming for the corner lands in it, far
 * enough that a picture placed deliberately near a margin is not grabbed.
 */
export const SNAP_PCT = 2.5;

/** The corner a box (left/top/width/height, % of the page) is within SNAP_PCT of on both axes, or null. */
export function snapCorner(left: number, top: number, width: number, height: number): FurnitureCorner | null {
  const nearLeft = left <= SNAP_PCT;
  const nearRight = 100 - (left + width) <= SNAP_PCT;
  const nearTop = top <= SNAP_PCT;
  const nearBottom = 100 - (top + height) <= SNAP_PCT;
  if (nearTop && nearLeft) return "top-left";
  if (nearTop && nearRight) return "top-right";
  if (nearBottom && nearLeft) return "bottom-left";
  if (nearBottom && nearRight) return "bottom-right";
  return null;
}

/**
 * The left/top coordinates an item has where it is drawn, wherever it is
 * pinned. A bottom-corner inset needs the item's drawn height as a % of the
 * page (`heightPct`), which only a laid-out page can give: without it the
 * answer is null rather than a guess. The width is the item's own, unless the
 * caller measured it (`widthPct`).
 */
export function freeCoordinates(
  item: PageFurnitureItem,
  heightPct: number | null,
  widthPct: number = item.width,
): { x: number; y: number } | null {
  const c = item.corner;
  if (!c) return { x: item.x, y: item.y };
  if (c.startsWith("bottom") && heightPct === null) return null;
  const round = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  return {
    x: round(c.endsWith("right") ? 100 - widthPct - item.x : item.x),
    y: round(c.startsWith("bottom") && heightPct !== null ? 100 - heightPct - item.y : item.y),
  };
}

/** Only these kinds can be pinned to a corner; a watermark and an artist credit place themselves. */
export function canPinToCorner(kind: FurnitureKind): boolean {
  return kind === "art" || kind === "watercolor";
}

/**
 * A picture set to cover its whole page, edge to edge and cropped to fit. Read
 * defensively: only the exact value counts, so a stray prop never fills a page,
 * and only art can fill (a watercolour has no picture to crop).
 */
export function fillsPage(item: PageFurnitureItem): boolean {
  return item.kind === "art" && item.props.fill === "page";
}

/** The item without its fill prop, an ordinary picture again (other props are kept). */
export function withoutFill(item: PageFurnitureItem): PageFurnitureItem {
  const props = Object.fromEntries(Object.entries(item.props).filter(([key]) => key !== "fill"));
  return { ...item, props };
}

const KINDS: FurnitureKind[] = ["watercolor", "watermark", "artistCredit", "art"];

function isValidAnchor(a: unknown): a is FurnitureAnchor {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  if (o.type === "page") return typeof o.chapterId === "string" && typeof o.page === "number";
  if (o.type === "block") return typeof o.blockId === "string";
  return false;
}

/**
 * Parse the `page_furniture` JSONB column defensively: drop anything malformed
 * so a bad row can never crash the renderer. Always returns an array.
 */
export function parsePageFurniture(raw: unknown): PageFurnitureItem[] {
  const arr = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(arr)) return [];
  const out: PageFurnitureItem[] = [];
  for (const v of arr) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    if (!KINDS.includes(o.kind as FurnitureKind)) continue;
    if (!isValidAnchor(o.anchor)) continue;
    const corner = FURNITURE_CORNERS.find((c) => c === o.corner);
    out.push({
      id: o.id,
      kind: o.kind as FurnitureKind,
      anchor: o.anchor as FurnitureAnchor,
      x: typeof o.x === "number" ? o.x : 0,
      y: typeof o.y === "number" ? o.y : 0,
      width: typeof o.width === "number" ? o.width : 30,
      ...(corner ? { corner } : {}),
      z: o.z === "over" ? "over" : "under",
      props: o.props && typeof o.props === "object" ? (o.props as Record<string, string | number>) : {},
    });
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
