import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestPayoffPanel from "./QuestPayoffPanel.vue";
import type { LootPlacement, QuestBeat, QuestBeatEdge, QuestConsequence } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  createConsequence: vi.fn(),
  removeConsequence: vi.fn(),
  createLoot: vi.fn(),
  removeLoot: vi.fn(),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestConsequence: () => ({ mutateAsync: mocks.createConsequence }),
  useDeleteQuestConsequence: () => ({ mutateAsync: mocks.removeConsequence }),
  useCreateLootPlacement: () => ({ mutateAsync: mocks.createLoot }),
  useDeleteLootPlacement: () => ({ mutateAsync: mocks.removeLoot }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [{ id: "obj-1", description: "Keep the bridge standing" }] } }),
  useQuests: () => ({ data: { value: [{ id: "quest-sequel", title: "The stolen cauldron", status: "undiscovered" }] } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { value: [{ id: "npc-1", name: "Oarus Masthew" }] } }),
}));
vi.mock("@/composables/items/useItems", () => ({
  useItems: () => ({ data: { value: [{ id: "item-1", name: "Tally-stick", user_id: "dm", campaign_id: "campaign-1" }] } }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm" } }) }));

const beat = { id: "beat-fork", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis" } as QuestBeat;
const beats = [
  beat,
  { id: "beat-confess", quest_id: "quest-1", title: "He confesses the tithe" },
] as QuestBeat[];
const edges = [
  { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice" },
] as QuestBeatEdge[];

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1", on_beat_id: null, on_edge_id: null, on_objective_id: null, on_objective_status: null,
    on_quest_settled: false, after_days: 0, action: "grant_knowledge", target_objective_id: null,
    target_npc_id: null, target_quest_id: null, action_payload: {},
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function loot(overrides: Partial<LootPlacement> & { id: string }): LootPlacement {
  return {
    beat_id: "beat-fork", quest_id: "quest-1", location_id: null, campaign_id: "campaign-1", kind: "item",
    item_id: null, quantity: 1, label: "Tally-stick of the widow", payload: {}, source_type: "prepared",
    source_id: null, sort_order: 0, dispatch_message_id: null, dispatched_at: null, delivery_state: "held",
    quantity_remaining: 1, claimed_by_names: [], handed_out_this_session: false,
    ...overrides,
  };
}

function mountPanel(props: Partial<InstanceType<typeof QuestPayoffPanel>["$props"]> = {}) {
  return mount(QuestPayoffPanel, {
    props: { beat, edges, beats, consequences: [], loot: [], ...props },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestPayoffPanel", () => {
  beforeEach(() => {
    mocks.createConsequence.mockReset();
    mocks.removeConsequence.mockReset();
    mocks.createLoot.mockReset();
    mocks.removeLoot.mockReset();
  });

  it("merges this beat's consequences and loot into one ordered list", () => {
    const wrapper = mountPanel({
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "Renown" } })],
      loot: [loot({ id: "loot-1" })],
    });
    const rows = wrapper.findAll("ul li");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Milestone: \"Renown\"");
    expect(rows[0]!.text()).toContain("auto");
    expect(rows[1]!.text()).toContain("Tally-stick of the widow");
    expect(rows[1]!.text()).toContain("you dispatch");
  });

  it("removes a consequence row through the consequence mutation", async () => {
    const wrapper = mountPanel({
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "Renown" } })],
    });
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.removeConsequence).toHaveBeenCalledWith({ id: "c-1", questId: "quest-1" });
  });

  it("removes a loot row through the loot mutation, keyed by campaign", async () => {
    const wrapper = mountPanel({ loot: [loot({ id: "loot-1" })] });
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.removeLoot).toHaveBeenCalledWith({ id: "loot-1", campaignId: "campaign-1" });
  });

  it("opens the influence quick-add and authors a disposition shift with a signed step", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Influence")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "npc-1");
    await wrapper.findAll("select").at(-1)!.setValue("step:-1");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      quest_id: "quest-1",
      on_beat_id: "beat-fork",
      on_edge_id: null,
      action: "shift_npc_relationship",
      target_npc_id: "npc-1",
      action_payload: { step: -1 },
    }));
  });

  // The stance form the maintainer asked for: "indifferent to helpful" is a
  // stance stated outright, and the default, since it is what a DM reaches
  // for at the table.
  it("authors an absolute stance by default — the NPC becomes friendly", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Influence")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "npc-1");
    await flushPromises();
    expect(wrapper.findAll("select").at(-1)!.text()).toContain("Becomes helpful");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      action: "shift_npc_relationship",
      target_npc_id: "npc-1",
      action_payload: { to: "friendly" },
    }));
  });

  it("conditions a quick-add on a named route rather than arrival", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Milestone")!.trigger("click");
    await wrapper.findAll("select")[0]!.setValue("edge-confess");
    await wrapper.find('input[placeholder="What did the party earn…"]').setValue("Renown among the dockworkers.");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      on_beat_id: null,
      on_edge_id: "edge-confess",
      action: "award_milestone",
      action_payload: { text: "Renown among the dockworkers." },
    }));
  });

  it("opens the item quick-add and prepares loot through the same mutation the old loot panel used", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Item")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "item-1");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createLoot).toHaveBeenCalledWith(expect.objectContaining({
      beat_id: "beat-fork",
      quest_id: "quest-1",
      campaign_id: "campaign-1",
      kind: "item",
      item_id: "item-1",
      source_type: "prepared",
    }));
  });

  it("shows an empty-state direction when the beat gives nothing yet", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Nothing this beat gives yet.");
  });
});
