import { describe, expect, it } from "vitest";
import {
  resolveCharacterPlacement,
  createDestination,
} from "./useCharacterCreationForm";

describe("resolveCharacterPlacement", () => {
  const CREATOR = "user-1";
  const CAMPAIGN = "campaign-1";

  it("leaves a DM's roster character unclaimed in the active campaign", () => {
    expect(resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: CAMPAIGN, owner_user_id: null });
  });

  it("gives a player's own character to them, with no campaign of its own", () => {
    // The player's character is linked to a campaign through campaign_members,
    // not by stamping campaign_id at creation.
    expect(resolveCharacterPlacement({
      isDmCreate: false, activeCampaignId: CAMPAIGN, creatorId: CREATOR,
    })).toEqual({ campaign_id: null, owner_user_id: CREATOR });
  });

  it("gives a DM create with no active campaign to its creator", () => {
    // Regression for #738. Deriving both fields from isDmCreate alone set
    // campaign_id AND owner_user_id to null here, producing a character that
    // useParty, useMyCharacters, useOfferedCharacters and useCharacterPool all
    // filter out — created, levellable by direct link, and visible nowhere.
    const placement = resolveCharacterPlacement({
      isDmCreate: true, activeCampaignId: null, creatorId: CREATOR,
    });

    expect(placement).toEqual({ campaign_id: null, owner_user_id: CREATOR });
    expect(placement.owner_user_id).not.toBeNull();
  });

  it("never returns a row that is both unowned and unattached", () => {
    for (const isDmCreate of [true, false]) {
      for (const activeCampaignId of [CAMPAIGN, null]) {
        const { campaign_id, owner_user_id } = resolveCharacterPlacement({
          isDmCreate, activeCampaignId, creatorId: CREATOR,
        });
        expect(campaign_id === null && owner_user_id === null).toBe(false);
      }
    }
  });
});

describe("createDestination", () => {
  const base = { landedCampaignId: "c1", isDmCreate: false, levelUp: false, benched: false, characterId: "m1" };

  it("sends a character that stayed in the pool to the pool", () => {
    expect(createDestination({ ...base, landedCampaignId: null })).toEqual({ name: "play-home" });
  });

  it("sends a DM's roster character to the party", () => {
    expect(createDestination({ ...base, isDmCreate: true })).toEqual({ path: "/party" });
  });

  it("levels up a seated character on request", () => {
    expect(createDestination({ ...base, levelUp: true })).toEqual({
      path: "/play/character/levelup?targetLevel=2&memberId=m1",
    });
  });

  it("sends a benched character to Champions, where its notice is, even when a level up was asked for", () => {
    expect(createDestination({ ...base, levelUp: true, benched: true })).toEqual({ name: "play-champions" });
  });
});
