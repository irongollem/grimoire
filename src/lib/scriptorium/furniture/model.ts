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
} from "@/types/scriptorium.types";

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

const KINDS: FurnitureKind[] = ["watercolor", "watermark", "artistCredit", "art"];

function isValidAnchor(a: unknown): a is FurnitureAnchor {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  if (o.type === "page") return typeof o.page === "number";
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
    out.push({
      id: o.id,
      kind: o.kind as FurnitureKind,
      anchor: o.anchor as FurnitureAnchor,
      x: typeof o.x === "number" ? o.x : 0,
      y: typeof o.y === "number" ? o.y : 0,
      width: typeof o.width === "number" ? o.width : 30,
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
