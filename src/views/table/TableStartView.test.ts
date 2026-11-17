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
  left_at: null,
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
  // Settled: the chooser, the AI-off notice, the offer to pick the story up, or the page has gone to an open sitting.
  await vi.waitFor(() =>
    expect(
      wrapper.find('[role="radiogroup"]').exists() ||
        wrapper.find('[data-testid="solo-ai-off"]').exists() ||
        wrapper.find('[data-testid="table-again"]').exists() ||
        router.currentRoute.value.path !== "/table",
    ).toBe(true),
  );
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
    const left = { left_at: "2026-11-10T11:00:00Z" };
    fake.seed("agent_sessions", [sitting("mine", left), sitting("theirs", { user_id: "u2", ...left }), sitting("other-campaign", { campaign_id: "c2", ...left })]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="table-sitting"]')).toHaveLength(1));
    const row = wrapper.get('[data-testid="table-sitting"]');
    expect(row.text()).toContain("Inkling");
    expect(row.get("a").attributes("href")).toBe("/table/mine");
  });

  // Bug caught: offering to continue a sitting that was left, whose next turn the server refuses.
  it("offers Read for a sitting that was left and Continue for one still going", async () => {
    // The newest one was left, so the page stays; an older one was never left.
    fake.seed("agent_sessions", [sitting("going", { updated_at: "2026-11-09T10:00:00Z" }), sitting("left", { left_at: "2026-11-11T11:00:00Z", updated_at: "2026-11-11T11:00:00Z" })]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="table-sitting"]')).toHaveLength(2));
    const labels = Object.fromEntries(wrapper.findAll('[data-testid="table-sitting"]').map((r) => [r.get("a").attributes("href"), r.get("a").text()]));
    expect(labels).toEqual({ "/table/going": "Continue", "/table/left": "Read" });
  });
});

describe("TableStartView: picking the story up", () => {
  beforeEach(() => {
    setUp(true);
    fake.seed("party_members", [member("m1", "Inkling"), member("m2", "Glint")]);
    fake.seed("locations", [{ id: "l1", campaign_id: "c1", user_id: "u1", name: "The Cellar" }]);
  });

  // Bug caught: making the player find and reopen a sitting they never left.
  it("goes straight back into a sitting that was never left", async () => {
    fake.seed("agent_sessions", [sitting("going")]);
    const { router } = await mountView();
    expect(router.currentRoute.value.path).toBe("/table/going");
  });

  // Bug caught: asking who you play and where again after leaving, as if the story started over.
  it("offers one way back as the same character where the party was, and keeps the chooser out of the way", async () => {
    fake.seed("agent_sessions", [sitting("left", { left_at: "2026-11-10T11:00:00Z", scene_location_id: "l1" })]);
    const { wrapper, router } = await mountView();
    const again = wrapper.get('[data-testid="table-again"]');
    await vi.waitFor(() => expect(again.text()).toContain("The Cellar"));
    expect(again.text()).toContain("Inkling");
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false);
    await again.findAll("button").find((b) => b.text() === "Sit down")!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table/new");
    expect(router.currentRoute.value.query).toEqual({ character: "m1", place: "l1" });
  });

  // Bug caught: no way to play someone else once a first sitting exists.
  it("still lets the player choose someone else", async () => {
    fake.seed("agent_sessions", [sitting("left", { left_at: "2026-11-10T11:00:00Z" })]);
    const { wrapper } = await mountView();
    await wrapper.findAll("button").find((b) => b.text().startsWith("Play someone else"))!.trigger("click");
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
  });
});

describe("TableStartView with AI off", () => {
  // Bug caught: an open sitting reopened on a campaign whose AI was switched off, onto a screen that refuses every turn.
  it("does not go into an open sitting while AI is off", async () => {
    setUp(false);
    fake.seed("party_members", [member("m1", "Inkling")]);
    fake.seed("agent_sessions", [sitting("going")]);
    const { wrapper, router } = await mountView();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table");
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });

  // Bug caught: the start screen offering a sitting whose first turn the server refuses.
  it.each([false, null])("says so and offers nothing to sit down to when ai_enabled is %s", async (flag) => {
    setUp(flag);
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain("AI is off for this campaign");
    expect(wrapper.findAll("button").some((b) => b.text() === "Sit down")).toBe(false);
  });
});
