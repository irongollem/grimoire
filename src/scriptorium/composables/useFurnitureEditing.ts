/*
 * Drag / resize / select interaction for page furniture in the live preview
 * (Phase D, #456).
 *
 * Furniture decorations are rendered into the Paged.js pages by renderFurniture.
 * This composable adds editing on top: a delegated pointerdown on the paged
 * container starts a drag (or resize, from the bottom-right corner) of the
 * decoration under the pointer. During the gesture the element's own style is
 * updated live — committing to the furniture array only on pointer-up — so the
 * element isn't destroyed by a re-render mid-drag. Deltas are computed as a
 * percentage of the page box's on-screen size, so they're correct at any zoom.
 */

import { onBeforeUnmount, watch, type Ref } from "vue";
import { canPinToCorner, freeCoordinates, snapCorner } from "@/scriptorium/lib/furniture/model";
import { clampTop, followsBlock, offsetFromDrawnTop } from "@/scriptorium/lib/furniture/anchorOffset";
import { CHAPTER_ID_ATTR, CHAPTER_PAGE_ATTR } from "@/scriptorium/lib/furniture/renderFurniture";
import type { FurnitureAnchor, FurnitureCorner, PageFurnitureItem } from "@/scriptorium/types";

export interface FurnitureEditingOptions {
  container: Ref<HTMLElement | null>;
  enabled: () => boolean;
  items: () => PageFurnitureItem[];
  onChange: (items: PageFurnitureItem[]) => void;
  onSelect: (id: string | null) => void;
  /**
   * The furniture element a pointerdown that did not land on one still means,
   * or null. The editor's pictures behind the text sit under the words, so a
   * press there never reaches them; the editor answers for those (#1175).
   */
  hitTest?: (e: PointerEvent) => HTMLElement | null;
}

const RESIZE_ZONE_PX = 16;
const clampPct = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v * 10) / 10));

const OPPOSITE: Record<FurnitureCorner, FurnitureCorner> = {
  "top-left": "bottom-right",
  "top-right": "bottom-left",
  "bottom-left": "top-right",
  "bottom-right": "top-left",
};

/**
 * The patch a drag commits: a snapped item is pinned flush into its corner, a
 * free one gets left/top coordinates and no corner.
 */
export function movePatch(
  left: number,
  top: number,
  corner: FurnitureCorner | null,
  /** The anchor block's top (% of the page) when the item follows a block: `y` is then the offset from it. */
  anchorTop: number | null = null,
): Pick<PageFurnitureItem, "x" | "y"> & { corner?: FurnitureCorner } {
  if (corner) return { corner, x: 0, y: 0 };
  return { x: clampPct(left), y: anchorTop === null ? clampPct(top) : offsetFromDrawnTop(top, anchorTop) };
}

/** Pin a block-anchored item to the page it is drawn on; any other anchor, or an undrawn page, is kept. */
export function pinnedAnchor(item: PageFurnitureItem, box: HTMLElement): FurnitureAnchor {
  if (item.anchor.type !== "block") return item.anchor;
  const pageEl = box.closest<HTMLElement>(`[${CHAPTER_PAGE_ATTR}]`);
  const chapterId = pageEl?.getAttribute(CHAPTER_ID_ATTR);
  const page = Number(pageEl?.getAttribute(CHAPTER_PAGE_ATTR));
  if (!chapterId || !Number.isInteger(page)) return item.anchor;
  return { type: "page", chapterId, page };
}

export function useFurnitureEditing(opts: FurnitureEditingOptions) {
  let el: HTMLElement | null = null; // the container we listened on
  let drag: {
    target: HTMLElement;
    box: HTMLElement;
    id: string;
    mode: "move" | "resize";
    pinCorner: FurnitureCorner | null;
    canSnap: boolean;
    boxW: number;
    boxH: number;
    startClientX: number;
    startClientY: number;
    /** Left/top of the item as free coordinates, wherever it was pinned. */
    startLeft: number;
    startTop: number;
    /** Set when the item follows a block: top is then a drawn top, and this is the block's top (% of the page). */
    anchorTop: number | null;
    startWidth: number;
    widthPct: number;
    heightPct: number;
    snapped: FurnitureCorner | null;
  } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (!opts.enabled()) return;
    const target =
      (e.target as HTMLElement).closest<HTMLElement>("[data-furniture-id]") ?? opts.hitTest?.(e) ?? null;
    if (!target) {
      opts.onSelect(null); // click on blank page deselects
      return;
    }
    const id = target.dataset.furnitureId!;
    const item = opts.items().find((i) => i.id === id);
    if (!item) return;
    opts.onSelect(id);

    const box = target.closest<HTMLElement>(".pagedjs_pagebox") ?? target.parentElement;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    // Resize from the corner opposite the pin (bottom-right for a free item),
    // so the pinned corner never moves.
    const inner = item.corner ? OPPOSITE[item.corner] : "bottom-right";
    const nearX = (inner.endsWith("right") ? r.right - e.clientX : e.clientX - r.left) < RESIZE_ZONE_PX;
    const nearY = (inner.startsWith("bottom") ? r.bottom - e.clientY : e.clientY - r.top) < RESIZE_ZONE_PX;
    const widthPct = item.width;
    const heightPct = boxRect.height > 0 ? (r.height / boxRect.height) * 100 : 0;
    const c = item.corner;

    // Where it is drawn, as left/top: the drag works in those whatever the pin.
    // A box with no height (not laid out) gives nothing to drag against.
    const start = freeCoordinates(item, boxRect.height > 0 ? heightPct : null, widthPct);
    if (!start) return;
    // A picture that follows a paragraph is dragged by where it is drawn; its y is only an offset from the block.
    const anchorAttr = target.dataset.anchorTop;
    const anchorTop = followsBlock(item) && anchorAttr !== undefined && Number.isFinite(Number(anchorAttr)) ? Number(anchorAttr) : null;
    if (anchorTop !== null) {
      if (boxRect.height <= 0) return;
      start.y = clampPct(((r.top - boxRect.top) / boxRect.height) * 100);
    }
    drag = {
      target,
      box,
      id,
      mode: nearX && nearY ? "resize" : "move",
      pinCorner: c ?? null,
      canSnap: canPinToCorner(item.kind),
      boxW: boxRect.width,
      boxH: boxRect.height,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: start.x,
      startTop: start.y,
      anchorTop,
      startWidth: item.width,
      widthPct,
      heightPct,
      snapped: c ?? null,
    };
    e.preventDefault();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  /** The new width for a pointer delta: growing from a right-hand pin means moving left. */
  function widthFor(d: NonNullable<typeof drag>, dx: number): number {
    const grows = d.pinCorner?.endsWith("right") ? -dx : dx;
    return clampPct(d.startWidth + grows, 5);
  }

  /** A followed picture stays inside its page; any other is held to the page's edges. */
  function dragTop(d: NonNullable<typeof drag>, dy: number): number {
    const raw = d.startTop + dy;
    return d.anchorTop === null ? clampPct(raw) : clampPct(clampTop(raw, d.heightPct));
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    // Selecting an item makes the editor layer and the preview pass redraw, which
    // replaces this element; keep driving the one that is on screen.
    const live = el?.querySelector<HTMLElement>(`[data-furniture-id="${drag.id}"]`);
    if (live) drag.target = live;
    const dx = ((e.clientX - drag.startClientX) / drag.boxW) * 100;
    const dy = ((e.clientY - drag.startClientY) / drag.boxH) * 100;
    const style = drag.target.style;
    if (drag.mode === "resize") {
      style.width = `${widthFor(drag, dx)}%`;
      return;
    }
    const left = clampPct(drag.startLeft + dx);
    const top = dragTop(drag, dy);
    drag.snapped = drag.canSnap ? snapCorner(left, top, drag.widthPct, drag.heightPct) : null;
    const c = drag.snapped;
    style.left = c?.endsWith("left") ? "0%" : c ? "" : `${left}%`;
    style.right = c?.endsWith("right") ? "0%" : "";
    style.top = c?.startsWith("top") ? "0%" : c ? "" : `${top}%`;
    style.bottom = c?.startsWith("bottom") ? "0%" : "";
    drag.target.classList.toggle("sc-furniture--snapped", c !== null);
    style.outlineStyle = c ? "dashed" : "solid";
  }

  function onPointerUp(e: PointerEvent) {
    window.removeEventListener("pointermove", onPointerMove);
    if (!drag) return;
    const d = drag;
    drag = null;
    const dx = ((e.clientX - d.startClientX) / d.boxW) * 100;
    const dy = ((e.clientY - d.startClientY) / d.boxH) * 100;
    const current = opts.items().find((i) => i.id === d.id);
    if (!current) return;
    let next: PageFurnitureItem;
    if (d.mode === "resize") {
      next = { ...current, width: widthFor(d, dx) };
    } else {
      const left = clampPct(d.startLeft + dx);
      const top = dragTop(d, dy);
      const corner = d.canSnap ? snapCorner(left, top, d.widthPct, d.heightPct) : null;
      next = { ...current, ...movePatch(left, top, corner, d.anchorTop) };
      if (!corner) delete next.corner;
    }
    if (next.corner) next = { ...next, anchor: pinnedAnchor(next, d.box) };
    opts.onChange(opts.items().map((i) => (i.id === d.id ? next : i)));
  }

  function attach(node: HTMLElement | null) {
    if (el === node) return;
    if (el) el.removeEventListener("pointerdown", onPointerDown);
    el = node;
    if (el) el.addEventListener("pointerdown", onPointerDown);
  }

  watch(opts.container, attach, { immediate: true });

  onBeforeUnmount(() => {
    if (el) el.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
  });
}
