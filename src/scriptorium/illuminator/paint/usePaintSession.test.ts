// @vitest-environment happy-dom
import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIRM } from "./engine/pressure";
import type { PaintAssets } from "./engine/types";
import { PRESSURE_CURVE_KEY } from "./pressureStore";
import type { PaintLayer } from "./session/types";
import { DEFAULT_BACKGROUND, DEFAULT_INK } from "./session/paintSession";
import { usePaintSession } from "./usePaintSession";

const mocks = vi.hoisted(() => ({
  compositor: { setPaper: vi.fn(), setPicture: vi.fn(), syncLayers: vi.fn(), markDirty: vi.fn(), flush: vi.fn(), render: vi.fn(), readPixel: vi.fn(), dispose: vi.fn() },
}));
vi.mock("./render/compositor", () => ({ createCompositor: vi.fn(() => mocks.compositor) }));

const assets = { tip: () => undefined, grain: () => undefined, loadTip: vi.fn(), loadGrain: vi.fn(), preloadStock: async () => {}, addUserTipUrl: vi.fn(), addUserGrainUrl: vi.fn(), putTip: vi.fn(), putGrain: vi.fn() };
// The painter's own brushes are not under test here; see usePaintSession.userBrushes.test.ts.
const user = { brushes: ref([]), create: vi.fn(), importMany: vi.fn(), update: vi.fn(), rename: vi.fn(), remove: vi.fn() };
const redraw = vi.fn();

/** A composable made the way a component makes it: inside a scope that is stopped on unmount. */
function mountPaint(extra: { canMakeCanvas?: () => boolean; onCanvasRefused?: () => void } = {}) {
  const scope = effectScope();
  const paint = scope.run(() => usePaintSession({ redraw, assets: assets as typeof assets & PaintAssets, user: user as never, ...extra }));
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

describe("the plan's canvas limit", () => {
  async function startedWith(extra: Parameters<typeof mountPaint>[0], start: { hadCanvas?: boolean } = {}) {
    const m = mountPaint(extra);
    await m.paint.start({ size: { width: 128, height: 128 }, picture: document.createElement("canvas"), mask: null, tool: "brush", ...start });
    return m;
  }

  // Fails if a Free account that already holds its one painting can start a second: the limit would be a label.
  it("refuses the stroke that would make a picture's first layer, and says so", async () => {
    const refused = vi.fn();
    const { paint } = await startedWith({ canMakeCanvas: () => false, onCanvasRefused: refused });
    expect(paint.mayStroke()).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);
    paint.addLayer();
    expect(paint.layers.value.map((l) => l.id)).toEqual(["picture"]);
  });

  // Fails if a painting that is already saved is locked out of its own picture when the plan says no (a lapsed Pro
  // could never reopen what they made), or if the check is made again on every stroke once a layer exists.
  it("never asks for a picture that already has a painting, or once its first layer exists", async () => {
    const can = vi.fn(() => false);
    const existing = await startedWith({ canMakeCanvas: can }, { hadCanvas: true });
    expect(existing.paint.mayStroke()).toBe(true);
    // The plan says yes once, then no: the first layer was allowed, and a second stroke must not ask again.
    const fresh = await startedWith({ canMakeCanvas: vi.fn().mockReturnValueOnce(true).mockReturnValue(false) });
    fresh.paint.addLayer();
    expect(fresh.paint.mayStroke()).toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  // Fails if the eraser on the picture (which paints the mask, not a layer) is blocked by the canvas limit.
  it("lets the eraser work on the picture's mask when no canvas may be made", async () => {
    const { paint } = await startedWith({ canMakeCanvas: () => false });
    paint.setTool("eraser");
    expect(paint.mayStroke()).toBe(true);
  });

  // Fails if no plan check at all (the default) blocks painting.
  it("allows everything when no limit is given", async () => {
    const { paint } = await startedWith({});
    expect(paint.mayStroke()).toBe(true);
  });
});

describe("foreground and background colours", () => {
  // Fails on: the swap changing only one swatch, or the session still painting with the old foreground.
  it("swaps them and the brush paints with the new foreground", async () => {
    const { paint } = await started();
    paint.setColour({ r: 200, g: 0, b: 0 });
    paint.swapColours();
    expect(paint.colour.value).toEqual({ r: 255, g: 255, b: 255 });
    expect(paint.background.value).toEqual({ r: 200, g: 0, b: 0 });
    expect(paint.session.value?.state.colour).toEqual({ r: 255, g: 255, b: 255 });
  });

  // Fails on: reset leaving the background (or the foreground) as it was.
  it("resets to ink on paper", async () => {
    const { paint } = await started();
    paint.setColour({ r: 1, g: 1, b: 1 });
    paint.setBackground({ r: 2, g: 2, b: 2 });
    paint.resetColours();
    expect(paint.colour.value).toEqual(DEFAULT_INK);
    expect(paint.background.value).toEqual(DEFAULT_BACKGROUND);
  });

  // Fails on: the Colour panel always editing the foreground, whichever swatch was opened.
  it("edits the swatch that was opened", async () => {
    const { paint } = await started();
    paint.editing.value = "background";
    paint.setEditedColour({ r: 9, g: 9, b: 9 });
    expect(paint.background.value).toEqual({ r: 9, g: 9, b: 9 });
    expect(paint.colour.value).toEqual(DEFAULT_INK);
  });
});
