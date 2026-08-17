import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyEdgeTreatmentToCtx,
  DEFAULT_EDGE_OPTIONS,
  DEFAULT_EDGE_TREATMENT,
  processImage,
  type EdgeOptions,
  type EdgeTreatmentOptions,
} from "@/lib/illuminate/edgeTreatment";

// ─── Fake canvas 2D context ───────────────────────────────────────────────
//
// happy-dom's canvas.getContext("2d") returns null, and applyEdgeTreatmentToCtx
// creates its own internal `document.createElement("canvas")` mask canvas that
// this test file has no handle to. So HTMLCanvasElement.prototype.getContext is
// stubbed globally to hand back a small fake context backed by a real pixel
// buffer (happy-dom does implement the ImageData constructor). getImageData /
// putImageData round-trip through that buffer like a real canvas would;
// fillRect only needs to understand the one fillStyle ("white") the module
// actually uses.

class FakeContext2D {
  width: number;
  height: number;
  buffer: Uint8ClampedArray;
  fillStyle = "";
  globalCompositeOperation = "source-over";
  drawImageCalls: unknown[][] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = new Uint8ClampedArray(width * height * 4);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const rgba: [number, number, number, number] = this.fillStyle === "white" ? [255, 255, 255, 255] : [0, 0, 0, 255];
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * this.width + xx) * 4;
        this.buffer[i] = rgba[0];
        this.buffer[i + 1] = rgba[1];
        this.buffer[i + 2] = rgba[2];
        this.buffer[i + 3] = rgba[3];
      }
    }
  }

  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    return new ImageData(new Uint8ClampedArray(this.buffer), w, h);
  }

  putImageData(data: ImageData, _x: number, _y: number): void {
    this.buffer.set(data.data);
  }

  drawImage(...args: unknown[]): void {
    this.drawImageCalls.push(args);
  }
}

function stubInternalCanvases(): FakeContext2D[] {
  const created: FakeContext2D[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const fake = new FakeContext2D(this.width, this.height);
    created.push(fake);
    return fake as unknown as RenderingContext;
  });
  return created;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// A minimal target ctx: applyEdgeTreatmentToCtx only needs drawImage and
// globalCompositeOperation on the *passed-in* ctx (the internal mask canvas
// is covered by stubInternalCanvases above).
function makeTargetCtx(): {
  ctx: CanvasRenderingContext2D;
  drawImageCalls: number;
  compositeOperationHistory: string[];
} {
  const compositeOperationHistory: string[] = [];
  let drawImageCalls = 0;
  let op = "source-over";
  const ctx = {
    get globalCompositeOperation() {
      return op;
    },
    set globalCompositeOperation(v: string) {
      op = v;
      compositeOperationHistory.push(v);
    },
    drawImage: () => {
      drawImageCalls += 1;
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    get drawImageCalls() {
      return drawImageCalls;
    },
    compositeOperationHistory,
  };
}

function edge(over: Partial<EdgeOptions>): EdgeOptions {
  return { ...DEFAULT_EDGE_OPTIONS, ...over };
}

function treatment(over: Partial<EdgeTreatmentOptions>): EdgeTreatmentOptions {
  return { ...DEFAULT_EDGE_TREATMENT, ...over };
}

describe("DEFAULT_EDGE_OPTIONS / DEFAULT_EDGE_TREATMENT", () => {
  it("ships disabled by default", () => {
    expect(DEFAULT_EDGE_OPTIONS.enabled).toBe(false);
  });

  it("gives all four sides the same defaults", () => {
    expect(DEFAULT_EDGE_TREATMENT.top).toEqual(DEFAULT_EDGE_OPTIONS);
    expect(DEFAULT_EDGE_TREATMENT.right).toEqual(DEFAULT_EDGE_OPTIONS);
    expect(DEFAULT_EDGE_TREATMENT.bottom).toEqual(DEFAULT_EDGE_OPTIONS);
    expect(DEFAULT_EDGE_TREATMENT.left).toEqual(DEFAULT_EDGE_OPTIONS);
  });
});

describe("applyEdgeTreatmentToCtx — no edges enabled", () => {
  it("never touches the target ctx", () => {
    stubInternalCanvases();
    const target = makeTargetCtx();
    applyEdgeTreatmentToCtx(target.ctx, 50, 50, DEFAULT_EDGE_TREATMENT);
    expect(target.drawImageCalls).toBe(0);
  });
});

describe("applyEdgeTreatmentToCtx — a single enabled edge", () => {
  it("composites exactly once via destination-in, and restores source-over afterwards", () => {
    stubInternalCanvases();
    const target = makeTargetCtx();
    applyEdgeTreatmentToCtx(
      target.ctx,
      50,
      50,
      treatment({ bottom: edge({ enabled: true, tearDepth: 0.1, fadeWidth: 0.1 }) }),
    );
    expect(target.drawImageCalls).toBe(1);
    expect(target.compositeOperationHistory).toEqual(["destination-in", "source-over"]);
  });

  it("leaves rows far from the enabled bottom edge fully opaque", () => {
    const created = stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    applyEdgeTreatmentToCtx(
      ctx,
      50,
      50,
      treatment({ bottom: edge({ enabled: true, tearDepth: 0.1, fadeWidth: 0.1 }) }),
    );
    const mask = created[0];
    // top row is nowhere near the bottom tear/fade zone
    const row = 0;
    for (let x = 0; x < 50; x++) {
      const i = (row * 50 + x) * 4 + 3;
      expect(mask.buffer[i]).toBe(255);
    }
  });

  it("fades the alpha somewhere in the bottom rows", () => {
    const created = stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    applyEdgeTreatmentToCtx(
      ctx,
      50,
      50,
      treatment({ bottom: edge({ enabled: true, tearDepth: 0.3, fadeWidth: 0.3, roughness: 0 }) }),
    );
    const mask = created[0];
    let sawReducedAlpha = false;
    for (let y = 30; y < 50 && !sawReducedAlpha; y++) {
      for (let x = 0; x < 50; x++) {
        const i = (y * 50 + x) * 4 + 3;
        if (mask.buffer[i] < 255) {
          sawReducedAlpha = true;
          break;
        }
      }
    }
    expect(sawReducedAlpha).toBe(true);
  });
});

describe("applyEdgeTreatmentToCtx — multiple enabled edges", () => {
  it("fades both a top-enabled and a bottom-enabled edge while the middle row stays intact", () => {
    const created = stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    applyEdgeTreatmentToCtx(
      ctx,
      50,
      50,
      treatment({
        top: edge({ enabled: true, tearDepth: 0.2, fadeWidth: 0.2, roughness: 0 }),
        bottom: edge({ enabled: true, tearDepth: 0.2, fadeWidth: 0.2, roughness: 0 }),
      }),
    );
    const mask = created[0];
    const alphaAt = (x: number, y: number): number => mask.buffer[(y * 50 + x) * 4 + 3];

    // middle row is far from both the top and bottom fade zones
    for (let x = 0; x < 50; x++) {
      expect(alphaAt(x, 25)).toBe(255);
    }

    const topRowFaded = Array.from({ length: 50 }, (_, x) => alphaAt(x, 0)).some((a) => a < 255);
    const bottomRowFaded = Array.from({ length: 50 }, (_, x) => alphaAt(x, 49)).some((a) => a < 255);
    expect(topRowFaded).toBe(true);
    expect(bottomRowFaded).toBe(true);
  });

  it("fades a right-enabled edge along columns, leaving the left column intact", () => {
    const created = stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    applyEdgeTreatmentToCtx(
      ctx,
      50,
      50,
      treatment({ right: edge({ enabled: true, tearDepth: 0.2, fadeWidth: 0.2, roughness: 0 }) }),
    );
    const mask = created[0];
    const alphaAt = (x: number, y: number): number => mask.buffer[(y * 50 + x) * 4 + 3];

    for (let y = 0; y < 50; y++) {
      expect(alphaAt(0, y)).toBe(255);
    }
    const rightColumnFaded = Array.from({ length: 50 }, (_, y) => alphaAt(49, y)).some((a) => a < 255);
    expect(rightColumnFaded).toBe(true);
  });
});

describe("applyEdgeTreatmentToCtx — degenerate pass counts", () => {
  it("does not throw for passes = 0 (clamped to a single pass internally)", () => {
    stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    expect(() =>
      applyEdgeTreatmentToCtx(
        ctx,
        20,
        20,
        treatment({ bottom: edge({ enabled: true, passes: 0, tearDepth: 0.2, fadeWidth: 0.2 }) }),
      ),
    ).not.toThrow();
  });

  it("does not throw for a fractional passes value", () => {
    stubInternalCanvases();
    const { ctx } = makeTargetCtx();
    expect(() =>
      applyEdgeTreatmentToCtx(
        ctx,
        20,
        20,
        treatment({ bottom: edge({ enabled: true, passes: 2.7, tearDepth: 0.2, fadeWidth: 0.2 }) }),
      ),
    ).not.toThrow();
  });
});

// ── processImage — pipeline order ───────────────────────────────────────────
//
// processImage's own docstring claims the order is
// "colour grading -> DOF blur -> vignette -> edge mask -> PNG blob" but the
// implementation actually runs grading -> dof -> TEXTURE -> VIGNETTE -> edge
// -> BRUSH MASK - texture and vignette are swapped relative to the docstring,
// and the docstring omits the texture and brush-mask steps entirely. This
// test pins the *real* call order so a future edit that silently reorders
// the pipeline gets caught, and documents the drift for anyone relying on
// the comment instead of the code.
describe("processImage — pipeline order", () => {
  it("invokes the optional stages in the actual implementation order", async () => {
    stubInternalCanvases();
    const calls: string[] = [];
    const image = { naturalWidth: 4, naturalHeight: 4 } as unknown as HTMLImageElement;

    const blob = await processImage(
      image,
      DEFAULT_EDGE_TREATMENT,
      () => calls.push("grading"),
      () => calls.push("dof"),
      () => calls.push("vignette"),
      () => calls.push("texture"),
      () => calls.push("brushMask"),
    );

    expect(calls).toEqual(["grading", "dof", "texture", "vignette", "brushMask"]);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("skips any stage whose callback is omitted", async () => {
    stubInternalCanvases();
    const image = { naturalWidth: 4, naturalHeight: 4 } as unknown as HTMLImageElement;
    await expect(processImage(image, DEFAULT_EDGE_TREATMENT)).resolves.toBeInstanceOf(Blob);
  });
});
