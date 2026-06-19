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
import { hueRotateForColor } from "@/lib/tiptap/watercolor";

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
    const img = document.createElement("img");
    const variant = num(item.props.variant, 1);
    img.src = `/assets/scriptorium/watercolor/${variant}.png`;
    img.alt = "";
    img.style.cssText = [
      "position:absolute",
      `left:${item.x}%`,
      `top:${item.y}%`,
      `width:${item.width}%`,
      "height:auto",
      `opacity:${num(item.props.opacity, 80) / 100}`,
      "mix-blend-mode:multiply",
      `filter:hue-rotate(${hueRotateForColor(str(item.props.color, "#7d1c1c"))}deg) saturate(1.4)`,
      "pointer-events:none",
      `z-index:${zIndex}`,
    ].join(";");
    return decorate(img, item);
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

/**
 * Render `items` into the laid-out pages inside `container`. Idempotent —
 * clears any previously-rendered furniture first.
 */
export function renderFurniture(container: HTMLElement, items: PageFurnitureItem[]): void {
  container.querySelectorAll(`.${FURNITURE_CLASS}`).forEach((e) => e.remove());
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
  if (!pages.length) return;

  for (const item of items) {
    const page = resolvePage(pages, item.anchor);
    if (!page) continue;
    const box = page.querySelector<HTMLElement>(".pagedjs_pagebox") ?? page;
    const el = buildElement(item);
    // "under" goes behind the body content (earlier in the DOM), "over" after.
    if (item.z === "under") box.insertBefore(el, box.firstChild);
    else box.appendChild(el);
  }
}
