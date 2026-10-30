import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useCampaignStore } from "@/stores/campaign";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => null }));

import { usePlayerVisibleRules } from "./useRules";

function run<T>(setup: () => T): T {
  let out!: T;
  mount(
    defineComponent({ setup() { out = setup(); return () => null; } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  return out;
}

const rule = (id: string, campaign_id: string, is_player_visible = true) => ({
  id,
  campaign_id,
  title: id,
  is_player_visible,
  ruleset: null,
});

describe("usePlayerVisibleRules", () => {
  beforeEach(() => {
    fake.reset();
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = "sugarwell";
  });

  it("shows a player in two campaigns only the open campaign's house rules, not the other table's", async () => {
    // RLS lets the player read both campaigns' visible rules, so the fake
    // returns both unless the query itself asks for one campaign.
    fake.seed("rules", [rule("Sweet tooth", "sugarwell"), rule("Extreme cold", "icewind"), rule("DM only", "sugarwell", false)]);
    const rules = run(() => usePlayerVisibleRules());
    await flushPromises();
    expect(rules.data.value?.map((r) => r.title)).toEqual(["Sweet tooth"]);
  });

  it("reads nothing before a campaign is open, instead of every campaign's rules", async () => {
    useCampaignStore().activeCampaignId = null;
    fake.seed("rules", [rule("Extreme cold", "icewind")]);
    const rules = run(() => usePlayerVisibleRules());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(rules.data.value).toBeUndefined();
  });
});
