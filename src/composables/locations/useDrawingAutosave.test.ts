import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computed } from "vue";
import { useDrawingAutosave } from "./useDrawingAutosave";

const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/composables/cartographer/useDungeonMaps", () => ({
  useCreateDungeonMap: () => ({ mutateAsync: createMutate }),
  useUpdateDungeonMap: () => ({ mutateAsync: updateMutate }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

function fakeWorkbench() {
  const state = { revision: 1 };
  return {
    state,
    wb: {
      getEditRevision: () => state.revision,
      getName: () => "Crypt",
      getLayers: () => ({}),
      getMetadata: () => ({}),
      getCurrentPackId: () => "p",
      getDarkness: () => 0,
      getCampaignId: () => "c",
      markSaved: vi.fn(),
    },
  };
}

function setup() {
  const onCreated = vi.fn().mockResolvedValue(undefined);
  const auto = useDrawingAutosave({
    target: computed(() => ({ mapId: null, fallbackName: "Untitled" })),
    tags: () => [],
    onCreated,
  });
  const { state, wb } = fakeWorkbench();
  auto.workbenchRef.value = wb as never;
  return { auto, state, wb, onCreated };
}

beforeEach(() => {
  vi.useFakeTimers();
  createMutate.mockReset().mockResolvedValue({ id: "m1" });
  updateMutate.mockReset().mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("useDrawingAutosave", () => {
  it("two saves racing create the map row once; the second updates it", async () => {
    const { auto } = setup();
    auto.onEditRevision();
    const first = auto.save();
    const second = auto.save(); // lands while the first is in flight
    await Promise.all([first, second]);
    auto.onEditRevision();
    await auto.save();
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({ id: "m1", update: expect.anything() });
  });

  it("an edit that lands mid-save stays dirty and is saved again, not marked saved", async () => {
    const { auto, state, wb } = setup();
    auto.onEditRevision();
    createMutate.mockImplementationOnce(async () => {
      state.revision += 1; // a stroke during the network call
      return { id: "m1" };
    });
    await auto.save();
    expect(wb.markSaved).not.toHaveBeenCalled();
    expect(auto.dirty.value).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(wb.markSaved).toHaveBeenCalledTimes(1);
  });

  it("flush saves pending work at once instead of waiting out the debounce", async () => {
    const { auto } = setup();
    auto.onEditRevision();
    await auto.flush();
    expect(createMutate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing to save does not write", async () => {
    const { auto } = setup();
    await auto.flush();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
