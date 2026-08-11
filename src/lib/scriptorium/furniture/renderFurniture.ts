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

import type { PageFurnitureItem, FurnitureAnchor } from "@/types/scriptorium.types";
import { watercolorAsset } from "@/data/watercolorAssets";

const FURNITURE_CLASS = "sc-furniture";

/** Resolve a furniture anchor to its physical page element. */
function resolvePage(pages: HTMLElement[], anchor: FurnitureAnchor): HTMLElement | null {
  if (anchor.type === "page") {
    return pages[anchor.page - 1] ?? null;
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

/** Build the decoration element for one item (positioned, no drag handles). */
function buildElement(item: PageFurnitureItem): HTMLElement {
  const zIndex = item.z === "over" ? "6" : "0";

  if (item.kind === "watercolor") {
    // The ink art is monochrome, so paint it as a mask filled with the tint
    // colour (a hue-rotate filter can't recolour black). The box is height-less,
    // so aspect-ratio reconstructs it from the source art's proportions.
    const asset = watercolorAsset(num(item.props.variant, 1));
    const src = `/assets/scriptorium/watercolor/${asset.file}`;
    const mask = `url("${src}") center / contain no-repeat`;
    const div = document.createElement("div");
    div.style.cssText = [
      "position:absolute",
      `left:${item.x}%`,
      `top:${item.y}%`,
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
    const img = document.createElement("img");
    img.src = str(item.props.src);
    img.alt = "";
    img.style.cssText = [
      "position:absolute",
      `left:${item.x}%`,
      `top:${item.y}%`,
      `width:${item.width}%`,
      "height:auto",
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

  for (const item of items) {
    const page = resolvePage(pages, item.anchor);
    if (!page) continue;
    const box = page.querySelector<HTMLElement>(".pagedjs_pagebox") ?? page;
    const el = buildElement(item);
    if (opts.interactive) {
      // The clickable/draggable target. The watermark's wrapper spans the whole
      // page — making *that* a pointer target would swallow every click on the
      // page, so only its text span is interactive; every other kind is its own
      // bounded element.
      const hit =
        item.kind === "watermark" ? (el.firstElementChild as HTMLElement | null) ?? el : el;
      hit.style.pointerEvents = "auto";
      hit.style.cursor = "move";
      // Editing always lifts the decoration above the page content (covers and
      // body text — even transparent regions — otherwise intercept the click),
      // so every decoration stays grabbable. The true under/over layering is
      // applied by the non-interactive render used for print and the reader.
      el.style.zIndex = item.z === "over" ? "31" : "30";
      if (item.id === opts.selectedId) {
        hit.style.outline = "2px solid oklch(0.6 0.2 250)";
        hit.style.outlineOffset = "2px";
      }
    }
    // Display layering: "under" goes behind the body content (earlier in the
    // DOM), "over" after. In interactive mode everything is appended last (and
    // z-lifted above) so it can be grabbed regardless of page content.
    if (item.z === "under" && !opts.interactive) box.insertBefore(el, box.firstChild);
    else box.appendChild(el);
  }
}
