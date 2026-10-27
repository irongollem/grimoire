import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { isCampaignDm } from "./campaignAccess";

// The table is seeded with the cases that tell the rule apart, so a read that
// forgets a filter (campaign, user or role) lets the wrong person in.
let fake: SupabaseFake;
const admin = () => fake.client as unknown as SupabaseClient;

const campaign = { id: "c1", user_id: "owner" };

beforeEach(() => {
  fake = createSupabaseFake();
  fake.seed("campaign_members", [
    { campaign_id: "c1", user_id: "co", role: "dm" },
    { campaign_id: "c1", user_id: "p1", role: "player" },
    // A DM of a different campaign, who is only a player here.
    { campaign_id: "c2", user_id: "elsewhere", role: "dm" },
    { campaign_id: "c1", user_id: "elsewhere", role: "player" },
  ]);
});

describe("isCampaignDm", () => {
  it("admits the owner without a lookup", async () => {
    fake.failNext("campaign_members", { message: "must not be read" });
    await expect(isCampaignDm(admin(), campaign, "owner")).resolves.toBe(true);
  });

  it("admits a co-DM of this campaign", async () => {
    await expect(isCampaignDm(admin(), campaign, "co")).resolves.toBe(true);
  });

  it("refuses a player member: the case the old 'any member' check let through", async () => {
    await expect(isCampaignDm(admin(), campaign, "p1")).resolves.toBe(false);
  });

  it("refuses a DM of another campaign who is only a player here", async () => {
    await expect(isCampaignDm(admin(), campaign, "elsewhere")).resolves.toBe(false);
  });

  it("refuses a stranger", async () => {
    await expect(isCampaignDm(admin(), campaign, "nobody")).resolves.toBe(false);
  });

  it("throws on a read error rather than answering no", async () => {
    fake.failNext("campaign_members", { message: "boom" });
    await expect(isCampaignDm(admin(), campaign, "co")).rejects.toMatchObject({ message: "boom" });
  });
});
