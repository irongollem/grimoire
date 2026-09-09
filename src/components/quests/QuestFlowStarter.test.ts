import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowStarter from "./QuestFlowStarter.vue";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createBeat: vi.fn(),
  push: vi.fn(),
  ui: { dmMode: "play" as "prep" | "play" },
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useCreateQuest: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestBeat: () => ({ mutateAsync: mocks.createBeat }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => mocks.ui }));

describe("QuestFlowStarter", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.createBeat.mockReset().mockResolvedValue({ id: "beat-new" });
    mocks.push.mockReset();
    mocks.ui.dmMode = "play";
  });

  it("creates the quest shell and opens its overview", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new", campaign_id: "camp-1" });
    const wrapper = mount(QuestFlowStarter, {
      props: { parentId: "parent-1" },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    await wrapper.findAll("input")[0]!.setValue("  The Sunken Road  ");
    await wrapper.findAll("input")[1]!.setValue("Follow the bells below the lake.");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      parent_quest_id: "parent-1",
      title: "The Sunken Road",
      summary: "Follow the bells below the lake.",
      status: "undiscovered",
    }));
    expect(mocks.push).toHaveBeenCalledWith({ path: "/quests/quest-new", query: { view: "overview" } });
  });

  // The DB trigger makes the first beat a quest's entry the moment it exists
  // (`private.settle_quest_entry_beat`) — the starter never sets
  // `entry_beat_id` itself, only writes the beat.
  it("writes the rumor beat with the quest, titled The rumor, with no route", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new", campaign_id: "camp-1" });
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });

    await wrapper.findAll("input")[0]!.setValue("The Sunken Road");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    // "Rumor" is a visibility, not a kind: the beat is born `rumored`, so the
    // player journal already says a rumour is circulating before any text.
    expect(mocks.createBeat).toHaveBeenCalledWith(expect.objectContaining({
      quest_id: "quest-new",
      campaign_id: "camp-1",
      title: "The rumor",
      kind: "neutral",
      visibility: "rumored",
      canvas_x: 0,
      canvas_y: 0,
    }));
    expect(mocks.push).toHaveBeenCalledWith({ path: "/quests/quest-new", query: { view: "overview" } });
  });

  it("keeps the failure in context when the rumor beat cannot be created, and never navigates away", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new", campaign_id: "camp-1" });
    mocks.createBeat.mockRejectedValue(new Error("Beat insert failed"));
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });

    await wrapper.findAll("input")[0]!.setValue("The Sunken Road");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Beat insert failed");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  // Regression guard for #799: `quests.rewards` and the currency/item reward
  // columns are gone from the schema, so sending them in the insert fails at
  // the database. This asserts the client-side row shape, not just that the
  // call happened.
  it("never sends the deleted reward columns on the created quest", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new", campaign_id: "camp-1" });
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });

    await wrapper.findAll("input")[0]!.setValue("The Sunken Road");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    const insert = mocks.create.mock.calls[0]![0] as Record<string, unknown>;
    for (const column of [
      "rewards", "reward_pp", "reward_gp", "reward_ep", "reward_sp", "reward_cp",
      "reward_item_ids", "reward_currency_pools",
    ]) {
      expect(insert).not.toHaveProperty(column);
    }
  });

  // The database enforces this too (`quests_summary_is_one_line`, migration
  // 20260906160921) — this is the fast, friendly version of the same rule.
  it("caps the premise input at QUEST_SUMMARY_MAX and names the player audience in its placeholder", () => {
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });
    const summaryInput = wrapper.findAll("input")[1]!;
    expect(summaryInput.attributes("maxlength")).toBe(String(QUEST_SUMMARY_MAX));
    expect(summaryInput.attributes("placeholder")).toContain("Players see this");
  });

  // The regression this guards: creating a flow used to write `dmMode = "prep"`,
  // so a DM improvising a quest mid-session silently stopped broadcasting and the
  // next NPC reveal went out unannounced. The overview is now named in the URL,
  // so the landing surface no longer costs the session. See #758.
  it("leaves a running session alone", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new", campaign_id: "camp-1" });
    const wrapper = mount(QuestFlowStarter, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    await wrapper.findAll("input")[0]!.setValue("The Sunken Road");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(mocks.ui.dmMode).toBe("play");
  });

  it("keeps creation failures in context", async () => {
    mocks.create.mockRejectedValue(new Error("Quest insert failed"));
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });
    await wrapper.findAll("input")[0]!.setValue("Broken road");
    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Quest insert failed");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
