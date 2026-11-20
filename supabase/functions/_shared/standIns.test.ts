import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { loadStandInIds } from "./standIns";

function world() {
  const fake = createSupabaseFake();
  fake.seed("party_members", [
    { id: "both", campaign_id: "c1", ai_speaks: true, ai_stands_in: true },
    { id: "consent-only", campaign_id: "c1", ai_speaks: true, ai_stands_in: false },
    { id: "dm-only", campaign_id: "c1", ai_speaks: false, ai_stands_in: true },
    { id: "child", campaign_id: "c1", ai_speaks: true, ai_stands_in: true },
    { id: "pregen", campaign_id: "c1", ai_speaks: true, ai_stands_in: true },
    { id: "elsewhere", campaign_id: "c2", ai_speaks: true, ai_stands_in: true },
  ]);
  fake.seed("campaign_members", [
    { campaign_id: "c1", user_id: "u-both", party_member_id: "both" },
    { campaign_id: "c1", user_id: "u-child", party_member_id: "child" },
  ]);
  return fake.client as unknown as SupabaseClient;
}

describe("loadStandInIds", () => {
  // Bug: the AI playing a character whose player said yes but whose DM did not switch it on (or the reverse), or another campaign's.
  it("takes only this campaign's members with both words, and an unseated one", async () => {
    const ids = await loadStandInIds(world(), "c1", async () => false);
    expect([...ids].sort()).toEqual(["both", "child", "pregen"]);
  });

  // Bug: a child's or suspended account's character played by the AI because the account gate was not asked.
  it("leaves out a member whose account the AI gate refuses", async () => {
    const ids = await loadStandInIds(world(), "c1", async (user) => user === "u-child");
    expect([...ids].sort()).toEqual(["both", "pregen"]);
  });
});
