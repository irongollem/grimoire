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
  // #871: keyed by the ref's own current value, like the real composable —
  // `quest-sequel` has beats (one archived, excluded), `quest-empty` has none.
  useQuestBeats: (id: { value: string } | string) => ({
    data: { get value() {
      const targetId = typeof id === "string" ? id : id.value;
      if (targetId !== "quest-sequel") return [];
      return [
        { id: "beat-rumor", quest_id: "quest-sequel", title: "The rumor" },
        { id: "beat-cauldron", quest_id: "quest-sequel", title: "The cauldron surfaces" },
        { id: "beat-old", quest_id: "quest-sequel", title: "An old, retired scene", kind: "archived" },
      ];
    } },
  }),
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
    { id: "quest-sequel", title: "The stolen cauldron", status: "undiscovered", entry_beat_id: "beat-rumor" },
    { id: "quest-empty", title: "The empty ledger", status: "undiscovered", entry_beat_id: null },
  ] } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { value: [{ id: "npc-1", name: "Oarus Masthew" }] } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [
    { id: "loc-crypt", name: "The Sunken Crypt", depth: 0 },
    { id: "loc-vault", name: "The Inner Vault", depth: 1 },
  ] } }),
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
    entry_beat_id: null,
    on_quest_settled: false,
    on_location_id: null,
    on_location_fact: null,
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
    expect(options.map((option) => option.attributes("value"))).toEqual(["settled", "objective", "location"]);
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
      on_location_id: null,
      on_location_fact: null,
      after_days: 2,
      action: "create_calendar_event",
      target_objective_id: null,
      target_npc_id: null,
      target_quest_id: null,
      entry_beat_id: null,
      action_payload: { title: "The cult reveals itself", event_type: "quest" },
    });
  });

  it("reveals the place and fact pickers once the condition is 'location'", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[0]!.setValue("location");
    expect(comboboxes(wrapper)).toHaveLength(2);
    const factOptions = wrapper.findAll("select")[1]!.findAll("option");
    expect(factOptions.map((option) => option.attributes("value"))).toEqual(["explored", "cleared", "looted"]);
  });

  it("authors a location-fact rule", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll("select")[0]!.setValue("location");
    comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "loc-crypt");
    await flushPromises();
    await wrapper.findAll("select")[1]!.setValue("cleared");
    await wrapper.findAll("select")[2]!.setValue("complete");
    comboboxes(wrapper)[1]!.vm.$emit("update:modelValue", "obj-1");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      on_objective_id: null,
      on_objective_status: null,
      on_quest_settled: false,
      on_location_id: "loc-crypt",
      on_location_fact: "cleared",
      action: "complete",
      target_objective_id: "obj-1",
    }));
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

  it("only shows objective-became, settled and location-fact rules, never a beat/edge rule from the flow", () => {
    mocks.rows = [
      consequence({ id: "c-1", on_beat_id: "beat-fork", action: "complete", target_objective_id: "obj-1" }),
      consequence({ id: "c-2", on_edge_id: "edge-bridge", action: "fail", target_objective_id: "obj-1" }),
      consequence({ id: "c-3", on_objective_id: "obj-1", on_objective_status: "complete", after_days: 4, action: "raise", target_objective_id: "obj-2" }),
      consequence({ id: "c-4", on_quest_settled: true, action: "send_broadcast", action_payload: { message: "Done." } }),
      consequence({ id: "c-5", on_location_id: "loc-crypt", on_location_fact: "cleared", action: "complete", target_objective_id: "obj-2" }),
    ];
    const rows = mountPanel().findAll("ul li");

    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain('when "Keep the bridge standing" becomes completed');
    expect(rows[1]!.text()).toContain("when the quest settles");
    expect(rows[2]!.text()).toContain('when "The Sunken Crypt" is cleared');
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

  // #871: the "Enters at" combobox on the unlock_quest action.
  describe("the entry-beat bridge on a quest unlock", () => {
    async function selectUnlockAction(wrapper: ReturnType<typeof mountPanel>) {
      await wrapper.findAll("select")[1]!.setValue("unlock_quest");
    }

    it("preselects the target's own entry beat, marked in its option name", async () => {
      const wrapper = mountPanel();
      await selectUnlockAction(wrapper);
      comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();

      const boxes = comboboxes(wrapper);
      expect(boxes).toHaveLength(2);
      expect(boxes[1]!.props("modelValue")).toBe("beat-rumor");
      const options = boxes[1]!.props("options") as Array<{ id: string; name: string }>;
      expect(options.map((o) => o.id)).toEqual(["beat-rumor", "beat-cauldron"]);
      expect(options.find((o) => o.id === "beat-rumor")!.name).toBe("The rumor · entry");
    });

    it("writes null when the entry beat stays selected", async () => {
      const wrapper = mountPanel();
      await selectUnlockAction(wrapper);
      comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();

      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        action: "unlock_quest",
        target_quest_id: "quest-sequel",
        entry_beat_id: null,
      }));
    });

    it("writes the chosen beat id when the DM picks a beat other than the entry", async () => {
      const wrapper = mountPanel();
      await selectUnlockAction(wrapper);
      comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();
      comboboxes(wrapper)[1]!.vm.$emit("update:modelValue", "beat-cauldron");
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();

      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        action: "unlock_quest",
        target_quest_id: "quest-sequel",
        entry_beat_id: "beat-cauldron",
      }));
    });

    it("shows a no-beats caption instead of a combobox when the target has no beats yet", async () => {
      const wrapper = mountPanel();
      await selectUnlockAction(wrapper);
      comboboxes(wrapper)[0]!.vm.$emit("update:modelValue", "quest-empty");
      await flushPromises();

      expect(comboboxes(wrapper)).toHaveLength(1);
      expect(wrapper.text()).toContain("This quest has no beats yet — it will open at whichever beat is written first.");
    });

    it("describes an existing unlock rule by its target quest and entry beat", () => {
      mocks.rows = [
        consequence({ id: "c-unlock", on_quest_settled: true, action: "unlock_quest", target_quest_id: "quest-sequel", entry_beat_id: "beat-cauldron" }),
      ];
      const wrapper = mountPanel();
      expect(wrapper.findAll("ul li")[0]!.text()).toContain('Unlock "The stolen cauldron" · enters at "The cauldron surfaces"');
    });
  });
});
