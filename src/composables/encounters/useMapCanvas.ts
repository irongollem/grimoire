// Shared pan / zoom / image-fit state for the VTT map canvases. Every map
// view does the same things — load the image, track natural dims, pan with
// pointer, zoom with wheel anchored to the cursor, fit-to-host on resize —
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
  let lastClientX = 0;
  let lastClientY = 0;

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
    const factor = Math.exp(-e.deltaY * 0.001);
    const newScale = Math.min(maxScale, Math.max(minScale, scale.value * factor));
    if (newScale === scale.value) return;
    const ratio = newScale / scale.value;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    panX.value = cx - (cx - panX.value) * ratio;
    panY.value = cy - (cy - panY.value) * ratio;
    scale.value = newScale;
  }

  function startPan(e: PointerEvent) {
    if (!imageReady.value) return;
    panning.value = true;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function continuePan(e: PointerEvent) {
    if (!panning.value) return;
    panX.value += e.clientX - lastClientX;
    panY.value += e.clientY - lastClientY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
  }

  function endPan() {
    panning.value = false;
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
