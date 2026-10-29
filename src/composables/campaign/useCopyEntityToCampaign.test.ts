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

  // #885 — even a single row travels with its links: the relationships and
  // memberships whose other end the target campaign can already see, plus
  // its inventory.
  it("onCopied names the links that travelled with a single record", () => {
    const { flow } = makeFlow();
    flow.onCopied({ copied: 1, linked: 1, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith('Copied "Ashen Warden" with 1 link to Curse of Strahd.');

    flow.onCopied({ copied: 1, linked: 4, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith('Copied "Ashen Warden" with 4 links to Curse of Strahd.');
  });

  it("onCopied toasts the quoted entity name", () => {
    const { flow } = makeFlow();
    flow.onCopied({ copied: 1, linked: 0, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith('Copied "Ashen Warden" to Curse of Strahd.');
  });

  it("onCopied falls back to the noun, never an empty string, when the entity has no name", () => {
    const { flow, current } = makeFlow();
    current.value = { id: "m1", name: "" };
    flow.onCopied({ copied: 1, linked: 0, targetName: "Curse of Strahd" });
    expect(toastSuccess).toHaveBeenCalledWith("Copied the monster to Curse of Strahd.");
  });

  it("onCopied closes the dialog", () => {
    const { flow } = makeFlow();
    flow.openCopy();
    expect(flow.copyOpen.value).toBe(true);

    flow.onCopied({ copied: 1, linked: 0, targetName: "Curse of Strahd" });

    expect(flow.copyOpen.value).toBe(false);
  });

  it("onQuotaExceeded is wired to the shared dialog: closes it and calls the caller's paywall callback", () => {
    const onQuotaExceeded = vi.fn();
    const { flow } = makeFlow({ onQuotaExceeded });
    flow.openCopy();

    flow.onQuotaExceeded();

    expect(flow.copyOpen.value).toBe(false);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
  });
});
