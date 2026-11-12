// @vitest-environment happy-dom
import { effectScope, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOCK_BRUSHES } from "./brushes/stockBrushes";
import type { UserBrush } from "./brushes/userBrushes";
import type { BrushPreset, PaintAssets } from "./engine/types";
import { AUTOSAVE_MS, useYoursBrushes } from "./useYoursBrushes";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), toastError: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, success: vi.fn(), info: vi.fn() }) }));

const assets = {
  tip: () => undefined, grain: () => undefined, loadTip: vi.fn(async () => ({ width: 1, height: 1, alpha: new Uint8Array(1) })), loadGrain: vi.fn(),
  preloadStock: async () => {}, addUserTipUrl: vi.fn(), addUserGrainUrl: vi.fn(), putTip: vi.fn(), putGrain: vi.fn(),
};

const mine: BrushPreset = { ...STOCK_BRUSHES[0], id: "row-1", name: "Mine", group: "yours" };
function userApi() {
  const brushes = ref<UserBrush[]>([{ preset: mine, source: "made", setName: null }]);
  return {
    brushes,
    create: vi.fn(async (item: { preset: BrushPreset }) => ({ ...item.preset, id: "row-2", group: "yours" as const })),
    importMany: vi.fn(),
    update: vi.fn<(arg: unknown) => Promise<undefined>>(async () => undefined),
    rename: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}
function made() {
  const user = userApi();
  const scope = effectScope();
  const yours = scope.run(() => useYoursBrushes(assets as unknown as PaintAssets & typeof assets as never, user as never));
  if (!yours) throw new Error("no composable");
  return { yours, user, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.confirm.mockReset();
  mocks.toastError.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the library with Yours", () => {
  it("lists the painter's brushes after the stock ones, with their sets", () => {
    // Fails on: the painter's brushes never reaching the library the panel shows.
    const { yours } = made();
    expect(yours.library.value.at(-1)?.id).toBe("row-1");
    expect(yours.library.value).toHaveLength(STOCK_BRUSHES.length + 1);
  });
});

describe("autosaving a Yours brush", () => {
  it("saves a tuned Yours brush once, after the last change, and says so", async () => {
    // Fails on: a write per slider tick, edits to Yours never being kept, or a status line that never moves.
    const { yours, user } = made();
    expect(yours.status.value).toBe("saved");
    for (const s of [0.1, 0.2, 0.3]) yours.scheduleSave({ ...mine, smoothing: s });
    expect(yours.status.value).toBe("dirty");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    expect(user.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(user.update).toHaveBeenCalledTimes(1);
    expect(user.update).toHaveBeenCalledWith({ id: "row-1", preset: expect.objectContaining({ smoothing: 0.3 }) });
    expect(yours.status.value).toBe("saved");
  });

  it("never writes a stock brush", () => {
    // Fails on: tuning a stock brush writing a row the painter never asked to keep.
    const { yours, user } = made();
    yours.scheduleSave({ ...STOCK_BRUSHES[0], smoothing: 0.9 });
    vi.advanceTimersByTime(5000);
    expect(user.update).not.toHaveBeenCalled();
    expect(yours.status.value).toBe("saved");
  });

  it("shows a failed save on the status line, not only as a toast, and clears it on the next good one", async () => {
    // Fails on: a failed write being invisible once the toast is gone.
    const { yours, user } = made();
    user.update.mockRejectedValueOnce(new Error("offline"));
    yours.scheduleSave({ ...mine, smoothing: 0.5 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10);
    expect(yours.status.value).toBe("error");
    expect(yours.saveError.value).toContain("Mine");
    expect(mocks.toastError).toHaveBeenCalled();
    yours.scheduleSave({ ...mine, smoothing: 0.6 });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10);
    expect(yours.status.value).toBe("saved");
  });

  it("saves a brush tuned inside the window when the scope is disposed", async () => {
    // Fails on: closing the workbench within 800 ms of a tweak losing it.
    const { yours, user, scope } = made();
    yours.scheduleSave({ ...mine, smoothing: 0.4 });
    scope.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(user.update).toHaveBeenCalledWith({ id: "row-1", preset: expect.objectContaining({ smoothing: 0.4 }) });
  });
});

describe("saving as a new brush", () => {
  it("keeps the copy as source made", async () => {
    // Fails on: Save as new brush staying a session-only brush.
    const { yours, user } = made();
    const out = await yours.saveAsNew(mine);
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ source: "made", setName: null }));
    expect(out?.id).toBe("row-2");
  });

  it("says so when the brush could not be kept", async () => {
    // Fails on: a rejected save leaving the painter believing the brush was kept.
    const { yours, user } = made();
    user.create.mockRejectedValueOnce(new Error("offline"));
    expect(await yours.saveAsNew(mine)).toBeNull();
    expect(mocks.toastError).toHaveBeenCalled();
  });
});

describe("deleting and renaming", () => {
  it("asks first, and deletes nothing when the painter says no", async () => {
    // Fails on: Delete removing the brush and its files without asking.
    const { yours, user } = made();
    mocks.confirm.mockResolvedValueOnce(false);
    expect(await yours.remove("row-1")).toBe(false);
    expect(user.remove).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(true);
    expect(await yours.remove("row-1")).toBe(true);
    expect(user.remove).toHaveBeenCalledWith("row-1");
  });

  it("drops a pending save of a brush that is deleted", async () => {
    // Fails on: an autosave landing after the delete and failing against a row that is gone.
    const { yours, user } = made();
    yours.scheduleSave({ ...mine, smoothing: 0.2 });
    mocks.confirm.mockResolvedValueOnce(true);
    await yours.remove("row-1");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10);
    expect(user.update).not.toHaveBeenCalled();
  });

  it("refuses to rename or delete a stock brush", async () => {
    // Fails on: a write aimed at a stock id, which has no row.
    const { yours, user } = made();
    expect(await yours.rename(STOCK_BRUSHES[0].id, "Mine now")).toBe(false);
    expect(await yours.remove(STOCK_BRUSHES[0].id)).toBe(false);
    expect(user.rename).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
