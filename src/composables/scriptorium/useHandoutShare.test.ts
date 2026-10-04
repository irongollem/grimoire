import { describe, expect, it, vi } from "vitest";

vi.mock("@/composables/campaign/useEmailNotify", () => ({ notifyHandoutShared: vi.fn() }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  previewHandoutShare: vi.fn(),
  useShareHandout: vi.fn(),
}));

import { shareErrorMessage } from "./useHandoutShare";

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
