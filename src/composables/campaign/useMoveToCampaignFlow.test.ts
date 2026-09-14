import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const mutateAsync = vi.fn();
let isPending = { value: false };

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, fromError: (e: unknown) => String(e) }),
}));

vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync, isPending }),
}));

// Imported after the mocks so the module under test picks up the mocked composables.
const { useMoveToCampaignFlow } = await import("./useMoveToCampaignFlow");

function makeFlow(overrides: Partial<Parameters<typeof useMoveToCampaignFlow>[0]> = {}) {
  const pruneTo = vi.fn((ids: readonly string[]) => [...ids]);
  const stop = vi.fn();
  const selectable = { current: ["a", "b", "c"] as readonly string[] };
  const flow = useMoveToCampaignFlow({
    table: "items",
    noun: "item",
    selectableIds: () => selectable.current,
    pruneTo,
    stop,
    campaignName: () => "Curse of Strahd",
    ...overrides,
  });
  return { flow, pruneTo, stop, selectable };
}

describe("useMoveToCampaignFlow", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    mutateAsync.mockReset();
    isPending = { value: false };
  });

  it("prunes the current selectable ids before moving", async () => {
    mutateAsync.mockResolvedValue({ moved: 2 });
    const { flow, pruneTo, selectable } = makeFlow();
    selectable.current = ["a", "b"];

    await flow.move("campaign-1");

    expect(pruneTo).toHaveBeenCalledWith(["a", "b"]);
    expect(mutateAsync).toHaveBeenCalledWith({ table: "items", ids: ["a", "b"], campaignId: "campaign-1" });
  });

  it("bails without mutating when the pruned selection is empty", async () => {
    const pruneTo = vi.fn(() => [] as string[]);
    const stop = vi.fn();
    const flow = useMoveToCampaignFlow({
      table: "items",
      noun: "item",
      selectableIds: () => ["a"],
      pruneTo,
      stop,
      campaignName: () => null,
    });

    await flow.move("campaign-1");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("toasts the singular noun moved to a named campaign", async () => {
    mutateAsync.mockResolvedValue({ moved: 1 });
    const { flow } = makeFlow({ noun: "item" });

    await flow.move("campaign-1");

    expect(toastSuccess).toHaveBeenCalledWith("Moved 1 item to Curse of Strahd.");
  });

  it("toasts the naive plural moved to a named campaign", async () => {
    mutateAsync.mockResolvedValue({ moved: 3 });
    const { flow } = makeFlow({ noun: "item" });

    await flow.move("campaign-1");

    expect(toastSuccess).toHaveBeenCalledWith("Moved 3 items to Curse of Strahd.");
  });

  it("uses the supplied irregular plural instead of the naive one", async () => {
    mutateAsync.mockResolvedValue({ moved: 2 });
    const { flow } = makeFlow({ noun: "species", nounPlural: "species" });

    await flow.move("campaign-1");

    expect(toastSuccess).toHaveBeenCalledWith("Moved 2 species to Curse of Strahd.");
  });

  it("falls back to 'the campaign' when no campaign name is available", async () => {
    mutateAsync.mockResolvedValue({ moved: 1 });
    const { flow } = makeFlow({ campaignName: () => null });

    await flow.move("campaign-1");

    expect(toastSuccess).toHaveBeenCalledWith("Moved 1 item to the campaign.");
  });

  it("toasts the general-availability wording, singular, for a null campaignId", async () => {
    mutateAsync.mockResolvedValue({ moved: 1 });
    const { flow } = makeFlow();

    await flow.move(null);

    expect(toastSuccess).toHaveBeenCalledWith("1 item is now available in all campaigns.");
  });

  it("toasts the general-availability wording, plural, for a null campaignId", async () => {
    mutateAsync.mockResolvedValue({ moved: 3 });
    const { flow } = makeFlow();

    await flow.move(null);

    expect(toastSuccess).toHaveBeenCalledWith("3 items are now available in all campaigns.");
  });

  it("stops selection after a successful move", async () => {
    mutateAsync.mockResolvedValue({ moved: 1 });
    const { flow, stop } = makeFlow();

    await flow.move("campaign-1");

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does not stop selection and toasts the error on failure", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    const { flow, stop } = makeFlow();

    await flow.move("campaign-1");

    expect(stop).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Error: boom");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("exposes the mutation's isPending as `moving`", () => {
    isPending = { value: true };
    const { flow } = makeFlow();
    expect(flow.moving.value).toBe(true);
  });
});
