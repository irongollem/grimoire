import { describe, expect, it } from "vitest";
import { askRecordScope } from "./recordTables.ts";

const CAMPAIGN = { id: "c1", user_id: "owner" };

describe("askRecordScope", () => {
  // Bug caught: a DM's monster set to all campaigns (campaign_id null) read as "not a record of this campaign", so Ask
  // could neither name it from the page nor paint its portrait.
  it("takes a library kind's rows set to all campaigns, by the caller or the campaign's owner", () => {
    expect(askRecordScope("monster", CAMPAIGN, "co-dm")).toBe("campaign_id.eq.c1,and(campaign_id.is.null,user_id.in.(co-dm,owner))");
    expect(askRecordScope("monster", CAMPAIGN, "owner")).toBe("campaign_id.eq.c1,and(campaign_id.is.null,user_id.in.(owner))");
  });

  // Bug caught: a kind with no library (an NPC) matching any null-campaign row the caller can read.
  it("keeps any other kind to the campaign's own rows", () => {
    expect(askRecordScope("npc", CAMPAIGN, "owner")).toBe("campaign_id.eq.c1");
  });
});
