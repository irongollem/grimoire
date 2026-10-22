import { computed, ref } from "vue";

export interface TreeViewportOptions {
  minScale?: number;
  maxScale?: number;
}

interface Pt {
  x: number;
  y: number;
}

/** Whether a pointerdown began on something that handles its own clicks (a card, a button). */
function onControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input") !== null;
}

/**
 * Pan and zoom for a canvas: drag the background, ctrl/cmd + wheel or pinch to zoom,
 * plain wheel to pan. The transform is `translate(x, y) scale(s)` on one stage, so
 * the same numbers drive buttons, wheel, touch and "Fit".
 */
export function useTreeViewport(opts: TreeViewportOptions = {}) {
  const minScale = opts.minScale ?? 0.3;
  const maxScale = opts.maxScale ?? 2;
  const x = ref(0);
  const y = ref(0);
  const scale = ref(1);
  const dragging = ref(false);

  const pointers = new Map<number, Pt>();
  let pinchDistance = 0;

  const clamp = (s: number): number => Math.min(maxScale, Math.max(minScale, s));

  /** Zoom by `factor`, keeping the point (cx, cy) in the container's coordinates fixed. */
  function zoomBy(factor: number, cx = 0, cy = 0): void {
    const next = clamp(scale.value * factor);
    const k = next / scale.value;
    x.value = cx - (cx - x.value) * k;
    y.value = cy - (cy - y.value) * k;
    scale.value = next;
  }

  /** Scale the content (cw x ch) to fit the container (w x h), centred. Never enlarges past 1. */
  function fit(w: number, h: number, cw: number, ch: number): void {
    if (w <= 0 || h <= 0 || cw <= 0 || ch <= 0) return;
    const s = clamp(Math.min(1, w / cw, h / ch));
    scale.value = s;
    x.value = (w - cw * s) / 2;
    y.value = Math.max(0, (h - ch * s) / 2);
  }

  function localPoint(e: { clientX: number; clientY: number }, el: Element): Pt {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent): void {
    if (onControl(e.target)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging.value = true;
    (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
    if (pointers.size === 2) pinchDistance = distance();
  }

  function distance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onPointerMove(e: PointerEvent): void {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size >= 2) {
      const d = distance();
      if (pinchDistance > 0 && d > 0 && e.currentTarget instanceof Element) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          const mid = localPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }, e.currentTarget);
          zoomBy(d / pinchDistance, mid.x, mid.y);
        }
      }
      pinchDistance = d;
      return;
    }
    x.value += next.x - prev.x;
    y.value += next.y - prev.y;
  }

  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    pinchDistance = 0;
    if (pointers.size === 0) dragging.value = false;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      if (!(e.currentTarget instanceof Element)) return;
      const p = localPoint(e, e.currentTarget);
      zoomBy(Math.exp(-e.deltaY * 0.01), p.x, p.y);
    } else {
      x.value -= e.deltaX;
      y.value -= e.deltaY;
    }
  }

  const stageStyle = computed(() => ({
    transform: `translate(${x.value}px, ${y.value}px) scale(${scale.value})`,
    transformOrigin: "0 0",
  }));

  return { x, y, scale, dragging, stageStyle, zoomBy, fit, onPointerDown, onPointerMove, onPointerUp, onWheel };
}
