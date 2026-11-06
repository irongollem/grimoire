import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from "vue";
import { useCanvasHand } from "@/composables/useCanvasHand";
import { resolveWheel } from "@/lib/canvasControls/wheel";
import { alphaBounds, type Size } from "@/lib/bookNook/liftGeometry";
import type { Rect } from "@/lib/bookNook/scene";
import { clampPan, fitScale, fitView, zoomAbout, type LiftView } from "@/lib/bookNook/liftView";

/**
 * The viewport and brush behind Lift's marking step: a picture you can zoom and pan, with a mask painted over it in
 * the picture's own pixels. The brush's size is in screen pixels, so zooming in makes it finer. It owns the pointers
 * and keys; the component owns the words and buttons.
 */

export const BRUSH_MIN = 8;
export const BRUSH_MAX = 160;
const BRUSH_STEP = 8;
const ZOOM_STEP = 1.25;
/** Opaque on purpose: the component shows the layer at half opacity, and antialiased edges stay soft. */
const PAINT = "#d4a017";

interface Stroke {
  erase: boolean;
  r: number;
  points: { x: number; y: number }[];
}

interface Options {
  viewport: Ref<HTMLElement | null>;
  canvas: Ref<HTMLCanvasElement | null>;
  natural: Ref<Size | null>;
  busy: () => boolean;
}

export function useLiftCanvas({ viewport, canvas, natural, busy }: Options) {
  const tool = ref<"brush" | "erase">("brush");
  const brushSize = ref(40);
  const view = ref<LiftView>({ scale: 1, tx: 0, ty: 0 });
  const box = ref<Size>({ width: 0, height: 0 });
  const strokeCount = ref(0);
  const bounds = shallowRef<Rect | null>(null);
  const cursor = ref<{ x: number; y: number } | null>(null);
  const altHeld = ref(false);
  const panning = ref(false);

  let strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let fitted = true;
  const pointers = new Map<number, { x: number; y: number }>();
  let paintId: number | null = null;
  let panId: number | null = null;
  let pinch: { mid: { x: number; y: number }; dist: number } | null = null;

  const hand = useCanvasHand({ onZoom: zoomTo, active: () => !busy() });

  const zoomPercent = computed(() => {
    const n = natural.value;
    return n && box.value.width ? Math.round((view.value.scale / fitScale(box.value, n)) * 100) : 100;
  });
  const radiusOnScreen = computed(() => brushSize.value / 2);

  // ---- view -------------------------------------------------------------
  function content(scale: number): Size {
    const n = natural.value;
    return { width: (n?.width ?? 0) * scale, height: (n?.height ?? 0) * scale };
  }
  function setView(next: LiftView) {
    const n = natural.value;
    view.value = clampPan(next, box.value, content(next.scale));
    fitted = !!n && view.value.scale <= fitScale(box.value, n) * 1.0001;
  }
  function fit() {
    if (!natural.value || !box.value.width) return;
    view.value = fitView(box.value, natural.value);
    fitted = true;
  }
  function zoomBy(factor: number, point = { x: box.value.width / 2, y: box.value.height / 2 }) {
    if (!natural.value) return;
    setView(zoomAbout(view.value, factor, point, box.value, natural.value));
  }
  function zoomTo(to: "in" | "out" | "fit" | "actual") {
    if (to === "fit") fit();
    else if (to === "actual") zoomBy(1 / view.value.scale);
    else zoomBy(to === "in" ? ZOOM_STEP : 1 / ZOOM_STEP);
  }
  function measure() {
    const el = viewport.value;
    if (!el) return;
    box.value = { width: el.clientWidth, height: el.clientHeight };
    if (fitted) fit();
    else setView(view.value);
  }
  /** Re-fits when a different picture arrives. */
  function reset() {
    strokes = [];
    current = null;
    strokeCount.value = 0;
    bounds.value = null;
    fit();
  }

  // ---- paint ------------------------------------------------------------
  function ctx2d(): CanvasRenderingContext2D | null {
    return canvas.value?.getContext("2d", { willReadFrequently: true }) ?? null;
  }
  function segment(c: CanvasRenderingContext2D, s: Stroke, from: { x: number; y: number }, to: { x: number; y: number }) {
    c.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    c.strokeStyle = PAINT;
    c.lineWidth = s.r * 2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
  }
  function replay() {
    const c = ctx2d();
    const el = canvas.value;
    if (!c || !el) return;
    c.clearRect(0, 0, el.width, el.height);
    for (const s of strokes) s.points.forEach((p, i) => segment(c, s, s.points[i - 1] ?? p, p));
  }
  function refreshBounds() {
    const c = ctx2d();
    const el = canvas.value;
    if (!c || !el || strokes.length === 0) {
      bounds.value = null;
      return;
    }
    bounds.value = alphaBounds(c.getImageData(0, 0, el.width, el.height).data, el.width, el.height);
  }
  function changed() {
    strokeCount.value = strokes.length;
    refreshBounds();
  }
  function undo() {
    if (busy() || strokes.length === 0) return;
    strokes.pop();
    replay();
    changed();
  }
  function clear() {
    if (busy()) return;
    strokes = [];
    replay();
    changed();
  }
  /** The painted layer at the picture's size, and its bounds, for the dialog to use. */
  function selection() {
    const c = ctx2d();
    const el = canvas.value;
    if (!c || !el || !bounds.value) return null;
    const { data } = c.getImageData(0, 0, el.width, el.height);
    return { brush: { data, width: el.width, height: el.height }, bounds: bounds.value };
  }

  // ---- pointers ---------------------------------------------------------
  function local(ev: { clientX: number; clientY: number }) {
    const r = viewport.value?.getBoundingClientRect();
    return { x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) };
  }
  function toNatural(p: { x: number; y: number }) {
    return { x: (p.x - view.value.tx) / view.value.scale, y: (p.y - view.value.ty) / view.value.scale };
  }
  function dropStroke() {
    if (!current) return;
    strokes = strokes.filter((s) => s !== current);
    current = null;
    paintId = null;
    replay();
    changed();
  }
  function onPointerDown(ev: PointerEvent) {
    if (busy() || !natural.value) return;
    const p = local(ev);
    pointers.set(ev.pointerId, p);
    viewport.value?.setPointerCapture?.(ev.pointerId);
    if (pointers.size === 2) {
      dropStroke();
      panId = null;
      panning.value = false;
      const [a, b] = [...pointers.values()];
      pinch = { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      return;
    }
    if (pointers.size > 2 || pinch) return;
    if (hand.isForcedPan(ev)) {
      panId = ev.pointerId;
      panning.value = true;
      return;
    }
    if (ev.button !== 0) return;
    current = { erase: ev.altKey || tool.value === "erase", r: radiusOnScreen.value / view.value.scale, points: [toNatural(p)] };
    paintId = ev.pointerId;
    strokes.push(current);
    const c = ctx2d();
    if (c) segment(c, current, current.points[0], current.points[0]);
  }
  function onPointerMove(ev: PointerEvent) {
    const p = local(ev);
    cursor.value = ev.pointerType === "touch" ? null : p;
    if (!pointers.has(ev.pointerId)) return;
    const before = pointers.get(ev.pointerId)!;
    pointers.set(ev.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (natural.value) {
        const zoomed = zoomAbout(view.value, dist / pinch.dist, pinch.mid, box.value, natural.value);
        setView({ ...zoomed, tx: zoomed.tx + mid.x - pinch.mid.x, ty: zoomed.ty + mid.y - pinch.mid.y });
      }
      pinch = { mid, dist };
      return;
    }
    if (panId === ev.pointerId) {
      setView({ ...view.value, tx: view.value.tx + p.x - before.x, ty: view.value.ty + p.y - before.y });
      return;
    }
    if (paintId === ev.pointerId && current) {
      const to = toNatural(p);
      const c = ctx2d();
      const last = current.points[current.points.length - 1];
      current.points.push(to);
      if (c) segment(c, current, last, to);
    }
  }
  function onPointerUp(ev: PointerEvent) {
    pointers.delete(ev.pointerId);
    if (ev.pointerType === "touch") cursor.value = null;
    if (panId === ev.pointerId) {
      panId = null;
      panning.value = false;
    }
    if (paintId === ev.pointerId && current) {
      current = null;
      paintId = null;
      changed();
    }
    if (pointers.size < 2) pinch = null;
  }
  function onPointerLeave() {
    cursor.value = null;
  }
  function onWheel(ev: WheelEvent) {
    ev.preventDefault();
    if (!natural.value) return;
    const intent = resolveWheel(ev);
    if (intent.kind === "zoom") zoomBy(intent.factor, local(ev));
    else setView({ ...view.value, tx: view.value.tx - intent.dx, ty: view.value.ty - intent.dy });
  }

  // ---- keys -------------------------------------------------------------
  function onKeyDown(ev: KeyboardEvent) {
    altHeld.value = ev.altKey;
    if (busy()) return;
    const typing = ev.target instanceof HTMLElement && (ev.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName));
    if (typing) return;
    if (ev.key === "[" || ev.key === "]") {
      ev.preventDefault();
      brushSize.value = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, brushSize.value + (ev.key === "]" ? BRUSH_STEP : -BRUSH_STEP)));
    } else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      undo();
    }
  }
  const onKeyUp = (ev: KeyboardEvent) => {
    altHeld.value = ev.altKey;
  };
  const onBlur = () => {
    altHeld.value = false;
  };

  let observer: ResizeObserver | null = null;
  onMounted(() => {
    viewport.value?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    if (typeof ResizeObserver !== "undefined" && viewport.value) {
      observer = new ResizeObserver(measure);
      observer.observe(viewport.value);
    }
    measure();
  });
  onBeforeUnmount(() => {
    viewport.value?.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    observer?.disconnect();
  });

  return {
    tool, brushSize, view, strokeCount, bounds, cursor, altHeld, panning, zoomPercent,
    spaceHeld: hand.spaceHeld,
    zoomTo, reset, undo, clear, selection, measure,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave },
  };
}
