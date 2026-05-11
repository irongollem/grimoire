/*
 * Zoom + pinch/wheel gestures + page transform styles for the Scriptorium
 * preview.
 *
 * `fit` mode tracks the container width via ResizeObserver so pages always
 * scale to fill the available space (≤ 100%). `manual` mode locks zoom to a
 * user-picked step. Trackpad/iOS pinch (wheel + ctrlKey) and two-finger touch
 * pinch both flip into manual mode while preserving the visible scale.
 *
 * Returns reactive zoom state plus the two style computeds the template needs:
 *   pageWrapperStyle — wrapper div with the scaled bounding box dimensions
 *   pageInnerStyle   — inner page with `transform: scale()` for visual zoom
 */

import { ref, computed, onMounted, onUnmounted, type Ref } from "vue";
import {
  EDITOR_PAGE_DIMENSIONS_PX,
  ZOOM_STEPS,
  ZOOM_MIN,
  ZOOM_MAX,
} from "@/lib/scriptorium/editorConstants";
import type { ScriptoriumPageSize } from "@/types/scriptorium.types";

export function useScriptoriumZoom(
  pageSize: Ref<ScriptoriumPageSize>,
  previewContainerRef: Ref<HTMLElement | null>,
) {
  const zoomMode = ref<"fit" | "manual">("fit");
  const manualZoom = ref(1.0);
  const previewContainerWidth = ref(0);

  const autoZoom = computed(() => {
    const { w } = EDITOR_PAGE_DIMENSIONS_PX[pageSize.value];
    const available =
      previewContainerWidth.value > 0 ? previewContainerWidth.value - 32 : w;
    return Math.min(1, available / w);
  });

  const effectiveZoom = computed(() =>
    zoomMode.value === "fit" ? autoZoom.value : manualZoom.value,
  );

  const zoomLabel = computed(() => `${Math.round(effectiveZoom.value * 100)}%`);

  function zoomIn() {
    const cur = effectiveZoom.value;
    const next = ZOOM_STEPS.find((s) => s > cur + 0.01);
    if (next !== undefined) {
      manualZoom.value = next;
      zoomMode.value = "manual";
    }
  }
  function zoomOut() {
    const cur = effectiveZoom.value;
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.01);
    if (prev !== undefined) {
      manualZoom.value = prev;
      zoomMode.value = "manual";
    }
  }
  function zoomFit() {
    zoomMode.value = "fit";
  }

  // Wrapper gives the scroll container the correct zoomed layout dimensions.
  // Inner page uses transform:scale — layout-neutral, just visual scaling.
  // (CSS `zoom` runs after flex layout and doesn't update scroll dimensions.)
  const pageWrapperStyle = computed(() => {
    const { w, h } = EDITOR_PAGE_DIMENSIONS_PX[pageSize.value];
    const z = effectiveZoom.value;
    return {
      width: `${Math.round(w * z)}px`,
      height: `${Math.round(h * z)}px`,
      flexShrink: "0",
      margin: "0 auto",
    };
  });

  const pageInnerStyle = computed(() => {
    const { w, h } = EDITOR_PAGE_DIMENSIONS_PX[pageSize.value];
    const z = effectiveZoom.value;
    return {
      width: `${w}px`,
      height: `${h}px`,
      transform: `scale(${z})`,
      transformOrigin: "top left",
    };
  });

  // ── Gesture wiring ─────────────────────────────────────────────────────────
  let resizeObserver: ResizeObserver | null = null;
  let previewEl: HTMLElement | null = null;
  let wheelHandler: ((e: WheelEvent) => void) | null = null;
  let pinchStartHandler: ((e: TouchEvent) => void) | null = null;
  let pinchMoveHandler: ((e: TouchEvent) => void) | null = null;
  let pinchStartDist = 0;
  let pinchStartZoom = 0;

  function pinchDist(t: TouchList): number {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  onMounted(() => {
    if (!previewContainerRef.value) return;
    previewEl = previewContainerRef.value;

    resizeObserver = new ResizeObserver((entries) => {
      previewContainerWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(previewEl);

    // Block swipe-to-back/forward at horizontal scroll boundaries — overscroll-behavior
    // doesn't work when there's no overflow, so a non-passive wheel listener
    // intercepts purely horizontal swipes manually. Also handles trackpad/iOS
    // pinch (signaled by ctrlKey on the wheel event) for zoom.
    wheelHandler = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = 1 - e.deltaY * 0.008;
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, effectiveZoom.value * factor));
        manualZoom.value = newZoom;
        zoomMode.value = "manual";
        return;
      }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      previewEl!.scrollLeft += e.deltaX;
    };
    previewEl.addEventListener("wheel", wheelHandler, { passive: false });

    pinchStartHandler = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchStartDist = pinchDist(e.touches);
      pinchStartZoom = effectiveZoom.value;
    };
    pinchMoveHandler = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const d = pinchDist(e.touches);
      if (pinchStartDist === 0) return;
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartZoom * (d / pinchStartDist)));
      manualZoom.value = clamped;
      zoomMode.value = "manual";
    };
    previewEl.addEventListener("touchstart", pinchStartHandler, { passive: true });
    previewEl.addEventListener("touchmove", pinchMoveHandler, { passive: false });
  });

  onUnmounted(() => {
    if (resizeObserver && previewEl) resizeObserver.unobserve(previewEl);
    if (previewEl) {
      if (wheelHandler) previewEl.removeEventListener("wheel", wheelHandler);
      if (pinchStartHandler) previewEl.removeEventListener("touchstart", pinchStartHandler);
      if (pinchMoveHandler) previewEl.removeEventListener("touchmove", pinchMoveHandler);
    }
    resizeObserver = null;
    previewEl = null;
    wheelHandler = null;
    pinchStartHandler = null;
    pinchMoveHandler = null;
  });

  return {
    zoomMode,
    manualZoom,
    effectiveZoom,
    zoomLabel,
    zoomIn,
    zoomOut,
    zoomFit,
    pageWrapperStyle,
    pageInnerStyle,
  };
}
