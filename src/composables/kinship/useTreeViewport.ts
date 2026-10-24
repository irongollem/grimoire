import { computed, ref } from "vue";
import { resolveWheel } from "@/lib/canvasControls/wheel";

export interface TreeViewportOptions {
  minScale?: number;
  maxScale?: number;
  /**
   * A press that pans wherever it lands, even over a card or button: the middle
   * button, or the left one while Space is held (see useCanvasHand.isForcedPan).
   */
  forcePan?: (ev: { button: number }) => boolean;
}

interface Pt {
  x: number;
  y: number;
}

/** How far a finger must travel, in px, before a press on a card becomes a pan. */
const TOUCH_PAN_SLOP = 6;

/** Whether a pointerdown began on something that handles its own clicks (a card, a button). */
function onControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input") !== null;
}

/**
 * Pan and zoom for a canvas: drag the background, ctrl/cmd/alt + wheel or pinch to zoom.
 * A plain wheel is left alone so the page scrolls (the tree sits inside a scrolling page). The transform is `translate(x, y) scale(s)` on one stage, so
 * the same numbers drive buttons, wheel, touch and "Fit".
 */
export function useTreeViewport(opts: TreeViewportOptions = {}) {
  const minScale = opts.minScale ?? 0.3;
  const maxScale = opts.maxScale ?? 2;
  const x = ref(0);
  const y = ref(0);
  const scale = ref(1);
  const dragging = ref(false);

  // Set while a forced (Space or middle) press is down, so the click that ends it does not select the card underneath.
  let swallowClick = false;
  const pointers = new Map<number, Pt>();
  let pinchDistance = 0;
  // Touch presses that began on a card: tracked, but not captured until they move past the slop, so a tap still clicks.
  const pending = new Map<number, { pt: Pt; el: Element | null }>();

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

  /** Scale to `s` and put the point (px, py) of the content (w x h of the container) in the middle of the container. */
  function centreOn(px: number, py: number, w: number, h: number, s: number): void {
    if (w <= 0 || h <= 0) return;
    const next = clamp(s);
    scale.value = next;
    x.value = w / 2 - px * next;
    y.value = h / 2 - py * next;
  }

  function localPoint(e: { clientX: number; clientY: number }, el: Element): Pt {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent): void {
    const forced = opts.forcePan?.(e) ?? false;
    const touchOnControl = !forced && e.pointerType === "touch" && onControl(e.target);
    if (touchOnControl) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pending.set(e.pointerId, { pt: { x: e.clientX, y: e.clientY }, el: e.currentTarget as Element | null });
      return;
    }
    if (!forced && onControl(e.target)) return;
    if (forced) {
      // A middle press would start the browser's autoscroll, and a Space-drag over a card must not become its click.
      e.preventDefault();
      swallowClick = e.button === 0;
    }
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
    const held = pending.get(e.pointerId);
    if (held) {
      if (Math.hypot(next.x - held.pt.x, next.y - held.pt.y) <= TOUCH_PAN_SLOP) return;
      // Past the slop this is a pan, not a tap: take the finger and drop the click that would follow.
      pending.delete(e.pointerId);
      held.el?.setPointerCapture?.(e.pointerId);
      dragging.value = true;
      swallowClick = true;
      if (pointers.size === 2) pinchDistance = distance();
      // Pan from where the finger started, so the first move does not lose the slop.
      if (pointers.size === 1) {
        x.value += next.x - held.pt.x;
        y.value += next.y - held.pt.y;
      }
      return;
    }
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
    pending.delete(e.pointerId);
    pinchDistance = 0;
    if (pointers.size === 0) dragging.value = false;
    // The click that follows a Space-drag fires right after pointerup; clear the flag once it has passed.
    if (swallowClick) setTimeout(() => (swallowClick = false), 0);
  }

  /** Capture-phase click handler: drops the click that ends a Space-drag. */
  function onClickCapture(e: MouseEvent): void {
    if (!swallowClick) return;
    e.stopPropagation();
    e.preventDefault();
  }

  // A plain wheel belongs to the page, which keeps scrolling over the tree; only ctrl/cmd/alt + wheel and a pinch zoom.
  function onWheel(e: WheelEvent): void {
    const intent = resolveWheel(e);
    if (intent.kind !== "zoom") return;
    e.preventDefault();
    if (!(e.currentTarget instanceof Element)) return;
    const p = localPoint(e, e.currentTarget);
    zoomBy(intent.factor, p.x, p.y);
  }

  const stageStyle = computed(() => ({
    transform: `translate(${x.value}px, ${y.value}px) scale(${scale.value})`,
    transformOrigin: "0 0",
  }));

  return { x, y, scale, dragging, stageStyle, zoomBy, fit, centreOn, onPointerDown, onPointerMove, onPointerUp, onClickCapture, onWheel };
}
