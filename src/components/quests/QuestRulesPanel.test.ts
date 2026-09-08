import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRulesPanel from "./QuestRulesPanel.vue";
import type { QuestConsequence } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestConsequences: () => ({ data: { get value() { return mocks.rows; } } }),
  useCreateQuestConsequence: () => ({ mutateAsync: mocks.create }),
  useDeleteQuestConsequence: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [
    { id: "obj-1", quest_id: "quest-1", description: "Keep the bridge standing", status: "pending", is_player_visible: true, sort_order: 1 },
    { id: "obj-2", quest_id: "quest-1", description: "Warn the village", status: "dormant", is_player_visible: false, sort_order: 2 },
  ] } }),
  // #836: only `undiscovered` quests can be unlocked, and the quest being
  // edited is excluded — the database refuses a self-unlock.
  useQuests: () => ({ data: { value: [
    { id: "quest-1", title: "This very quest", status: "undiscovered" },
    { id: "quest-sequel", title: "The stolen cauldron", status: "undiscovered" },
  ] } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { value: [{ id: "npc-1", name: "Oarus Masthew" }] } }),
}));

function mountPanel() {
  return mount(QuestRulesPanel, {
    props: { questId: "quest-1" },
    global: { stubs: { EntityCombobox: true } },
  });
}

function comboboxes(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAllComponents({ name: "EntityCombobox" });
}

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1",
    on_beat_id: null,
    on_edge_id: null,
    on_objective_id: null,
    on_objective_status: null,
    on_quest_settled: false,
    after_days: 0,
    action: "complete",
    target_objective_id: null,
    target_npc_id: null,
    target_quest_id: null,
    action_payload: {},
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("QuestRulesPanel", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.rows = [];
  });

  it("defaults to the quest-settled condition and hides the objective picker", () => {
    const wrapper = mountPanel();
    const options = wrapper.findAll("select")[0]!.findAll("option");
    expect(options.map((option) => option.attributes("value"))).toEqual(["settled", "objective"]);
    // Only the action's own target-objective combobox is offered yet.
    expect(comboboxes(wrapper)).toHaveLength(1);
  });

  it("reveals the objective and status pickers once the condition is 'objective'", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[0]!.setValue("objective");
    expect(comboboxes(wrapper)).toHaveLength(2);
    const statusOptions = wrapper.findAll("select")[1]!.findAll("option");
    expect(statusOptions.map((option) => option.attributes("value"))).toEqual(["pending", "complete", "failed"]);
  });

  it("authors an objective-became rule with a delayed world action", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[0]!.setValue("objective");
    comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "obj-1");
    await wrapper.findAll("select")[1]!.setValue("failed");
    // Action select follows the status select once the objective picker is shown.
    await wrapper.findAll("select")[2]!.setValue("create_calendar_event");
    await wrapper.find('input[type="number"]').setValue(2);
    await wrapper.find('input[placeholder="Event title…"]').setValue("The cult reveals itself");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith({
      quest_id: "quest-1",
      on_beat_id: null,
      on_edge_id: null,
      on_objective_id: "obj-1",
      on_objective_status: "failed",
      on_quest_settled: false,
      after_days: 2,
      action: "create_calendar_event",
      target_objective_id: null,
      target_npc_id: null,
      target_quest_id: null,
      action_payload: { title: "The cult reveals itself", event_type: "quest" },
    });
  });

  it("authors a quest-settled rule", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[1]!.setValue("send_broadcast");
    await wrapper.find('input[placeholder="Broadcast message…"]').setValue("The tale is told.");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      on_objective_id: null,
      on_objective_status: null,
      on_quest_settled: true,
      action: "send_broadcast",
      action_payload: { message: "The tale is told." },
    }));
  });

  it("cannot target the same objective its own condition names", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[0]!.setValue("objective");
    comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "obj-1");
    await flushPromises();
    // Second combobox is the ledger verb's target; it must drop obj-1.
    const targetOptions = comboboxes(wrapper)[1]!.props("options") as Array<{ id: string }>;
    expect(targetOptions.map((option) => option.id)).toEqual(["obj-2"]);
  });

  it("only shows objective-became and settled rules, never a beat/edge rule from the flow", () => {
    mocks.rows = [
      consequence({ id: "c-1", on_beat_id: "beat-fork", action: "complete", target_objective_id: "obj-1" }),
      consequence({ id: "c-2", on_edge_id: "edge-bridge", action: "fail", target_objective_id: "obj-1" }),
      consequence({ id: "c-3", on_objective_id: "obj-1", on_objective_status: "complete", after_days: 4, action: "raise", target_objective_id: "obj-2" }),
      consequence({ id: "c-4", on_quest_settled: true, action: "send_broadcast", action_payload: { message: "Done." } }),
    ];
    const rows = mountPanel().findAll("ul li");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('when "Keep the bridge standing" becomes completed');
    expect(rows[1]!.text()).toContain("when the quest settles");
  });

  it("removes a rule by id", async () => {
    mocks.rows = [
      consequence({ id: "c-1", on_quest_settled: true, action: "send_broadcast", action_payload: { message: "Done." } }),
    ];
    const wrapper = mountPanel();
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith({ id: "c-1", questId: "quest-1" });
  });
});
