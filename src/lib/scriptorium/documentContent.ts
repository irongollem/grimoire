/*
 * Scriptorium content: parsing stored rows, and normalizing content that
 * arrives from outside this app's own save path (#915 story 2).
 *
 * Two entry points, two trust levels:
 *
 *  - `parseStoredContent` reads `scriptorium_documents.content` as saved by
 *    THIS app. Every write path has stored current-version Tiptap JSON since
 *    #915 story 3 (linked entity embeds), so this does exactly one thing —
 *    `JSON.parse`, and throw a typed `UnreadableDocumentError` if the result
 *    isn't a Tiptap document. No migration, no HTML fallback: those belong at
 *    the import boundary below, not on every read of a document that is
 *    already correct. The two rows in production that predate story 3 (raw
 *    HTML) are converted once, via `htmlToScriptoriumJson`, not read around
 *    forever.
 *
 *  - `normalizeImportedDocument` is the import boundary: World Bundle import
 *    (`useWorldBundle.ts`) is the one remaining place content can arrive from
 *    outside this app's own editor — a bundle exported long ago can still
 *    carry a raw HTML `content` string or a pre-v3 JSON shape. It folds what
 *    the old lazy-migrate-on-open passes did (`migrations/v1ToV2.ts`:
 *    `<hr>`/`horizontalRule` → `pageBreak`; `migrations/v2ToV3.ts`: decoration
 *    nodes and absolute images lifted into `page_furniture`) into ONE
 *    conversion, run once at the edge, rather than lazily on every open.
 *    Those two migration modules and their tests are folded in here; there is
 *    no separate `migrations/` path any more.
 *
 * `htmlToScriptoriumJson` is exported standalone (pure, no I/O) so the two
 * production rows that still hold raw HTML can be converted directly.
 */

import { generateJSON, type JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { createFurnitureItem, parsePageFurniture } from "@/lib/scriptorium/furniture/model";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/lib/scriptorium/editorConstants";
import type { PageFurnitureItem, FurnitureAnchor } from "@/types/scriptorium.types";

/** A valid, empty Tiptap document. */
export function emptyDoc(): JSONContent {
  return { type: "doc", content: [] };
}

/**
 * Thrown by `parseStoredContent` when a row's `content` cannot be read as a
 * current-version Tiptap document. The UI shows this as a visible "This
 * document could not be read" state — never a silent HTML fallback.
 */
export class UnreadableDocumentError extends Error {
  constructor(cause?: unknown) {
    super("This document could not be read.");
    this.name = "UnreadableDocumentError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Parse `scriptorium_documents.content` for STORED content only — see the
 * module doc above for why this never migrates or falls back to HTML.
 */
export function parseStoredContent(content: string | null): JSONContent {
  if (!content) return emptyDoc();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new UnreadableDocumentError(cause);
  }
  if (!parsed || typeof parsed !== "object" || (parsed as JSONContent).type !== "doc") {
    throw new UnreadableDocumentError();
  }
  return parsed as JSONContent;
}

// ── Import-boundary normalization ───────────────────────────────────────────

/** The three decoration node types retired from the schema (#915 story 2) —
 *  new decorations are page furniture, never content nodes; these three
 *  shapes only ever appear in content this module is normalizing away from. */
const LEGACY_DECORATION_TYPES = new Set(["watercolor", "watermark", "artistCredit"]);

/** Legacy positions were px against an A4 page; convert to % of the page box. */
const PAGE = EDITOR_PAGE_DIMENSIONS_PX.A4;
function pxToPct(value: unknown, axis: "w" | "h"): number {
  const px =
    typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : 0;
  if (!Number.isFinite(px)) return 0;
  return Math.round((px / PAGE[axis]) * 1000) / 10; // one decimal
}

function isLegacyDecorationNode(node: JSONContent): boolean {
  if (LEGACY_DECORATION_TYPES.has(node.type ?? "")) return true;
  return node.type === "image" && node.attrs?.layoutMode === "absolute";
}

function legacyDecorationToFurniture(node: JSONContent, anchor: FurnitureAnchor): PageFurnitureItem {
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

export interface NormalizedContent {
  content: JSONContent;
  furniture: PageFurnitureItem[];
}

/**
 * Convert top-level `horizontalRule` nodes to `pageBreak` nodes, and lift
 * top-level legacy decoration / absolute-image nodes into page furniture —
 * what `migrateV1ToV2` + `migrateV2ToV3` did as two lazy-on-open passes,
 * folded into one pass over a JSON document that may predate either. Returns
 * a new doc; the input is not mutated. Non-doc / empty input passes through
 * unchanged with no furniture.
 */
function normalizeJsonDoc(doc: JSONContent): NormalizedContent {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) {
    return { content: doc, furniture: [] };
  }
  const kept: JSONContent[] = [];
  const furniture: PageFurnitureItem[] = [];
  let lastBlockId: string | null = null;

  for (const raw of doc.content) {
    const node = raw?.type === "horizontalRule" ? { type: "pageBreak" } : raw;
    if (isLegacyDecorationNode(node)) {
      const anchor: FurnitureAnchor = lastBlockId
        ? { type: "block", blockId: lastBlockId }
        : { type: "page", page: 1 };
      furniture.push(legacyDecorationToFurniture(node, anchor));
      continue; // drop from content
    }
    kept.push(node);
    const id = node.attrs?.blockId;
    if (typeof id === "string" && id) lastBlockId = id;
  }

  return { content: { ...doc, content: kept }, furniture };
}

/**
 * Convert a raw HTML document body into current-version Tiptap JSON +
 * furniture. Pure (aside from `DOMParser`, available in every runtime this
 * ships to and in vitest's happy-dom) — exported standalone so the two
 * production rows that still hold raw HTML can be converted directly with
 * this one function, without going through a whole row.
 *
 * Legacy decoration markup (`img[data-type="watercolor"]`,
 * `div[data-type="watermark"]`, `div[data-type="artistCredit"]`) is stripped
 * in a pre-pass, before Tiptap's schema-based HTML parser ever sees it: those
 * three node types are no longer registered (see `scriptoriumExtensions.ts`),
 * so left in place a `div[data-type="watermark"]` would fall through
 * ProseMirror's "unrecognised element → parse its children instead" rule and
 * dump its caption text into the content stream as a stray paragraph.
 * Stripping first means the schema never has to know these shapes existed.
 *
 * There is no `data-block-id` on markup this old, so every decoration found
 * this way anchors to page 1 — the same fallback the block-anchored lift uses
 * when there is no preceding block. Absolute-position images need no such
 * pre-pass: `ScriptoriumImage` still parses `data-layout-mode="absolute"`
 * directly, so `normalizeJsonDoc` lifts them the same way it would for JSON
 * input, after the HTML has already gone through Tiptap's own parser.
 */
export function htmlToScriptoriumJson(html: string): NormalizedContent {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const furniture: PageFurnitureItem[] = [];
  const anchor: FurnitureAnchor = { type: "page", page: 1 };

  doc.body
    .querySelectorAll(
      'img[data-type="watercolor"], div[data-type="watermark"], div[data-type="artistCredit"]',
    )
    .forEach((el) => {
      const type = el.getAttribute("data-type");
      if (type === "watercolor") {
        furniture.push(
          createFurnitureItem("watercolor", anchor, {
            x: pxToPct(el.getAttribute("data-left"), "w"),
            y: pxToPct(el.getAttribute("data-top"), "h"),
            width: pxToPct(el.getAttribute("data-width"), "w") || 35,
            z: "under",
            props: {
              variant: Number(el.getAttribute("data-variant")) || 1,
              color: el.getAttribute("data-color") ?? "#7d1c1c",
              opacity: Number(el.getAttribute("data-opacity")) || 80,
            },
          }),
        );
      } else if (type === "watermark") {
        furniture.push(
          createFurnitureItem("watermark", anchor, {
            z: "under",
            props: {
              text: el.getAttribute("data-text") ?? "DRAFT",
              rotation: Number(el.getAttribute("data-rotation")) || -30,
              opacity: Number(el.getAttribute("data-opacity")) || 15,
            },
          }),
        );
      } else if (type === "artistCredit") {
        furniture.push(
          createFurnitureItem("artistCredit", anchor, {
            props: {
              artistName: el.getAttribute("data-artist-name") ?? "",
              position: el.getAttribute("data-position") ?? "bottom-right",
            },
          }),
        );
      }
      el.remove();
    });

  const json = generateJSON(doc.body.innerHTML, createScriptoriumExtensions()) as JSONContent;
  const lifted = normalizeJsonDoc(json);
  return { content: lifted.content, furniture: [...furniture, ...lifted.furniture] };
}

/**
 * Normalize one imported `scriptorium_documents` row — the World Bundle
 * import boundary, and the one-time production HTML conversion — to
 * current-version `{ content, page_furniture }`. `JSON.parse` succeeding on a
 * `type: "doc"` object is what tells a pre-v3 JSON shape apart from raw HTML.
 * Existing `page_furniture` on the row (already current-version, if the
 * source was ever saved post-#456) is preserved and merged with anything this
 * pass lifts.
 */
export function normalizeImportedDocument(row: {
  content?: unknown;
  page_furniture?: unknown;
}): { content: string | null; page_furniture: PageFurnitureItem[] } {
  const raw = row.content;
  const existingFurniture = parsePageFurniture(row.page_furniture);

  if (typeof raw !== "string" || !raw.trim()) {
    return { content: typeof raw === "string" ? raw : null, page_furniture: existingFurniture };
  }

  let parsedJson: unknown;
  let isCurrentShapeJson = false;
  try {
    parsedJson = JSON.parse(raw);
    isCurrentShapeJson =
      !!parsedJson && typeof parsedJson === "object" && (parsedJson as JSONContent).type === "doc";
  } catch {
    isCurrentShapeJson = false;
  }

  const normalized = isCurrentShapeJson
    ? normalizeJsonDoc(parsedJson as JSONContent)
    : htmlToScriptoriumJson(raw);

  return {
    content: JSON.stringify(normalized.content),
    page_furniture: [...existingFurniture, ...normalized.furniture],
  };
}
