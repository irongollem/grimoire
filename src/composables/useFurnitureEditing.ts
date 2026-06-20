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
import type { PageFurnitureItem } from "@/types/scriptorium.types";

export interface FurnitureEditingOptions {
  container: Ref<HTMLElement | null>;
  enabled: () => boolean;
  items: () => PageFurnitureItem[];
  onChange: (items: PageFurnitureItem[]) => void;
  onSelect: (id: string | null) => void;
}

const RESIZE_ZONE_PX = 16;
const clampPct = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v * 10) / 10));

export function useFurnitureEditing(opts: FurnitureEditingOptions) {
  let el: HTMLElement | null = null; // the container we listened on
  let drag: {
    target: HTMLElement;
    id: string;
    mode: "move" | "resize";
    boxW: number;
    boxH: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
  } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (!opts.enabled()) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-furniture-id]");
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
    const nearCorner = r.right - e.clientX < RESIZE_ZONE_PX && r.bottom - e.clientY < RESIZE_ZONE_PX;

    drag = {
      target,
      id,
      mode: nearCorner ? "resize" : "move",
      boxW: boxRect.width,
      boxH: boxRect.height,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
    };
    e.preventDefault();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = ((e.clientX - drag.startClientX) / drag.boxW) * 100;
    const dy = ((e.clientY - drag.startClientY) / drag.boxH) * 100;
    if (drag.mode === "resize") {
      drag.target.style.width = `${clampPct(drag.startWidth + dx, 5)}%`;
    } else {
      drag.target.style.left = `${clampPct(drag.startX + dx)}%`;
      drag.target.style.top = `${clampPct(drag.startY + dy)}%`;
    }
  }

  function onPointerUp(e: PointerEvent) {
    window.removeEventListener("pointermove", onPointerMove);
    if (!drag) return;
    const dx = ((e.clientX - drag.startClientX) / drag.boxW) * 100;
    const dy = ((e.clientY - drag.startClientY) / drag.boxH) * 100;
    const patch =
      drag.mode === "resize"
        ? { width: clampPct(drag.startWidth + dx, 5) }
        : { x: clampPct(drag.startX + dx), y: clampPct(drag.startY + dy) };
    const id = drag.id;
    drag = null;
    opts.onChange(opts.items().map((i) => (i.id === id ? { ...i, ...patch } : i)));
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
