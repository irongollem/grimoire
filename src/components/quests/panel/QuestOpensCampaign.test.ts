import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import type { User } from "@supabase/supabase-js";
import type { Campaign } from "@/types/campaign.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import QuestOpensCampaign from "./QuestOpensCampaign.vue";

function setUp(userId: string, opening: string | null = null) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: userId } as User;
  const campaign = useCampaignStore();
  campaign.activeCampaignId = "c1";
  campaign.activeCampaign = { id: "c1", user_id: "u1", name: "Sugarwell", opening_quest_id: opening } as Campaign;
  fake.reset();
  fake.seed("campaigns", [{ id: "c1", user_id: "u1", name: "Sugarwell", opening_quest_id: opening }]);
  fake.seed("quests", [
    { id: "q1", campaign_id: "c1", user_id: "u1", title: "The Locked Workshop" },
    { id: "q2", campaign_id: "c1", user_id: "u1", title: "Before the Count" },
  ]);
}

const mountIt = (questId = "q1") =>
  mount(QuestOpensCampaign, {
    props: { questId },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });

describe("QuestOpensCampaign", () => {
  beforeEach(() => setUp("u1"));

  // Bug caught: the tick saved on the quest, or nowhere, so the table's first sitting still begins nowhere.
  it("names this quest as the campaign's beginning when ticked, and clears it when unticked", async () => {
    const wrapper = mountIt();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await vi.waitFor(() => expect(fake.rows("campaigns")[0]!["opening_quest_id"]).toBe("q1"));
    await vi.waitFor(() => expect(useCampaignStore().activeCampaign?.opening_quest_id).toBe("q1"));
    await wrapper.get('input[type="checkbox"]').setValue(false);
    await vi.waitFor(() => expect(fake.rows("campaigns")[0]!["opening_quest_id"]).toBeNull());
  });

  // Bug caught: two quests both looking like the beginning, or no word that ticking here moves it.
  it("says which other quest the campaign begins with, and is not ticked itself", async () => {
    setUp("u1", "q2");
    const wrapper = mountIt("q1");
    await vi.waitFor(() => expect(wrapper.text()).toContain("Before the Count"));
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
  });

  // Bug caught: a co-DM offered a switch the database refuses them.
  it("offers nothing to someone who is not the campaign's owner", async () => {
    setUp("u2");
    const wrapper = mountIt();
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-opens-campaign"]').exists()).toBe(false);
  });

  // Bug caught: a deleted quest's id read as "the campaign begins with (blank)".
  it("reads an opening that names no quest as none", async () => {
    setUp("u1", "gone");
    const wrapper = mountIt();
    await flushPromises();
    expect(wrapper.text()).toContain("No quest opens the campaign yet");
  });
});
