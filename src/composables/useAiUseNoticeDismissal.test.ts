import { describe, expect, it } from "vitest";
import { shouldOfferAiChoice, shouldOfferProReoffer } from "./useAiUseNoticeDismissal";
import type { Campaign } from "@/types/campaign.types";

function campaign(
  overrides: Partial<Pick<Campaign, "ai_enabled" | "user_id">> = {},
): Pick<Campaign, "ai_enabled" | "user_id"> {
  return { ai_enabled: null, user_id: "owner-1", ...overrides };
}

describe("shouldOfferAiChoice", () => {
  it("offers the chooser to the owner of a campaign that has never chosen", () => {
    expect(shouldOfferAiChoice(campaign(), "owner-1")).toBe(true);
  });

  it("does not offer it to a non-owner (player or co-DM) of an unchosen campaign", () => {
    expect(shouldOfferAiChoice(campaign(), "someone-else")).toBe(false);
  });

  it("does not offer it once the campaign already explicitly chose true", () => {
    expect(shouldOfferAiChoice(campaign({ ai_enabled: true }), "owner-1")).toBe(false);
  });

  it("does not offer it once the campaign already explicitly chose false", () => {
    expect(shouldOfferAiChoice(campaign({ ai_enabled: false }), "owner-1")).toBe(false);
  });

  it("does not offer it when there is no signed-in user", () => {
    expect(shouldOfferAiChoice(campaign(), undefined)).toBe(false);
    expect(shouldOfferAiChoice(campaign(), null)).toBe(false);
  });
});

describe("shouldOfferProReoffer", () => {
  it("offers the re-ask to a Pro owner who previously declined AI", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), "owner-1", true, false)).toBe(true);
  });

  it("does not offer it once the re-ask has already been answered", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), "owner-1", true, true)).toBe(false);
  });

  it("does not offer it to a free (non-Pro) owner", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), "owner-1", false, false)).toBe(false);
  });

  it("does not offer it to a non-owner (player or co-DM)", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), "someone-else", true, false)).toBe(false);
  });

  it("does not offer it for a never-chosen (null) campaign — that's shouldOfferAiChoice's case", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: null }), "owner-1", true, false)).toBe(false);
  });

  it("does not offer it for a campaign where AI is already enabled", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: true }), "owner-1", true, false)).toBe(false);
  });

  it("does not offer it when there is no signed-in user", () => {
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), undefined, true, false)).toBe(false);
    expect(shouldOfferProReoffer(campaign({ ai_enabled: false }), null, true, false)).toBe(false);
  });
});
