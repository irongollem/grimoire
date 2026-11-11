/*
 * Shared page-furniture render pass (Phase D, #456).
 *
 * Positions decoration elements on the laid-out Paged.js pages — the SAME code
 * for the live preview and the print/PDF pipeline, so what you see is what
 * prints. Each item resolves to a physical page (by page number, or the page
 * that contains its anchor block), then is absolutely positioned as a % of the
 * page box. "under" items go behind the body text (earlier in the DOM), "over"
 * items above it.
 *
 * The editor overlay layers drag/resize handles on top of these later; this
 * function only renders the decorations themselves.
 */

import type { PageFurnitureItem, FurnitureAnchor } from "@/scriptorium/types";
import { watercolorAsset, watercolorSrc } from "@/data/watercolorAssets";
import { followsBlock, placeAtAnchor, topPct } from "@/scriptorium/lib/furniture/anchorOffset";
import { fillsPage } from "@/scriptorium/lib/furniture/model";
import { artBlend } from "@/scriptorium/lib/furniture/blend";

const FURNITURE_CLASS = "sc-furniture";

/** The data attributes the book layout puts on each page of a chapter. */
export const CHAPTER_ID_ATTR = "data-chapter-id";
export const CHAPTER_PAGE_ATTR = "data-chapter-page";

/**
 * Resolve a furniture anchor to its physical page element. A page anchor names
 * a page within a chapter (1-based), and a blank page belongs to no chapter's
 * numbering, so it is never the answer.
 */
function resolvePage(
  pages: HTMLElement[],
  anchor: FurnitureAnchor,
  chapterPages: Map<string, HTMLElement>,
  lastPages: Map<string, HTMLElement>,
): HTMLElement | null {
  if (anchor.type === "page") {
    // A page the chapter no longer reaches (it got shorter) waits on its last page rather than vanishing.
    return chapterPages.get(`${anchor.chapterId}\u0000${anchor.page}`) ?? lastPages.get(anchor.chapterId) ?? null;
  }
  // block anchor: the page whose content contains the block id. UUIDs are
  // selector-safe, so they can be interpolated directly.
  return pages.find((p) => p.querySelector(`[data-block-id="${anchor.blockId}"]`)) ?? null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

/**
 * How strong art behind the text is when the DM has not set it (the
 * inspector's "Strength"). 40 was chosen by looking at a dark portrait behind
 * a paragraph on every paper (#1175): at 60 the ink over its darkest parts
 * read grey; at 40 it stays black and the picture still reads.
 */
export const DEFAULT_UNDER_ART_OPACITY = 40;

/**
 * The position declarations of a picture or watercolour. A cornered item is
 * placed from its corner (right/bottom for the right/bottom ones), so changing
 * its width grows it away from the corner and it keeps hugging both edges.
 */
export function positionDeclarations(item: PageFurnitureItem): string[] {
  const c = item.corner;
  if (!c) return [`left:${item.x}%`, `top:${item.y}%`];
  return [c.endsWith("left") ? `left:${item.x}%` : `right:${item.x}%`, c.startsWith("top") ? `top:${item.y}%` : `bottom:${item.y}%`];
}

/** Build the decoration element for one item (positioned, no drag handles). */
export function buildFurnitureElement(item: PageFurnitureItem): HTMLElement {
  const zIndex = item.z === "over" ? "6" : "0";

  if (item.kind === "watercolor") {
    // The ink art is monochrome, so paint it as a mask filled with the tint
    // colour (a hue-rotate filter can't recolour black). The box is height-less,
    // so aspect-ratio reconstructs it from the source art's proportions.
    const asset = watercolorAsset(num(item.props.variant, 1));
    const src = watercolorSrc(num(item.props.variant, 1));
    const mask = `url("${src}") center / contain no-repeat`;
    const div = document.createElement("div");
    div.style.cssText = [
      "position:absolute",
      ...positionDeclarations(item),
      `width:${item.width}%`,
      `aspect-ratio:${asset.aspect}`,
      `background-color:${str(item.props.color, "#2a2018")}`,
      `-webkit-mask:${mask}`,
      `mask:${mask}`,
      `opacity:${num(item.props.opacity, 80) / 100}`,
      "mix-blend-mode:multiply",
      "pointer-events:none",
      `z-index:${zIndex}`,
    ].join(";");
    return decorate(div, item);
  }

  if (item.kind === "art") {
    // Art behind the text is muted and, unless it was set to sit on top, multiplied into the paper, so text over
    // it stays readable on every paper. Art in front is shown as it is unless it was printed into the paper.
    const behind = item.z === "under";
    const img = document.createElement("img");
    img.src = str(item.props.src);
    img.alt = "";
    // A treated picture prints from its recipe (printImages.ts): the same keys the image node carries.
    for (const [prop, attr] of [["original", "data-original"], ["illuminate", "data-illuminate"], ["bakedFor", "data-baked-for"]] as const) {
      const value = str(item.props[prop]);
      if (value) img.setAttribute(attr, value);
    }
    // Filling the page covers the whole page box, cropped like object-fit: cover, whatever x, y, width or corner say.
    const fill = fillsPage(item);
    img.style.cssText = [
      "position:absolute",
      ...(fill ? ["inset:0", "width:100%", "height:100%", "object-fit:cover"] : [...positionDeclarations(item), `width:${item.width}%`, "height:auto"]),
      // Set for export only (printImages.ts): the crop's shape, so the layout measures the real box.
      ...(!fill && num(item.props.aspect, 0) > 0 ? [`aspect-ratio:${num(item.props.aspect, 0)}`] : []),
      ...(behind ? [`opacity:${num(item.props.opacity, DEFAULT_UNDER_ART_OPACITY) / 100}`] : []),
      ...(artBlend(item) === "paper" ? ["mix-blend-mode:multiply"] : []),
      "pointer-events:none",
      `z-index:${zIndex}`,
    ].join(";");
    return decorate(img, item);
  }

  if (item.kind === "watermark") {
    // Page-spanning diagonal text; x/y/width are ignored.
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;" +
      `z-index:${zIndex}`;
    const span = document.createElement("span");
    span.textContent = str(item.props.text, "DRAFT");
    span.style.cssText = [
      "font-family:var(--sc-heading-font,Georgia,serif)",
      "font-size:7rem",
      "font-variant:small-caps",
      "font-weight:700",
      "letter-spacing:0.15em",
      "color:var(--sc-decoration-watermark,var(--sc-accent,#1B3A4B))",
      `opacity:${num(item.props.opacity, 15) / 100}`,
      `transform:rotate(${num(item.props.rotation, -30)}deg)`,
      "white-space:nowrap",
    ].join(";");
    wrap.appendChild(span);
    return decorate(wrap, item);
  }

  // artistCredit — corner caption.
  const el = document.createElement("div");
  const position = str(item.props.position, "bottom-right");
  const [v, h] = position.split("-");
  el.textContent = str(item.props.artistName);
  el.style.cssText = [
    "position:absolute",
    v === "top" ? "top:0.5rem" : "bottom:0.5rem",
    h === "left" ? "left:0.75rem" : "right:0.75rem",
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:0.7rem",
    "font-style:italic",
    "color:var(--sc-decoration-credit,var(--sc-ink,#1a1a1a))",
    "opacity:0.55",
    "pointer-events:none",
    `z-index:${zIndex}`,
  ].join(";");
  return decorate(el, item);
}

function decorate(el: HTMLElement, item: PageFurnitureItem): HTMLElement {
  el.classList.add(FURNITURE_CLASS, `${FURNITURE_CLASS}--${item.kind}`);
  el.setAttribute("data-furniture-id", item.id);
  return el;
}

/**
 * Make a built decoration a pointer target, outlined when selected. The
 * watermark's wrapper spans the whole page, and making *that* a target would
 * swallow every click on the page, so only its text span is interactive; every
 * other kind is its own bounded element. Editing lifts the decoration above the
 * page content (covers and body text, even transparent regions, otherwise
 * intercept the click); the true under/over layering is the non-interactive
 * render used for print and the reader.
 */
export function makeGrabbable(el: HTMLElement, item: PageFurnitureItem, selected: boolean): void {
  const hit = item.kind === "watermark" ? ((el.firstElementChild as HTMLElement | null) ?? el) : el;
  hit.style.pointerEvents = "auto";
  hit.style.cursor = "move";
  el.style.zIndex = item.z === "over" ? "31" : "30";
  if (selected) {
    // Dashed = pinned to a corner, so a snapped picture reads differently from a free one.
    hit.style.outline = `2px ${item.corner ? "dashed" : "solid"} oklch(0.6 0.2 250)`;
    hit.style.outlineOffset = "2px";
  }
}

export interface RenderFurnitureOptions {
  /** Editor mode: make decorations clickable/draggable and outline the selected one. */
  interactive?: boolean;
  /** Id of the currently selected item (only used when interactive). */
  selectedId?: string | null;
}

/**
 * Render `items` into the laid-out pages inside `container`. Idempotent —
 * clears any previously-rendered furniture first. In `interactive` mode the
 * decorations become pointer targets (the editor wires drag/select on them);
 * print/preview-display mode leaves them inert.
 */
export function renderFurniture(
  container: HTMLElement,
  items: PageFurnitureItem[],
  opts: RenderFurnitureOptions = {},
): void {
  container.querySelectorAll(`.${FURNITURE_CLASS}`).forEach((e) => e.remove());
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  if (!pages.length) return;

  const chapterPages = new Map<string, HTMLElement>();
  const lastPages = new Map<string, HTMLElement>();
  for (const p of pages) {
    const chapterId = p.getAttribute(CHAPTER_ID_ATTR);
    const n = p.getAttribute(CHAPTER_PAGE_ATTR);
    if (chapterId === null || n === null) continue;
    chapterPages.set(`${chapterId}\u0000${n}`, p);
    const last = lastPages.get(chapterId);
    if (!last || Number(n) > Number(last.getAttribute(CHAPTER_PAGE_ATTR))) lastPages.set(chapterId, p);
  }

  for (const item of items) {
    const page = resolvePage(pages, item.anchor, chapterPages, lastPages);
    if (!page) continue;
    const box = page.querySelector<HTMLElement>(".pagedjs_pagebox") ?? page;
    const el = buildFurnitureElement(item);
    if (opts.interactive) makeGrabbable(el, item, item.id === opts.selectedId);
    // Display layering: "under" goes behind the body content (earlier in the
    // DOM), "over" after. In interactive mode everything is appended last (and
    // z-lifted above) so it can be grabbed regardless of page content.
    if (item.z === "under" && !opts.interactive) box.insertBefore(el, box.firstChild);
    else box.appendChild(el);
    // A picture that follows its paragraph is placed from the paragraph's top on this page.
    if (followsBlock(item) && item.anchor.type === "block") {
      const block = page.querySelector<HTMLElement>(`[data-block-id="${item.anchor.blockId}"]`);
      const boxRect = box.getBoundingClientRect();
      // Rect ratios, so a scaled page (the preview's zoom) measures the same as a printed one.
      const top = block ? topPct(block.getBoundingClientRect().top, boxRect.top, boxRect.height) : null;
      if (top !== null) placeAtAnchor(el, item, box, top);
    }
  }
}

export interface FurniturePlacement {
  chapterId: string;
  /** 1-based page within the chapter the item is drawn on. */
  page: number;
  /** The first block laid out on that page, or null when the layout shows none. */
  firstBlockId: string | null;
  /** The item's drawn height as a % of its page, or null when no layout gives one (happy-dom, hidden). */
  heightPct: number | null;
}

/**
 * Where an item is drawn right now, read from the DOM: the page element that
 * holds it (editor page box or preview page, both carry the chapter attributes)
 * and the first block on the preview's copy of that page. Null when nothing is
 * laid out, so the inspector can say why it cannot pin or free an item.
 */
export function furniturePlacement(id: string, root: ParentNode = document): FurniturePlacement | null {
  const drawn = root.querySelector(`[data-furniture-id="${id}"]`);
  const pageEl = drawn?.closest<HTMLElement>(`[${CHAPTER_PAGE_ATTR}]`);
  const chapterId = pageEl?.getAttribute(CHAPTER_ID_ATTR);
  const page = Number(pageEl?.getAttribute(CHAPTER_PAGE_ATTR));
  if (!pageEl || chapterId === null || chapterId === undefined || !Number.isInteger(page)) return null;
  const sheet = root.querySelector<HTMLElement>(
    `.pagedjs_page[${CHAPTER_ID_ATTR}="${chapterId}"][${CHAPTER_PAGE_ATTR}="${page}"]`,
  );
  const firstBlockId = sheet?.querySelector("[data-block-id]")?.getAttribute("data-block-id") ?? null;
  const box = drawn?.closest<HTMLElement>(".pagedjs_pagebox") ?? pageEl;
  const boxH = box.getBoundingClientRect().height;
  const itemH = drawn?.getBoundingClientRect().height ?? 0;
  const heightPct = boxH > 0 && itemH > 0 ? (itemH / boxH) * 100 : null;
  return { chapterId, page, firstBlockId, heightPct };
}
