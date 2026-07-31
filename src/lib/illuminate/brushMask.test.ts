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
// globally. This suite is only concerned with the controller's *bookkeeping*
// (hasStrokes, undo stack, applyToCtx call shape) - not with actual pixel
// output - so the fake context implements just enough surface to avoid
// throwing, and getImageData/putImageData work with fresh zeroed buffers
// rather than tracking real per-canvas pixel state.

class FakeContext2D {
  fillStyle = "";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  createRadialGradient(): { addColorStop: () => void } {
    return { addColorStop: () => {} };
  }
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  drawImage(): void {}
  clearRect(): void {}
  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    return new ImageData(Math.max(1, w), Math.max(1, h));
  }
  putImageData(): void {}
}

function stubCanvasContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => new FakeContext2D() as unknown as RenderingContext,
  );
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

const rect = { left: 0, top: 0 } as unknown as DOMRect;

function down(controller: BrushMaskController, state: BrushState = DEFAULT_BRUSH_STATE): void {
  controller.onPointerDown(
    new PointerEvent("pointerdown", { clientX: 10, clientY: 10, pressure: 0.5 }),
    rect,
    100,
    100,
    100,
    100,
    false,
    state,
  );
}

function move(controller: BrushMaskController, state: BrushState = DEFAULT_BRUSH_STATE): void {
  controller.onPointerMove(
    new PointerEvent("pointermove", { clientX: 20, clientY: 20, pressure: 0.5 }),
    rect,
    100,
    100,
    100,
    100,
    false,
    state,
  );
}

describe("DEFAULT_BRUSH_STATE", () => {
  it("starts as a round brush with sane, in-range values", () => {
    expect(DEFAULT_BRUSH_STATE.brushType).toBe("round");
    expect(DEFAULT_BRUSH_STATE.opacity).toBeGreaterThan(0);
    expect(DEFAULT_BRUSH_STATE.opacity).toBeLessThanOrEqual(1);
    expect(DEFAULT_BRUSH_STATE.hardness).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BRUSH_STATE.hardness).toBeLessThanOrEqual(1);
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

describe("createBrushMaskController — maskCanvas", () => {
  it("exposes a stable canvas reference", () => {
    const controller = makeController();
    expect(controller.maskCanvas).toBe(controller.maskCanvas);
    expect(controller.maskCanvas).toBeInstanceOf(HTMLCanvasElement);
  });
});
