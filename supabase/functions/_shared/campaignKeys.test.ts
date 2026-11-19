import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { loadCampaignKeys, NO_CAMPAIGN_KEYS } from "./campaignKeys";

let fake: SupabaseFake;
let proUsers: Set<string>;
const admin = () => fake.client as unknown as SupabaseClient;
const decrypt = async (ciphertext: string) => {
  if (ciphertext === "enc:v1:broken") throw new Error("bad tag");
  return ciphertext.replace("enc:v1:", "plain:");
};

const campaign = { id: "c1", user_id: "owner" };

beforeEach(() => {
  fake = createSupabaseFake();
  proUsers = new Set(["owner", "earlier-owner"]);
  fake.onRpc("is_user_pro", (args) => proUsers.has(args.p_user_id as string));
  fake.seed("campaign_api_keys", [
    { campaign_id: "c1", user_id: "owner", openai_api_key: "enc:v1:o", anthropic_api_key: null, gemini_api_key: "enc:v1:g" },
    { campaign_id: "c2", user_id: "owner", openai_api_key: "enc:v1:other-campaign", anthropic_api_key: null, gemini_api_key: null },
  ]);
});

describe("loadCampaignKeys", () => {
  it("decrypts this campaign's keys for a Pro owner", async () => {
    await expect(loadCampaignKeys(admin(), campaign, decrypt)).resolves.toEqual({
      openai: "plain:o",
      anthropic: null,
      gemini: "plain:g",
    });
  });

  it("ignores a lapsed owner's stored keys", async () => {
    proUsers.delete("owner");
    await expect(loadCampaignKeys(admin(), campaign, decrypt)).resolves.toEqual(NO_CAMPAIGN_KEYS);
  });

  it("never uses keys an earlier owner left on the campaign", async () => {
    fake.reset();
    fake.onRpc("is_user_pro", () => true);
    fake.seed("campaign_api_keys", [
      { campaign_id: "c1", user_id: "earlier-owner", openai_api_key: "enc:v1:theirs", anthropic_api_key: null, gemini_api_key: null },
    ]);
    await expect(loadCampaignKeys(admin(), campaign, decrypt)).resolves.toEqual(NO_CAMPAIGN_KEYS);
  });

  it("counts a key that does not decrypt as no key, keeping the others", async () => {
    fake.reset();
    fake.onRpc("is_user_pro", () => true);
    fake.seed("campaign_api_keys", [
      { campaign_id: "c1", user_id: "owner", openai_api_key: "enc:v1:broken", anthropic_api_key: "enc:v1:a", gemini_api_key: null },
    ]);
    await expect(loadCampaignKeys(admin(), campaign, decrypt)).resolves.toEqual({
      openai: null,
      anthropic: "plain:a",
      gemini: null,
    });
  });

  it("throws on a read error rather than generating as if no key were stored", async () => {
    fake.failNext("campaign_api_keys", { message: "boom" });
    await expect(loadCampaignKeys(admin(), campaign, decrypt)).rejects.toThrow("boom");
  });
});
