import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeSessionStorage } from "@/lib/safeLocalStorage";
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
const mocks = vi.hoisted(() => ({ confirm: vi.fn(async () => true), invoked: [] as { fn: string; body: unknown }[], invokeError: null as Error | null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => fake.client.from(table),
    functions: {
      invoke: async (fn: string, options: { body: unknown }) => {
        mocks.invoked.push({ fn, body: options.body });
        return { data: null, error: fn === "agent-forget" ? mocks.invokeError : new Error("not in this test") };
      },
    },
  },
  getCurrentUser: () => ({ id: "u1" }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@edge-shared/edgeError.ts", () => ({ edgeErrorMessage: async (e: Error) => e.message }));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
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
      { path: "/play/table/:sessionId", component: { template: "<div />" } },
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
  // The played character's lens is kept for the tab: one test's seat must not carry into the next.
  safeSessionStorage().clear();
  fake.reset();
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  mocks.invoked.length = 0;
  mocks.invokeError = null;
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
    expect(router.currentRoute.value.path).toBe("/play/table/new");
    expect(router.currentRoute.value.query).toEqual({ character: "m2" });
    // Bug caught: sitting down while still on the Dungeon Master's side of the app.
    expect(useAppUiStore().tablePlay).toEqual({ memberId: "m2", sessionId: null });
  });

  describe("deleting a sitting", () => {
    const left = { left_at: "2026-11-10T11:00:00Z" };
    const forgets = () => mocks.invoked.filter((i) => i.fn === "agent-forget");
    const remove = (w: Awaited<ReturnType<typeof mountView>>["wrapper"]) => w.find('[data-testid="table-sitting-delete"]');

    it("asks first, then deletes the sitting through the server, which takes its voices too", async () => {
      fake.seed("agent_sessions", [sitting("old", left)]);
      const { wrapper } = await mountView();
      await vi.waitFor(() => expect(remove(wrapper).exists()).toBe(true));
      await remove(wrapper).trigger("click");
      await flushPromises();
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(forgets()).toEqual([{ fn: "agent-forget", body: { campaignId: "c1", sessionId: "old" } }]);
    });

    // Bug caught: a cancelled confirm that still deleted.
    it("deletes nothing when the confirm is cancelled", async () => {
      mocks.confirm.mockResolvedValue(false);
      fake.seed("agent_sessions", [sitting("old", left)]);
      const { wrapper } = await mountView();
      await vi.waitFor(() => expect(remove(wrapper).exists()).toBe(true));
      await remove(wrapper).trigger("click");
      await flushPromises();
      expect(forgets()).toEqual([]);
    });
  });

  // Bug caught: another account's sittings listed under mine (RLS is a ceiling; the read must name the caller).
  it("lists only my earlier sittings, each with a way to continue it", async () => {
    const left = { left_at: "2026-11-10T11:00:00Z" };
    fake.seed("agent_sessions", [sitting("mine", left), sitting("theirs", { user_id: "u2", ...left }), sitting("other-campaign", { campaign_id: "c2", ...left })]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="table-sitting"]')).toHaveLength(1));
    const row = wrapper.get('[data-testid="table-sitting"]');
    expect(row.text()).toContain("Inkling");
    expect(row.get("a").attributes("href")).toBe("/play/table/mine");
  });

  // Bug caught: offering to continue a sitting that was left, whose next turn the server refuses.
  it("offers Read for a sitting that was left and Continue for one still going", async () => {
    // The newest one was left, so the page stays; an older one was never left.
    fake.seed("agent_sessions", [sitting("going", { updated_at: "2026-11-09T10:00:00Z" }), sitting("left", { left_at: "2026-11-11T11:00:00Z", updated_at: "2026-11-11T11:00:00Z" })]);
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="table-sitting"]')).toHaveLength(2));
    const labels = Object.fromEntries(wrapper.findAll('[data-testid="table-sitting"]').map((r) => [r.get("a").attributes("href"), r.get("a").text()]));
    expect(labels).toEqual({ "/play/table/going": "Continue", "/play/table/left": "Read" });
  });
});

describe("TableStartView: where a campaign begins", () => {
  beforeEach(() => {
    setUp(true);
    fake.seed("party_members", [member("m1", "Inkling")]);
    fake.seed("quests", [{ id: "q1", campaign_id: "c1", user_id: "u1", title: "The Locked Workshop" }]);
  });

  // Bug caught: asking where to begin when the campaign's author already said where its story opens.
  it("says which quest the story opens with instead of asking for a place, before anything was played", async () => {
    useCampaignStore().activeCampaign = { ...useCampaignStore().activeCampaign!, opening_quest_id: "q1" };
    const { wrapper } = await mountView();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="table-begins"]').exists()).toBe(true));
    expect(wrapper.get('[data-testid="table-begins"]').text()).toContain("The Locked Workshop");
    expect(wrapper.text()).not.toContain("Where you begin");
  });

  // Bug caught: "the story begins with the prologue" still shown when choosing again after the story is under way.
  it("no longer says where the story begins once a sitting has been played", async () => {
    useCampaignStore().activeCampaign = { ...useCampaignStore().activeCampaign!, opening_quest_id: "q1" };
    fake.seed("agent_sessions", [sitting("left", { left_at: "2026-11-10T11:00:00Z" })]);
    const { wrapper } = await mountView();
    await wrapper.findAll("button").find((b) => b.text().startsWith("Play someone else"))!.trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="table-begins"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Where you begin");
  });

  // Bug caught: a campaign with no prologue losing its place picker.
  it("still asks where to begin when the campaign names no opening quest", async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain("Where you begin");
    expect(wrapper.find('[data-testid="table-begins"]').exists()).toBe(false);
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
    // Moved in the last minute: a sitting idle past the pause is over and is not reopened (resume.test.ts).
    fake.seed("agent_sessions", [sitting("going", { updated_at: new Date(Date.now() - 60_000).toISOString() })]);
    const { router } = await mountView();
    expect(router.currentRoute.value.path).toBe("/play/table/going");
    expect(useAppUiStore().tablePlay).toEqual({ memberId: "m1", sessionId: "going" });
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
    expect(router.currentRoute.value.path).toBe("/play/table/new");
    expect(router.currentRoute.value.query).toEqual({ character: "m1", place: "l1" });
  });

  // Bug caught: coming back to the Dungeon Master's side after leaving and still wearing the character's lens.
  it("takes the played character's lens off on the Dungeon Master's side of the door", async () => {
    useAppUiStore().enterTablePlay("m1", "left");
    fake.seed("agent_sessions", [sitting("left", { left_at: "2026-11-10T11:00:00Z" })]);
    await mountView();
    expect(useAppUiStore().tablePlay).toBeNull();
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
