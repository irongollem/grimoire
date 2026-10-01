import { describe, expect, it } from "vitest";
import {
  campaignToAttachAfterCreate,
  creationLandingCampaign,
  editionStepBlocked,
  editionStepNotes,
  initialCreationRuleset,
  type EditionCampaign,
} from "./characterCreationEdition";

const STRICT_2014: EditionCampaign = { id: "campaign-1", name: "Strahd", ruleset: "2014", allows_mixed_rulesets: false };
const MIXED_2024: EditionCampaign = { id: "campaign-2", name: "Waterdeep", ruleset: "2024", allows_mixed_rulesets: true };

describe("creationLandingCampaign", () => {
  it("is the active campaign for a DM roster create", () => {
    expect(creationLandingCampaign({ isDmCreate: true, activeCampaign: STRICT_2014, isMemberOfActiveCampaign: false })).toBe(STRICT_2014);
  });
  it("is the active campaign for a player who sits at it", () => {
    expect(creationLandingCampaign({ isDmCreate: false, activeCampaign: STRICT_2014, isMemberOfActiveCampaign: true })).toBe(STRICT_2014);
  });
  it("is null for a player who does not sit at it, and with no campaign", () => {
    expect(creationLandingCampaign({ isDmCreate: false, activeCampaign: STRICT_2014, isMemberOfActiveCampaign: false })).toBeNull();
    expect(creationLandingCampaign({ isDmCreate: true, activeCampaign: null, isMemberOfActiveCampaign: true })).toBeNull();
  });
});

describe("campaignToAttachAfterCreate", () => {
  it("brings a seated player's new character to the table they are playing at", () => {
    expect(campaignToAttachAfterCreate(STRICT_2014, false)).toBe("campaign-1");
  });
  it("leaves a character in the pool when there is no landing table", () => {
    expect(campaignToAttachAfterCreate(null, false)).toBeNull();
  });
  it("never attaches a DM roster create: that row is already in its campaign, unowned", () => {
    expect(campaignToAttachAfterCreate(STRICT_2014, true)).toBeNull();
  });
});

describe("initialCreationRuleset", () => {
  it("takes the table's edition, or nothing", () => {
    expect(initialCreationRuleset(MIXED_2024)).toBe("2024");
    expect(initialCreationRuleset(null)).toBeNull();
  });
});

describe("editionStepNotes", () => {
  it("says nothing without a table", () => {
    expect(editionStepNotes({ landing: null, isDmCreate: false })).toEqual({});
  });
  it("marks the table's edition and the other one for a strict table, per creator", () => {
    expect(editionStepNotes({ landing: STRICT_2014, isDmCreate: false })).toEqual({
      "2014": "Your table plays this.",
      "2024": "Your table does not take this edition. The character would rest in your pool.",
    });
    expect(editionStepNotes({ landing: STRICT_2014, isDmCreate: true })["2024"]).toBe("This table does not take this edition.");
  });
  it("says both editions are taken at a mixed table", () => {
    expect(editionStepNotes({ landing: MIXED_2024, isDmCreate: false })).toEqual({
      "2024": "Your table plays this.",
      "2014": "Your table takes both editions.",
    });
  });
});

describe("editionStepBlocked", () => {
  it("blocks until an edition is chosen", () => {
    expect(editionStepBlocked({ chosen: null, landing: null, isDmCreate: false })).toBe(true);
    expect(editionStepBlocked({ chosen: "2014", landing: null, isDmCreate: false })).toBe(false);
  });
  it("blocks a DM roster create at a table that does not take the edition", () => {
    expect(editionStepBlocked({ chosen: "2024", landing: STRICT_2014, isDmCreate: true })).toBe(true);
    expect(editionStepBlocked({ chosen: "2014", landing: STRICT_2014, isDmCreate: true })).toBe(false);
    expect(editionStepBlocked({ chosen: "2014", landing: MIXED_2024, isDmCreate: true })).toBe(false);
  });
  it("lets a player take a refused edition forward, since the character rests in the pool", () => {
    expect(editionStepBlocked({ chosen: "2024", landing: STRICT_2014, isDmCreate: false })).toBe(false);
  });
});
