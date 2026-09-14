import { describe, it, expect, vi, beforeEach } from "vitest";

const toastSuccess = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

// Imported after the mock so the module under test picks up the mocked useToast.
const { useCopyEntityToCampaign } = await import("./useCopyEntityToCampaign");

type Entity = { id: string; name: string } | null | undefined;

function makeFlow(overrides: Partial<Parameters<typeof useCopyEntityToCampaign>[0]> = {}) {
  const current = { value: { id: "m1", name: "Ashen Warden" } as Entity };
  const flow = useCopyEntityToCampaign({
    noun: "monster",
    entity: () => current.value,
    ...overrides,
  });
  return { flow, current };
}

describe("useCopyEntityToCampaign", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
  });

  it("openCopy opens with the entity's id", () => {
    const { flow } = makeFlow();

    flow.openCopy();

    expect(flow.copyOpen.value).toBe(true);
    expect(flow.copyIds.value).toEqual(["m1"]);
  });

  it("openCopy no-ops when there is no entity", () => {
    const { flow, current } = makeFlow();
    current.value = null;

    flow.openCopy();

    expect(flow.copyOpen.value).toBe(false);
    expect(flow.copyIds.value).toEqual([]);
  });

  it("onCopied toasts the quoted entity name", () => {
    const { flow } = makeFlow();
    flow.onCopied({ copied: 1, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith('Copied "Ashen Warden" to Curse of Strahd.');
  });

  it("onCopied falls back to the noun, never an empty string, when the entity has no name", () => {
    const { flow, current } = makeFlow();
    current.value = { id: "m1", name: "" };
    flow.onCopied({ copied: 1, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied the monster to Curse of Strahd.");
  });

  it("onCopied closes the dialog", () => {
    const { flow } = makeFlow();
    flow.openCopy();
    expect(flow.copyOpen.value).toBe(true);

    flow.onCopied({ copied: 1, targetName: "Curse of Strahd" });

    expect(flow.copyOpen.value).toBe(false);
  });

  it("onQuotaExceeded closes the dialog and does not toast", () => {
    const { flow } = makeFlow();
    flow.openCopy();

    flow.onQuotaExceeded();

    expect(flow.copyOpen.value).toBe(false);
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
