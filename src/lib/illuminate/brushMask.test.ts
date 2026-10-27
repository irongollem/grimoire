// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createBrushMaskController,
  DEFAULT_BRUSH_STATE,
  type BrushState,
  type BrushMaskController,
} from "@/lib/illuminate/brushMask";

// ─── Fake canvas 2D context ───────────────────────────────────────────────
//
// happy-dom's canvas.getContext("2d") returns null, and createBrushMaskController
// creates over a dozen of its own internal canvases (the mask canvas plus 4
// pre-rendered variants for each of the 3 textured brush types) that this test
// file has no handle to, so HTMLCanvasElement.prototype.getContext is stubbed
// globally. The fake records what a round stamp leaves on the mask - where its
// circle is centred, how big, how opaque, and whether it erases or restores -
// so the tests read the brush's outcome rather than the order of canvas calls.
// The mask canvas is the first context the controller asks for.

interface Stamp {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  op: string;
}

class FakeGradient {
  alpha = 0;
  addColorStop(offset: number, color: string): void {
    if (offset === 0) this.alpha = Number(/,([\d.]+)\)$/.exec(color)?.[1]);
  }
}

class FakeContext2D {
  fillStyle: unknown = "";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  stamps: Stamp[] = [];
  private arcAt = { x: 0, y: 0, radius: 0 };
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(x: number, y: number, radius: number): void {
    this.arcAt = { x, y, radius };
  }
  fill(): void {
    const alpha = this.fillStyle instanceof FakeGradient ? this.fillStyle.alpha : 0;
    this.stamps.push({ ...this.arcAt, alpha, op: this.globalCompositeOperation });
  }
  createRadialGradient(): FakeGradient {
    return new FakeGradient();
  }
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  drawImage(): void {}
  clearRect(): void {}
  snapshots = 0;
  restored: number[] = [];
  /** Each snapshot is tagged with its sequence number so a test can tell which one undo restored. */
  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    const image = new ImageData(Math.max(1, w), Math.max(1, h));
    image.data[0] = ++this.snapshots;
    return image;
  }
  putImageData(image: ImageData): void {
    this.restored.push(image.data[0]);
  }
}

let contexts: FakeContext2D[] = [];

function stubCanvasContext(): void {
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = new FakeContext2D();
    contexts.push(ctx);
    return ctx as unknown as RenderingContext;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function makeController(): BrushMaskController {
  stubCanvasContext();
  const controller = createBrushMaskController();
  controller.resize(100, 100);
  return controller;
}

/** What the controller has stamped onto its mask canvas so far. */
const stamps = (): Stamp[] => contexts[0].stamps;

const rect = { left: 0, top: 0 } as unknown as DOMRect;

/** A round brush with no scatter, so every stamp lands exactly where the pointer is. */
const PLAIN: BrushState = { ...DEFAULT_BRUSH_STATE, brushType: "round", size: 30, spacing: 0.3, opacity: 0.8, hardness: 0.5, jitter: 0 };

function down(
  controller: BrushMaskController,
  state: BrushState = DEFAULT_BRUSH_STATE,
  at: { x: number; y: number; pressure?: number; erasing?: boolean; css?: number; canvas?: number } = { x: 10, y: 10 },
): void {
  controller.onPointerDown(
    new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, pressure: at.pressure ?? 0.5 }),
    rect,
    at.canvas ?? 100,
    at.canvas ?? 100,
    at.css ?? 100,
    at.css ?? 100,
    at.erasing ?? false,
    state,
  );
}

function move(
  controller: BrushMaskController,
  state: BrushState = DEFAULT_BRUSH_STATE,
  to: { x: number; y: number } = { x: 20, y: 20 },
): void {
  controller.onPointerMove(
    new PointerEvent("pointermove", { clientX: to.x, clientY: to.y, pressure: 0.5 }),
    rect,
    100,
    100,
    100,
    100,
    false,
    state,
  );
}

describe("stamping", () => {
  it("lands the stamp under the pointer, scaled from CSS pixels to canvas pixels", () => {
    const controller = makeController();
    // The canvas is drawn at twice its CSS size: a pointer at CSS (10, 15) is canvas (20, 30).
    down(controller, PLAIN, { x: 10, y: 15, css: 100, canvas: 200 });
    expect(stamps()).toHaveLength(1);
    expect(stamps()[0]).toMatchObject({ x: 20, y: 30 });
  });

  it("measures from the canvas's own top-left, not the page's", () => {
    const controller = makeController();
    const offset = { left: 40, top: 60 } as unknown as DOMRect;
    controller.onPointerDown(new PointerEvent("pointerdown", { clientX: 50, clientY: 70, pressure: 0.5 }), offset, 100, 100, 100, 100, false, PLAIN);
    expect(stamps()[0]).toMatchObject({ x: 10, y: 10 });
  });

  it("painting removes mask (destination-out) and erasing puts it back (source-over)", () => {
    const controller = makeController();
    down(controller, PLAIN, { x: 10, y: 10, erasing: false });
    down(controller, PLAIN, { x: 10, y: 10, erasing: true });
    expect(stamps().map((s) => s.op)).toEqual(["destination-out", "source-over"]);
  });

  it("scales a size-pressure brush between half and full size, never to nothing", () => {
    const controller = makeController();
    down(controller, PLAIN, { x: 10, y: 10, pressure: 1 });
    down(controller, PLAIN, { x: 10, y: 10, pressure: 0.5 });
    down(controller, PLAIN, { x: 10, y: 10, pressure: 0 });
    // size 30: full pressure 30, half 22.5, a pen that reports 0 is held at 0.01 -> 15.15.
    expect(stamps().map((s) => s.radius)).toEqual([30, 22.5, 15.15]);
    expect(stamps().every((s) => s.alpha === 0.8)).toBe(true);
  });

  it("scales an opacity-pressure brush's strength with pressure and keeps its size", () => {
    const controller = makeController();
    const state: BrushState = { ...PLAIN, pressureTarget: "opacity" };
    down(controller, state, { x: 10, y: 10, pressure: 0.5 });
    expect(stamps()[0].radius).toBe(30);
    expect(stamps()[0].alpha).toBeCloseTo(0.4, 9);
  });

  it("never stamps stronger than fully opaque", () => {
    const controller = makeController();
    down(controller, { ...PLAIN, opacity: 3 }, { x: 10, y: 10 });
    expect(stamps()[0].alpha).toBe(1);
  });

  it("scatters a jittery brush into several fainter stamps", () => {
    const controller = makeController();
    down(controller, { ...PLAIN, jitter: 1 }, { x: 10, y: 10 });
    // jitter 1 -> ceil(1 + 2) = 3 sub-stamps, each at alpha / sqrt(3) so the cluster is no darker than one stamp.
    expect(stamps()).toHaveLength(3);
    for (const s of stamps()) expect(s.alpha).toBeCloseTo(0.8 / Math.sqrt(3), 9);
  });

  it("drops a stamp every spacing-worth of travel, wherever the pointer events happen to fall", () => {
    const controller = makeController();
    // size 30 * spacing 0.3 = a stamp every 9px. The first goes down at the press (10,10).
    down(controller, PLAIN, { x: 10, y: 10 });
    // 6px moves: nothing yet at 16, then the 9px mark is crossed on the second move, at y = 19.
    move(controller, PLAIN, { x: 10, y: 16 });
    expect(stamps()).toHaveLength(1);
    move(controller, PLAIN, { x: 10, y: 22 });
    expect(stamps().map((s) => s.y)).toEqual([10, 19]);
    // One long move from there stamps at each further 9px mark it crosses (28, 37).
    move(controller, PLAIN, { x: 10, y: 40 });
    expect(stamps().map((s) => s.y)).toEqual([10, 19, 28, 37]);
  });

  it("paints a slow drag too: three pixels of travel at one pixel of spacing is three stamps", () => {
    const controller = makeController();
    const fine: BrushState = { ...PLAIN, size: 4, spacing: 0.25 };
    down(controller, fine, { x: 10, y: 10 });
    move(controller, fine, { x: 13, y: 10 });
    expect(stamps().map((s) => s.x)).toEqual([10, 11, 12, 13]);
  });

  it("ignores a jitter of the pointer under half a pixel", () => {
    const controller = makeController();
    down(controller, PLAIN, { x: 10, y: 10 });
    move(controller, PLAIN, { x: 10.2, y: 10.2 });
    expect(stamps()).toHaveLength(1);
  });

  it("stops painting after the pointer is lifted", () => {
    const controller = makeController();
    down(controller, PLAIN, { x: 10, y: 10 });
    controller.onPointerUp();
    move(controller, PLAIN, { x: 10, y: 60 });
    expect(stamps()).toHaveLength(1);
  });

  it("gives even a fully hard brush an edge half a pixel wide, so the gradient is never zero-width", () => {
    const controller = makeController();
    // Hardness 1 is held to 0.999: the solid core is 29.97px and the stamp reaches half a pixel beyond it.
    down(controller, { ...PLAIN, hardness: 1 }, { x: 10, y: 10, pressure: 1 });
    expect(stamps()[0].radius).toBeCloseTo(30.47, 9);
  });
});

describe("createBrushMaskController — hasStrokes", () => {
  it("starts with no strokes", () => {
    const controller = makeController();
    expect(controller.hasStrokes).toBe(false);
  });

  it("ignores a pointer move that never had a preceding pointer down", () => {
    const controller = makeController();
    move(controller);
    expect(controller.hasStrokes).toBe(false);
  });

  it("marks strokes present once a pointer down/move pair has run", () => {
    const controller = makeController();
    down(controller);
    move(controller);
    expect(controller.hasStrokes).toBe(true);
  });

  it("does not clear hasStrokes on pointer up", () => {
    const controller = makeController();
    down(controller);
    controller.onPointerUp();
    expect(controller.hasStrokes).toBe(true);
  });
});

describe("createBrushMaskController — resize", () => {
  it("resets hasStrokes and the undo stack", () => {
    const controller = makeController();
    down(controller);
    expect(controller.hasStrokes).toBe(true);

    controller.resize(50, 50);
    expect(controller.hasStrokes).toBe(false);
    expect(controller.undo()).toBe(false);
  });
});

describe("createBrushMaskController — clear", () => {
  it("resets hasStrokes and the undo stack", () => {
    const controller = makeController();
    down(controller);
    down(controller);
    expect(controller.hasStrokes).toBe(true);

    controller.clear();
    expect(controller.hasStrokes).toBe(false);
    expect(controller.undo()).toBe(false);
  });
});

describe("createBrushMaskController — undo", () => {
  it("returns false when nothing has been drawn", () => {
    const controller = makeController();
    expect(controller.undo()).toBe(false);
  });

  it("pushes one undo entry per pointer-down stroke, and exhausts back to false", () => {
    const controller = makeController();
    down(controller); // stroke 1
    down(controller); // stroke 2
    expect(controller.undo()).toBe(true); // undoes stroke 2
    expect(controller.undo()).toBe(true); // undoes stroke 1
    expect(controller.undo()).toBe(false); // nothing left
  });

  // The stack holds the mask as it was *before* each stroke, so undoing the
  // only stroke restores a pristine mask and hasStrokes must go back to false.
  // It previously stayed true, which read an empty mask as dirty to any UI
  // gating an Apply/Clear button on it.
  it("remembers only the last 20 strokes", () => {
    const controller = makeController();
    for (let i = 0; i < 25; i++) down(controller);
    let undone = 0;
    while (controller.undo()) undone++;
    expect(undone).toBe(20);
    // Undo steps back from the newest stroke (the 25th, whose snapshot is 25th taken) to the oldest it kept (the 6th).
    expect(contexts[0].restored[0]).toBe(25);
    expect(contexts[0].restored.at(-1)).toBe(6);
  });

  it("clears hasStrokes after undoing back to a blank mask", () => {
    const controller = makeController();
    down(controller);
    expect(controller.hasStrokes).toBe(true);

    expect(controller.undo()).toBe(true);
    expect(controller.hasStrokes).toBe(false);
  });

  it("keeps hasStrokes true while undone-to state still has strokes", () => {
    const controller = makeController();
    down(controller); // stroke 1
    down(controller); // stroke 2

    expect(controller.undo()).toBe(true); // back to just stroke 1
    expect(controller.hasStrokes).toBe(true);

    expect(controller.undo()).toBe(true); // back to blank
    expect(controller.hasStrokes).toBe(false);
  });
});

describe("createBrushMaskController — applyToCtx", () => {
  function makeTargetCtx(initialOp = "source-over"): {
    ctx: CanvasRenderingContext2D;
    drawImageCalls: number;
    opHistory: string[];
  } {
    const opHistory: string[] = [];
    let drawImageCalls = 0;
    let op = initialOp;
    const ctx = {
      get globalCompositeOperation() {
        return op;
      },
      set globalCompositeOperation(v: string) {
        op = v;
        opHistory.push(v);
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
      opHistory,
    };
  }

  it("does nothing while there are no strokes", () => {
    const controller = makeController();
    const target = makeTargetCtx();
    controller.applyToCtx(target.ctx, 100, 100);
    expect(target.drawImageCalls).toBe(0);
  });

  it("composites once via destination-out and restores the caller's composite operation", () => {
    const controller = makeController();
    down(controller);
    const target = makeTargetCtx("multiply");
    controller.applyToCtx(target.ctx, 100, 100);
    expect(target.drawImageCalls).toBe(1);
    expect(target.opHistory).toEqual(["destination-out", "multiply"]);
  });
});
