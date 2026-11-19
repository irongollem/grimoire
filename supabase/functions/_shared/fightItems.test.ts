import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseFake } from "../../../src/test/supabaseFake";
import { loadCustomItems } from "./fightItems.ts";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const STRANGER = "00000000-0000-4000-8000-0000000000a4";

const MINE = "22222222-2222-4222-8222-222222222221"; // made in this campaign
const OWNERS_GLOBAL = "22222222-2222-4222-8222-222222222222"; // the owner's item for all campaigns (no campaign)
const STRANGERS_GLOBAL = "22222222-2222-4222-8222-222222222223"; // an unrelated account's item for all campaigns
const STRANGERS_ELSEWHERE = "22222222-2222-4222-8222-222222222224"; // an unrelated account's item in another campaign

function world() {
  const fake = createSupabaseFake();
  fake.seed("campaigns", [{ id: CAMPAIGN, user_id: OWNER }]);
  fake.seed("campaign_members", []);
  fake.seed("items", [
    { id: MINE, user_id: STRANGER, campaign_id: CAMPAIGN, name: "Mine" },
    { id: OWNERS_GLOBAL, user_id: OWNER, campaign_id: null, name: "Owner's" },
    { id: STRANGERS_GLOBAL, user_id: STRANGER, campaign_id: null, name: "Stranger's global" },
    { id: STRANGERS_ELSEWHERE, user_id: STRANGER, campaign_id: OTHER_CAMPAIGN, name: "Stranger's" },
  ]);
  return fake.client as unknown as SupabaseClient;
}

describe("loadCustomItems", () => {
  // App convention: an item an inventory row names is read only when it is this campaign's or its DMs' own. A global item of an
  // unrelated account used to pass (`campaign_id is null` for anyone), so its armour bonuses could reach another account's fight.
  it("fails if an unrelated account's private item, global or in another campaign, is read by its id", async () => {
    const found = await loadCustomItems(world(), CAMPAIGN, [MINE, OWNERS_GLOBAL, STRANGERS_GLOBAL, STRANGERS_ELSEWHERE]);
    expect(found.map((i) => i.id).sort()).toEqual([MINE, OWNERS_GLOBAL].sort());
  });
});
