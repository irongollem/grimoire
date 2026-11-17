import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import type { User } from "@supabase/supabase-js";
import type { Campaign } from "@/types/campaign.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import TableStartView from "./TableStartView.vue";

const member = (id: string, name: string) => ({ id, campaign_id: "c1", name, class: "Rogue", level: 3 });
const sitting = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  campaign_id: "c1",
  party_member_id: "m1",
  scene_location_id: null,
  credits_spent: 0,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...over,
});

function setUp(aiEnabled: boolean | null) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1" } as User;
  const campaign = useCampaignStore();
  campaign.activeCampaignId = "c1";
  campaign.activeCampaign = { id: "c1", user_id: "u1", name: "Sugarwell", ai_enabled: aiEnabled } as Campaign;
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/table", component: { template: "<div />" } },
      { path: "/table/:sessionId", component: { template: "<div />" } },
      { path: "/party/new", component: { template: "<div />" } },
      { path: "/campaign/settings", component: { template: "<div />" } },
    ],
  });
  await router.push("/table");
  const wrapper = mount(TableStartView, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await vi.waitFor(() => expect(wrapper.find('[role="radiogroup"]').exists() || wrapper.find('[data-testid="solo-ai-off"]').exists()).toBe(true));
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  fake.reset();
});

describe("TableStartView", () => {
  beforeEach(() => {
    setUp(true);
    fake.seed("party_members", [member("m1", "Inkling"), member("m2", "Glint")]);
  });

  const sitDown = (w: Awaited<ReturnType<typeof mountView>>["wrapper"]) => w.findAll("button").find((b) => b.text() === "Sit down")!;

  // Bug caught: Sit down going to the table with nobody chosen, so the story begins about no one.
  it("will not sit down until a character is chosen, then goes to a new sitting about them", async () => {
    const { wrapper, router } = await mountView();
    expect(sitDown(wrapper).attributes("disabled")).toBeDefined();
    await sitDown(wrapper).trigger("click");
    expect(router.currentRoute.value.path).toBe("/table");

    await wrapper.findAll('[role="radio"]').find((r) => r.text().includes("Glint"))!.trigger("click");
    expect(sitDown(wrapper).attributes("disabled")).toBeUndefined();
    await sitDown(wrapper).trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table/new");
    expect(router.currentRoute.value.query).toEqual({ character: "m2" });
  });

  // Bug caught: another account's sittings listed under mine (RLS is a ceiling; the read must name the caller).
  it("lists only my earlier sittings, each with a way to continue it", async () => {
    fake.seed("agent_sessions", [sitting("mine"), sitting("theirs", { user_id: "u2" }), sitting("other-campaign", { campaign_id: "c2" })]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="table-sitting"]')).toHaveLength(1));
    const row = wrapper.get('[data-testid="table-sitting"]');
    expect(row.text()).toContain("Inkling");
    expect(row.get("a").attributes("href")).toBe("/table/mine");
  });
});

describe("TableStartView with AI off", () => {
  // Bug caught: the start screen offering a sitting whose first turn the server refuses.
  it.each([false, null])("says so and offers nothing to sit down to when ai_enabled is %s", async (flag) => {
    setUp(flag);
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain("AI is off for this campaign");
    expect(wrapper.findAll("button").some((b) => b.text() === "Sit down")).toBe(false);
  });
});
