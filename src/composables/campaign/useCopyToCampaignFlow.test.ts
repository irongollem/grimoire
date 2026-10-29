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
    flow.onCopied({ copied: 1, linked: 0, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 1 monster to Neverwinter.");
  });

  it("onCopied toasts the naive plural for counts other than one", () => {
    const { flow } = makeFlow({ noun: "monster" });
    flow.onCopied({ copied: 3, linked: 0, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 monsters to Neverwinter.");
  });

  it("onCopied uses the supplied irregular plural instead of the naive one", () => {
    const { flow } = makeFlow({ noun: "species", nounPlural: "species" });
    flow.onCopied({ copied: 2, linked: 0, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 2 species to Neverwinter.");
    flow.onCopied({ copied: 1, linked: 0, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 1 species to Neverwinter.");
  });

  // #885 — a batch can now carry join rows (relationships, faction
  // memberships, inventory) alongside the entities. The dialog has just told
  // the DM what was left BEHIND, so a bare "Copied 2 NPCs" after that reads
  // as though nothing came with them.
  it("onCopied names the links that travelled when there were any", () => {
    const { flow } = makeFlow({ noun: "NPC" });
    flow.onCopied({ copied: 2, linked: 1, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 2 NPCs and 1 link to Neverwinter.");

    flow.onCopied({ copied: 2, linked: 7, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 2 NPCs and 7 links to Neverwinter.");
  });

  it("onCopied says nothing about links at zero — the original eight never have any", () => {
    const { flow } = makeFlow({ noun: "monster" });
    flow.onCopied({ copied: 3, linked: 0, targetName: "Neverwinter" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied 3 monsters to Neverwinter.");
  });

  it("onCopied closes the dialog and stops selection", () => {
    const { flow, stop } = makeFlow();
    flow.openCopy();
    expect(flow.copyOpen.value).toBe(true);

    flow.onCopied({ copied: 3, linked: 0, targetName: "Neverwinter" });

    expect(flow.copyOpen.value).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("onQuotaExceeded is wired to the shared dialog: closes it and calls the caller's paywall callback", () => {
    const onQuotaExceeded = vi.fn();
    const { flow, stop } = makeFlow({ onQuotaExceeded });
    flow.openCopy();

    flow.onQuotaExceeded();

    expect(flow.copyOpen.value).toBe(false);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
    // Nothing was copied, so the DM's selection stays for after an upgrade.
    expect(stop).not.toHaveBeenCalled();
  });
});
