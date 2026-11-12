import { describe, expect, it } from "vitest";
import { aiOffered, canPayFor } from "./aiOffer";

describe("aiOffered", () => {
  const on = { activeCampaignId: "c1", isAiEnabled: true };
  // Fails on: an AI action offered for a book of another campaign (charged against the wrong campaign's setting),
  // for a book with no campaign, or with AI off.
  it("offers AI only for a book of the active campaign with AI on", () => {
    expect(aiOffered("c1", on)).toBe(true);
    expect(aiOffered("c2", on)).toBe(false);
    expect(aiOffered(null, on)).toBe(false);
    expect(aiOffered("c1", { ...on, isAiEnabled: false })).toBe(false);
  });
});

describe("canPayFor", () => {
  // Fails on: a price still loading blocking the action, or a known price the DM cannot afford letting it run.
  it("lets an unknown price through and holds a known one to the balance", () => {
    expect(canPayFor(null, () => false)).toBe(true);
    expect(canPayFor(50, () => true)).toBe(true);
    expect(canPayFor(50, () => false)).toBe(false);
  });
});
