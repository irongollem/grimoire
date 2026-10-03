// Shared pan / zoom / image-fit state for the VTT map canvases. Every map
// view does the same things — load the image, track natural dims, pan with
// pointer, zoom with wheel anchored to the cursor or with a two-finger pinch
// anchored between the fingers, fit-to-host on resize —
// so this composable centralises the state and the handlers. Views still
// own their own DOM (the host element + the <image> + their layered child
// components) and their own tool-specific behaviour (brush vs pan, etc.).

import { onMounted, onUnmounted, ref, watch } from "vue";

export interface MapCanvasOptions {
  /** Min / max zoom multipliers. Defaults: 0.1× / 8×. */
  minScale?: number;
  maxScale?: number;
}

export function useMapCanvas(opts: MapCanvasOptions = {}) {
  const minScale = opts.minScale ?? 0.1;
  const maxScale = opts.maxScale ?? 8;

  const canvasHost = ref<HTMLElement | null>(null);
  const hostW = ref(0);
  const hostH = ref(0);
  const imageNaturalW = ref(0);
  const imageNaturalH = ref(0);
  const imageReady = ref(false);
  const panX = ref(0);
  const panY = ref(0);
  const scale = ref(1);

  const panning = ref(false);

  // Every pointer currently down on the host. One pans; two pinch. They are
  // tracked per id because a touch screen reports each finger as its own
  // pointer: with a single shared "last position", two fingers took turns
  // overwriting it and every move panned the map by the distance between them,
  // so a pinch threw the map back and forth instead of zooming it.
  const pointers = new Map<number, { x: number; y: number }>();
  // Where the gesture stood after the last event: the point midway between the
  // fingers, and how far apart they were (0 with one pointer).
  let lastCentre = { x: 0, y: 0 };
  let lastSpread = 0;

  function gesture(): { centre: { x: number; y: number }; spread: number } {
    const [a, b] = [...pointers.values()];
    if (!b) return { centre: { x: a.x, y: a.y }, spread: 0 };
    return {
      centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      spread: Math.hypot(b.x - a.x, b.y - a.y),
    };
  }

  /** Start measuring from where the fingers are now — on every finger down or
   *  up, so the change in their number is not itself read as a movement. */
  function rebaseGesture() {
    if (pointers.size === 0) return;
    const g = gesture();
    lastCentre = g.centre;
    lastSpread = g.spread;
  }

  /** Scale by `factor` about a point in host coordinates, which stays put. */
  function zoomAbout(cx: number, cy: number, factor: number) {
    const newScale = Math.min(maxScale, Math.max(minScale, scale.value * factor));
    if (newScale === scale.value) return;
    const ratio = newScale / scale.value;
    panX.value = cx - (cx - panX.value) * ratio;
    panY.value = cy - (cy - panY.value) * ratio;
    scale.value = newScale;
  }

  function onImageLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    imageNaturalW.value = img.naturalWidth;
    imageNaturalH.value = img.naturalHeight;
    imageReady.value = true;
    fitImageToHost();
  }

  function measureHost() {
    if (!canvasHost.value) return;
    const rect = canvasHost.value.getBoundingClientRect();
    hostW.value = rect.width;
    hostH.value = rect.height;
  }

  function fitImageToHost() {
    if (!imageReady.value || !hostW.value || !hostH.value) return;
    const fit = Math.min(hostW.value / imageNaturalW.value, hostH.value / imageNaturalH.value);
    scale.value = fit;
    panX.value = (hostW.value - imageNaturalW.value * fit) / 2;
    panY.value = (hostH.value - imageNaturalH.value * fit) / 2;
  }

  function resetView() {
    fitImageToHost();
  }

  /** Cursor-anchored wheel zoom — the cell under the cursor stays put. */
  function onWheel(e: WheelEvent) {
    if (!imageReady.value) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomAbout(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.001));
  }

  function startPan(e: PointerEvent) {
    if (!imageReady.value) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    panning.value = true;
    rebaseGesture();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  /** One pointer drags the map; two drag it by the point between them and zoom
   *  it by how far they spread, about that same point. */
  function continuePan(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { centre, spread } = gesture();
    panX.value += centre.x - lastCentre.x;
    panY.value += centre.y - lastCentre.y;
    if (spread > 0 && lastSpread > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      zoomAbout(centre.x - rect.left, centre.y - rect.top, spread / lastSpread);
    }
    lastCentre = centre;
    lastSpread = spread;
  }

  /** Bind to pointerup, pointercancel and pointerleave. A cancelled touch that
   *  is never removed here stays "down", and the next single-finger drag is
   *  then read as half of a pinch. */
  function endPan(e: PointerEvent) {
    pointers.delete(e.pointerId);
    panning.value = pointers.size > 0;
    rebaseGesture();
  }

  let resizeObserver: ResizeObserver | null = null;
  onMounted(() => {
    measureHost();
    if (canvasHost.value) {
      resizeObserver = new ResizeObserver(() => {
        measureHost();
        if (imageReady.value && panX.value === 0 && panY.value === 0) {
          fitImageToHost();
        }
      });
      resizeObserver.observe(canvasHost.value);
    }
  });
  onUnmounted(() => {
    resizeObserver?.disconnect();
  });

  watch(imageReady, (ready) => {
    if (ready) fitImageToHost();
  });

  return {
    canvasHost,
    hostW,
    hostH,
    imageNaturalW,
    imageNaturalH,
    imageReady,
    panX,
    panY,
    scale,
    onImageLoad,
    onWheel,
    startPan,
    continuePan,
    endPan,
    fitImageToHost,
    resetView,
  };
}
