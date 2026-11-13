// @vitest-environment happy-dom
import { effectScope, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import type { UserBrush } from "./brushes/userBrushes";
import type { BrushPreset, PaintAssets } from "./engine/types";
import { usePaintSession } from "./usePaintSession";

const mocks = vi.hoisted(() => ({
  compositor: { setPaper: vi.fn(), setPicture: vi.fn(), syncLayers: vi.fn(), markDirty: vi.fn(), flush: vi.fn(), render: vi.fn(), readPixel: vi.fn(), dispose: vi.fn() },
  confirm: vi.fn(),
}));
vi.mock("./render/compositor", () => ({ createCompositor: vi.fn(() => mocks.compositor) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));

const assets = {
  tip: () => undefined, grain: () => undefined, loadTip: vi.fn(), loadGrain: vi.fn(),
  preloadStock: async () => {}, addUserTipUrl: vi.fn(), addUserGrainUrl: vi.fn(), putTip: vi.fn(), putGrain: vi.fn(),
};

const mine: BrushPreset = { ...STOCK_BRUSHES[0], id: "row-1", name: "Mine", group: "yours" };
function userApi() {
  return {
    brushes: ref<UserBrush[]>([{ preset: mine, source: "made", setName: null }]),
    create: vi.fn(async (item: { preset: BrushPreset }) => ({ ...item.preset, id: "row-2", group: "yours" as const })),
    importMany: vi.fn(),
    update: vi.fn<(arg: unknown) => Promise<undefined>>(async () => undefined),
    rename: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

async function started() {
  const user = userApi();
  const scope = effectScope();
  const paint = scope.run(() => usePaintSession({ redraw: vi.fn(), assets: assets as unknown as PaintAssets & typeof assets, user: user as never }));
  if (!paint) throw new Error("no composable");
  await paint.start({ size: { width: 64, height: 64 }, picture: document.createElement("canvas"), mask: null, tool: "brush" });
  return { paint, user, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.confirm.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the session's wiring of Yours", () => {
  it("shows Yours after the stock brushes, and arms one the painter picks", async () => {
    // Fails on: the painter's brushes missing from the library or not armable.
    const { paint } = await started();
    expect(paint.library.value.at(-1)?.id).toBe("row-1");
    paint.selectBrush("row-1");
    expect(paint.brush.value?.id).toBe("row-1");
  });

  it("saves a tuned Yours brush from the settings panel, the options bar and the mode menu, but not a stock one", async () => {
    // Fails on: one of the three edit paths bypassing autosave, or a stock edit writing a row.
    const { paint, user } = await started();
    paint.updateBrush({ ...STOCK_BRUSHES[0], smoothing: 0.9 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(user.update).not.toHaveBeenCalled();
    paint.selectBrush("row-1");
    paint.updateBrush({ ...mine, smoothing: 0.3 });
    await vi.advanceTimersByTimeAsync(1000);
    paint.setOption("smoothing", 0.6);
    await vi.advanceTimersByTimeAsync(1000);
    paint.setMode("multiply");
    await vi.advanceTimersByTimeAsync(1000);
    expect(user.update.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ preset: expect.objectContaining({ smoothing: 0.3 }) }),
      expect.objectContaining({ preset: expect.objectContaining({ smoothing: 0.6 }) }),
      expect.objectContaining({ preset: expect.objectContaining({ blend: "multiply" }) }),
    ]);
  });

  it("saves a tuned Yours brush when the session stops inside the window", async () => {
    // Fails on: ending a painting within 800 ms of a tweak losing it (the scope is still alive here).
    const { paint, user } = await started();
    paint.selectBrush("row-1");
    paint.updateBrush({ ...mine, smoothing: 0.7 });
    paint.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(user.update).toHaveBeenCalledTimes(1);
  });

  it("keeps the copy armed after Save as new brush", async () => {
    // Fails on: the copy being made but the painter staying on the original.
    const { paint } = await started();
    const made = await paint.saveAsNewBrush();
    expect(made?.id).toBe("row-2");
    expect(paint.brush.value?.id).toBe("row-2");
  });

  it("arms the last of the tips it saves, and lists described brushes as AI-made", async () => {
    // Fails on: the painter's new brush being made but not armed, or the AI-made set not reaching the library panel.
    const { paint, user } = await started();
    const tip = { width: 2, height: 2, alpha: new Uint8Array([0, 255, 255, 0]) };
    let n = 0;
    user.create.mockImplementation(async (item: { preset: BrushPreset }) => ({ ...item.preset, id: `new-${++n}`, group: "yours" as const }));
    user.brushes.value = [...user.brushes.value, { preset: { ...mine, id: "ai-1" }, source: "described", setName: null }];
    const made = await paint.saveTips([{ tip, name: "A", source: "described" }, { tip, name: "B", source: "described" }]);
    expect(made?.map((b) => b.id)).toEqual(["new-1", "new-2"]);
    expect(paint.brush.value?.id).toBe("new-2");
    expect([...paint.aiMade.value]).toEqual(["ai-1"]);
  });

  it("renames the armed brush on screen and falls back to stock when it is deleted", async () => {
    // Fails on: painting on with a brush whose row is gone, or the options bar showing the old name.
    const { paint } = await started();
    paint.selectBrush("row-1");
    await paint.renameBrush("row-1", "  Wash ");
    expect(paint.brush.value?.name).toBe("Wash");
    mocks.confirm.mockResolvedValueOnce(true);
    await paint.removeBrush("row-1");
    expect(paint.brush.value?.id).toBe(STOCK_BRUSHES[0].id);
  });
});
