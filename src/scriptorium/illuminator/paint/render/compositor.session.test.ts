import { describe, expect, it } from "vitest";
import type { PaintAssets, PenSample } from "../engine/types";
import { createPaintSession } from "../session/paintSession";
import type { PaintLayer } from "../session/types";
import { createCompositor, type Ctx, type PixelBuffer, type Surface } from "./compositor";

/** A recording 2D context: what was put on it, and what was drawn from where. */
class RecordingCtx implements Ctx {
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "low";
  puts: PixelBuffer[] = [];
  drawn: CanvasImageSource[] = [];
  setTransform() {}
  clearRect() {}
  fillRect() {}
  save() {}
  restore() {}
  createPattern() {
    return {} as CanvasPattern;
  }
  createImageData(w: number, h: number): PixelBuffer {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  // The compositor reuses its upload buffer, so the pixels are copied at the moment they are put.
  putImageData(img: PixelBuffer) {
    this.puts.push({ ...img, data: img.data.slice() });
  }
  getImageData(): PixelBuffer {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }
  drawImage(src: CanvasImageSource) {
    this.drawn.push(src);
  }
}

const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "mouse" });
const assets: PaintAssets = { tip: () => undefined, grain: () => undefined };

describe("a stroke made through the session reaches the screen", () => {
  // Fails if paint made by the session never gets uploaded to its layer's canvas, or the frame leaves that
  // canvas out: the stroke would exist in memory (and in Layers) but never show.
  it("uploads the stroke's pixels to the new layer's canvas and draws that canvas onto the target", () => {
    const surfaces: { drawable: object; ctx: RecordingCtx }[] = [];
    const createCanvas = (): Surface => {
      const s = { drawable: {} as ImageBitmap, ctx: new RecordingCtx() };
      surfaces.push(s);
      return s;
    };
    const session = createPaintSession({ width: 256, height: 256, paper: null, picture: true, assets });
    const comp = createCompositor({ width: 256, height: 256, picture: {} as CanvasImageSource, createCanvas });
    comp.syncLayers(session.state.doc.layers);

    // What the stage does on pointer down, then moves, then up.
    const began = session.beginStroke(sample(60, 60));
    if (!began) throw new Error("no stroke");
    comp.syncLayers(session.state.doc.layers);
    comp.markDirty(began.layerId, began.keys);
    comp.markDirty(began.layerId, session.addSamples([sample(100, 70), sample(140, 80)]));
    comp.markDirty(began.layerId, session.endStroke());

    const layer = session.state.doc.layers.find((l): l is PaintLayer => l.kind === "paint");
    if (!layer) throw new Error("the stroke made no layer");
    const target = new RecordingCtx();
    comp.render({ width: 256, height: 256, getContext: () => target }, { scale: 1, offsetX: 0, offsetY: 0 }, 1);

    // The paint layer's canvas is the last one made: after the picture's base, canvas and mask.
    const layerSurface = surfaces[3];
    if (!layerSurface) throw new Error("no canvas for the paint layer");
    const inked = layerSurface.ctx.puts.some((p) => p.data.some((v, i) => i % 4 === 3 && v > 0));
    expect(inked).toBe(true);
    expect(target.drawn).toContain(layerSurface.drawable);
  });
});
