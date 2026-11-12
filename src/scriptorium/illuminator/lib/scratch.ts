/**
 * A scratch canvas that works on the main thread (a DOM canvas) and inside a
 * Web Worker (an OffscreenCanvas), so one effect pipeline serves the live
 * preview, the full-resolution bake in a worker and the print redraw.
 */
export type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeScratchCanvas(w: number, h: number): ScratchCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  return new OffscreenCanvas(w, h);
}

/** A 2D context of a scratch canvas, typed as the DOM one every effect takes. */
export function scratchContext(canvas: ScratchCanvas): CanvasRenderingContext2D {
  // OffscreenCanvasRenderingContext2D draws and reads pixels exactly like the
  // DOM one; the effects use only that shared surface.
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas is unavailable.");
  return ctx;
}
