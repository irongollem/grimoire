/*
 * Scriptorium content migration v2 → v3 (Phase D, #456).
 *
 * Decorations used to live in the Tiptap content stream as nodes (watercolor,
 * watermark, artistCredit) or absolute-positioned images. Phase D moves them
 * into the sibling `page_furniture` column so they can be dragged on the page
 * without fighting reflow. This pure function lifts top-level decoration nodes
 * out of the doc and returns the cleaned content plus the extracted furniture,
 * anchoring each to the nearest preceding block (so it follows that content
 * across reflows) or page 1.
 *
 * The legacy node definitions stay registered forever, so any decoration this
 * doesn't catch (e.g. nested inside a callout) still parses and renders.
 */

import type { JSONContent } from "@tiptap/core";
import type { PageFurnitureItem, FurnitureAnchor } from "@/types/scriptorium.types";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/lib/scriptorium/editorConstants";
import { createFurnitureItem } from "@/lib/scriptorium/furniture/model";

export const SCRIPTORIUM_CONTENT_VERSION = 3;

const DECORATION_TYPES = new Set(["watercolor", "watermark", "artistCredit"]);

/** Legacy positions were px against an A4 page; convert to % of the page box. */
const PAGE = EDITOR_PAGE_DIMENSIONS_PX.A4;
function pxToPct(value: unknown, axis: "w" | "h"): number {
  const px = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : 0;
  if (!Number.isFinite(px)) return 0;
  return Math.round((px / PAGE[axis]) * 1000) / 10; // one decimal
}

function isDecoration(node: JSONContent): boolean {
  if (DECORATION_TYPES.has(node.type ?? "")) return true;
  // absolute-positioned image
  return node.type === "image" && node.attrs?.layoutMode === "absolute";
}

function toFurniture(node: JSONContent, anchor: FurnitureAnchor): PageFurnitureItem {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "watercolor":
      return createFurnitureItem("watercolor", anchor, {
        x: pxToPct(a.left, "w"),
        y: pxToPct(a.top, "h"),
        width: pxToPct(a.width, "w") || 35,
        z: "under",
        props: { variant: a.variant ?? 1, color: a.color ?? "#7d1c1c", opacity: a.opacity ?? 80 },
      });
    case "watermark":
      return createFurnitureItem("watermark", anchor, {
        z: "under",
        props: { text: a.text ?? "DRAFT", rotation: a.rotation ?? -30, opacity: a.opacity ?? 15 },
      });
    case "artistCredit":
      return createFurnitureItem("artistCredit", anchor, {
        props: { artistName: a.artistName ?? "", position: a.position ?? "bottom-right" },
      });
    default: // absolute image
      return createFurnitureItem("art", anchor, {
        x: pxToPct(a.posLeft, "w"),
        y: pxToPct(a.posTop, "h"),
        width: pxToPct(a.width, "w") || 40,
        z: "over",
        props: { src: a.src ?? "" },
      });
  }
}

export interface MigrateV2ToV3Result {
  content: JSONContent;
  furniture: PageFurnitureItem[];
}

/**
 * Lift top-level decoration nodes into furniture. Returns a new doc; the input
 * is not mutated. Non-doc / empty input passes through with empty furniture.
 */
export function migrateV2ToV3(doc: JSONContent): MigrateV2ToV3Result {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) {
    return { content: doc, furniture: [] };
  }
  const kept: JSONContent[] = [];
  const furniture: PageFurnitureItem[] = [];
  let lastBlockId: string | null = null;

  for (const node of doc.content) {
    if (isDecoration(node)) {
      const anchor: FurnitureAnchor = lastBlockId
        ? { type: "block", blockId: lastBlockId }
        : { type: "page", page: 1 };
      furniture.push(toFurniture(node, anchor));
      continue; // drop from content
    }
    kept.push(node);
    const id = node.attrs?.blockId;
    if (typeof id === "string" && id) lastBlockId = id;
  }

  return { content: { ...doc, content: kept }, furniture };
}

/** True if the doc still contains a top-level decoration node (i.e. needs v3). */
export function needsV2ToV3(doc: JSONContent): boolean {
  return (
    !!doc &&
    doc.type === "doc" &&
    Array.isArray(doc.content) &&
    doc.content.some(isDecoration)
  );
}
