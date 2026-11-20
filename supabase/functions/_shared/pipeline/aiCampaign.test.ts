import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { loadAiCampaign } from "./aiCampaign";

let fake: SupabaseFake;
const admin = () => fake.client as unknown as SupabaseClient;

const campaign = (over: Record<string, unknown> = {}) => ({ id: "c-1", user_id: "owner", ai_enabled: true, text_provider: "openai", ...over });

beforeEach(() => {
  fake = createSupabaseFake();
  fake.seed("campaign_members", [
    { campaign_id: "c-1", user_id: "co-dm", role: "dm" },
    { campaign_id: "c-1", user_id: "player", role: "player" },
  ]);
});

async function refusal(load: Awaited<ReturnType<typeof loadAiCampaign>>) {
  if (load.ok) throw new Error("expected a refusal");
  return { status: load.response.status, error: ((await load.response.json()) as { error: string }).error };
}

describe("loadAiCampaign", () => {
  it("#1234 answers a failed read with 500, not 'Campaign not found'", async () => {
    fake.failNext("campaigns", { message: "timeout" });
    expect(await refusal(await loadAiCampaign(admin(), "c-1", "owner"))).toEqual({ status: 500, error: "campaign_read_failed" });
  });

  it("returns the requested columns to the DM", async () => {
    fake.seed("campaigns", [campaign()]);
    const load = await loadAiCampaign<{ id: string; user_id: string; ai_enabled: boolean; text_provider: string }>(
      admin(), "c-1", "co-dm", { columns: ["text_provider"] },
    );
    expect(load.ok && load.campaign.text_provider).toBe("openai");
  });

  it("refuses a player, who is a member but not the DM", async () => {
    fake.seed("campaigns", [campaign()]);
    expect(await refusal(await loadAiCampaign(admin(), "c-1", "player"))).toEqual({ status: 403, error: "forbidden" });
  });

  it("'owner' access refuses a co-DM", async () => {
    fake.seed("campaigns", [campaign()]);
    expect((await loadAiCampaign(admin(), "c-1", "co-dm", { access: "owner" })).ok).toBe(false);
    expect((await loadAiCampaign(admin(), "c-1", "owner", { access: "owner" })).ok).toBe(true);
  });

  it("hides the campaign from an outsider when asked, so an id cannot be probed", async () => {
    fake.seed("campaigns", [campaign()]);
    expect(await refusal(await loadAiCampaign(admin(), "c-1", "stranger", { hideFromOutsiders: true }))).toEqual({
      status: 404,
      error: "campaign_not_found",
    });
  });

  it("tells an outsider nothing about the AI switch: access is refused first", async () => {
    fake.seed("campaigns", [campaign({ ai_enabled: false })]);
    expect((await refusal(await loadAiCampaign(admin(), "c-1", "stranger"))).error).toBe("forbidden");
  });

  it("treats an undecided AI switch (null) as off", async () => {
    fake.seed("campaigns", [campaign({ ai_enabled: null })]);
    expect(await refusal(await loadAiCampaign(admin(), "c-1", "owner"))).toEqual({ status: 403, error: "ai_disabled" });
  });

  it("the table switch also needs the owner's grant of the AI table", async () => {
    fake.seed("campaigns", [campaign()]);
    expect((await refusal(await loadAiCampaign(admin(), "c-1", "owner", { aiSwitch: "table" }))).error).toBe("ai_disabled");
    fake.seed("feature_access", [{ user_id: "owner", feature: "ai_table" }]);
    expect((await loadAiCampaign(admin(), "c-1", "owner", { aiSwitch: "table" })).ok).toBe(true);
  });

  it("loads an AI-off campaign for a request that skips the switch", async () => {
    fake.seed("campaigns", [campaign({ ai_enabled: false })]);
    expect((await loadAiCampaign(admin(), "c-1", "owner", { aiSwitch: false })).ok).toBe(true);
  });
});
