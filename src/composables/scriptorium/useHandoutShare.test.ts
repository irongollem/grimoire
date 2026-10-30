import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), confirm: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  previewHandoutShare: vi.fn(),
  useShareHandout: () => ({ mutateAsync: mocks.mutateAsync, isPending: { value: false } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }) }));

import { shareErrorMessage, useHandoutSharing } from "./useHandoutShare";

describe("useHandoutSharing.takeBack", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue({});
    mocks.confirm.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("a declined confirm keeps the holders: nothing is written", async () => {
    mocks.confirm.mockResolvedValue(false);
    expect(await useHandoutSharing().takeBack("d1")).toBe(false);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("a confirmed take-back sets the holders to nobody", async () => {
    mocks.confirm.mockResolvedValue(true);
    expect(await useHandoutSharing().takeBack("d1")).toBe(true);
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "d1", partyMemberIds: [] });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Handout taken back.");
  });

  it("a failed take-back says why and reports that the holders were kept", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.mutateAsync.mockRejectedValue(new Error("Not yours"));
    expect(await useHandoutSharing().takeBack("d1")).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Not yours");
  });
});

describe("shareErrorMessage", () => {
  it("reads an Error's message", () => {
    expect(shareErrorMessage(new Error("Not authorized"))).toBe("Not authorized");
  });

  it("reads a PostgREST error, which is a plain object rather than an Error", () => {
    expect(shareErrorMessage({ code: "22023", message: "Only a campaign's document can be shared with its players" }))
      .toBe("Only a campaign's document can be shared with its players");
  });

  it("falls back to a plain sentence for anything without a message", () => {
    expect(shareErrorMessage(undefined)).toBe("Could not update who has this handout.");
    expect(shareErrorMessage({ code: "42501" })).toBe("Could not update who has this handout.");
  });
});
