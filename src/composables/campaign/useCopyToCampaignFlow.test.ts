import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

// Imported after the mock so the module under test picks up the mocked useToast.
const { useCopyToCampaignFlow } = await import("./useCopyToCampaignFlow");

function makeFlow(overrides: Partial<Parameters<typeof useCopyToCampaignFlow>[0]> = {}) {
  const pruneTo = vi.fn((ids: readonly string[]) => [...ids]);
  const stop = vi.fn();
  const selectable = { current: ["a", "b", "c"] as readonly string[] };
  const flow = useCopyToCampaignFlow({
    noun: "item",
    selectableIds: () => selectable.current,
    pruneTo,
    stop,
    ...overrides,
  });
  return { flow, pruneTo, stop, selectable };
}

describe("useCopyToCampaignFlow", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
  });

  it("openCopy prunes the current selectable ids before opening", () => {
    const { flow, pruneTo, selectable } = makeFlow();
    selectable.current = ["a", "b"];

    flow.openCopy();

    expect(pruneTo).toHaveBeenCalledWith(["a", "b"]);
    expect(flow.copyOpen.value).toBe(true);
    expect(flow.copyIds.value).toEqual(["a", "b"]);
  });

  it("openCopy bails without opening when the pruned selection is empty", () => {
    const pruneTo = vi.fn(() => [] as string[]);
    const stop = vi.fn();
    const flow = useCopyToCampaignFlow({
      noun: "item",
      selectableIds: () => ["a"],
      pruneTo,
      stop,
    });

    flow.openCopy();

    expect(flow.copyOpen.value).toBe(false);
    expect(flow.copyIds.value).toEqual([]);
  });

  it("onCopied toasts the singular noun for a count of one", () => {
    const { flow } = makeFlow({ noun: "monster" });
    flow.onCopied({ copied: 1, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 1 monster to Neverwinter.");
  });

  it("onCopied toasts the naive plural for counts other than one", () => {
    const { flow } = makeFlow({ noun: "monster" });
    flow.onCopied({ copied: 3, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 monsters to Neverwinter.");
  });

  it("onCopied uses the supplied irregular plural instead of the naive one", () => {
    const { flow } = makeFlow({ noun: "species", nounPlural: "species" });
    flow.onCopied({ copied: 2, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 2 species to Neverwinter.");
    flow.onCopied({ copied: 1, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 1 species to Neverwinter.");
  });

  it("onCopied closes the dialog and stops selection", () => {
    const { flow, stop } = makeFlow();
    flow.openCopy();
    expect(flow.copyOpen.value).toBe(true);

    flow.onCopied({ copied: 3, targetName: "Neverwinter" });

    expect(flow.copyOpen.value).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("onQuotaExceeded closes the dialog and does not stop selection or toast", () => {
    const { flow, stop } = makeFlow();
    flow.openCopy();

    flow.onQuotaExceeded();

    expect(flow.copyOpen.value).toBe(false);
    expect(stop).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("onQuotaExceeded invokes the caller's callback when one is supplied, for surfaces with a paywall", () => {
    const onQuotaExceeded = vi.fn();
    const { flow } = makeFlow({ onQuotaExceeded });

    flow.onQuotaExceeded();

    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });

  it("onQuotaExceeded is safe to call with no callback supplied, for surfaces without a paywall", () => {
    const { flow } = makeFlow();
    expect(() => flow.onQuotaExceeded()).not.toThrow();
  });
});
