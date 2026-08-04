import { describe, expect, it } from "vitest";
import { shouldOfferAiChoice } from "./useAiUseNoticeDismissal";
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
