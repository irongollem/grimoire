// @vitest-environment happy-dom
import { effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIRM } from "./engine/pressure";
import type { PaintAssets } from "./engine/types";
import { PRESSURE_CURVE_KEY } from "./pressureStore";
import type { PaintLayer } from "./session/types";
import { usePaintSession } from "./usePaintSession";

const mocks = vi.hoisted(() => ({
  compositor: { setPaper: vi.fn(), setPicture: vi.fn(), syncLayers: vi.fn(), markDirty: vi.fn(), flush: vi.fn(), render: vi.fn(), readPixel: vi.fn(), dispose: vi.fn() },
}));
vi.mock("./render/compositor", () => ({ createCompositor: vi.fn(() => mocks.compositor) }));

const assets = { tip: () => undefined, grain: () => undefined, loadTip: vi.fn(), loadGrain: vi.fn(), preloadStock: async () => {} };
const redraw = vi.fn();

/** A composable made the way a component makes it: inside a scope that is stopped on unmount. */
function mountPaint() {
  const scope = effectScope();
  const paint = scope.run(() => usePaintSession({ redraw, assets: assets as typeof assets & PaintAssets }));
  if (!paint) throw new Error("no composable");
  return { paint, stop: () => scope.stop() };
}

async function started() {
  const m = mountPaint();
  await m.paint.start({ size: { width: 128, height: 128 }, picture: document.createElement("canvas"), mask: null, tool: "brush" });
  return m;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  mocks.compositor.syncLayers.mockClear();
  mocks.compositor.markDirty.mockClear();
});

describe("the device's pressure curve", () => {
  // Fails if a curve tuned in one workbench is not there the next time one opens, or does not reach the strokes.
  it("survives a remount and reaches the session", async () => {
    const first = mountPaint();
    first.paint.setCurve(FIRM);
    first.stop();
    expect(localStorage.getItem(PRESSURE_CURVE_KEY)).not.toBeNull();
    const again = await started();
    expect(again.paint.curve.value).toEqual(FIRM);
    expect(again.paint.session.value?.state.curve).toEqual(FIRM);
  });

  // Fails if a storage that refuses (a private window) stops painting from starting or the curve from changing.
  it("a storage that throws does not break painting", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { paint } = await started();
    expect(() => paint.setCurve(FIRM)).not.toThrow();
    expect(paint.session.value?.state.curve).toEqual(FIRM);
  });
});

describe("history and redraws", () => {
  // Fails if the opacity slider records an entry per input event (one drag would take dozens of undos).
  it("a drag of the opacity slider is one history entry, made on release", async () => {
    const { paint } = await started();
    paint.addLayer();
    const layer = paint.layers.value.find((l): l is PaintLayer => l.kind === "paint");
    if (!layer) throw new Error("no layer");
    for (const v of [0.8, 0.6, 0.4]) paint.setLayerProps(layer.id, { opacity: v });
    expect(layer.opacity).toBe(0.4);
    paint.commitOpacity(layer.id);
    expect(layer.opacity).toBe(0.4);
    paint.undo();
    expect(layer.opacity).toBe(1);
    paint.undo();
    expect(paint.layers.value.map((l) => l.id)).toEqual(["picture"]);
    expect(paint.canUndo.value).toBe(false);
  });

  // Fails if undo does not tell the compositor which layers to redraw, so the screen keeps showing undone paint.
  it("undo syncs the layer list and marks each returned layer dirty", async () => {
    const { paint } = await started();
    paint.addLayer();
    mocks.compositor.syncLayers.mockClear();
    paint.undo();
    expect(mocks.compositor.syncLayers).toHaveBeenCalled();
    expect(mocks.compositor.markDirty).toHaveBeenCalledWith(expect.stringMatching(/^layer-/));
  });

  // Fails if the layers panel is offered Delete on the picture, which the session refuses: it would do nothing.
  it("refuses to delete the picture", async () => {
    const { paint } = await started();
    paint.deleteLayer("picture");
    expect(paint.layers.value.map((l) => l.id)).toEqual(["picture"]);
  });
});
