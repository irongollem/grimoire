import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestConsequencesPanel from "./QuestConsequencesPanel.vue";
import type { QuestBeat, QuestBeatEdge, QuestConsequence } from "@/types/quest.types";

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
}));

const beat = { id: "beat-fork", quest_id: "quest-1", campaign_id: "campaign-1", title: "The fork" } as QuestBeat;
const beats = [
  beat,
  { id: "beat-high", quest_id: "quest-1", campaign_id: "campaign-1", title: "The high road" },
  { id: "beat-bridge", quest_id: "quest-1", campaign_id: "campaign-1", title: "The bridge crossing" },
  { id: "beat-end", quest_id: "quest-1", campaign_id: "campaign-1", title: "Journey's end" },
] as QuestBeat[];
const edges = [
  { id: "edge-high", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-high" },
  { id: "edge-bridge", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-bridge" },
  // Belongs to a different beat, so it must not be offered here.
  { id: "edge-elsewhere", quest_id: "quest-1", source_beat_id: "beat-high", target_beat_id: "beat-end" },
] as QuestBeatEdge[];

function mountBeatPanel() {
  return mount(QuestConsequencesPanel, {
    props: { scope: "beat", questId: "quest-1", beat, edges, beats },
    global: { stubs: { EntityCombobox: true } },
  });
}

function mountQuestPanel() {
  return mount(QuestConsequencesPanel, {
    props: { scope: "quest", questId: "quest-1" },
    global: { stubs: { EntityCombobox: true } },
  });
}

function comboboxes(wrapper: ReturnType<typeof mountQuestPanel>) {
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
    action_payload: {},
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("QuestConsequencesPanel — beat scope", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.rows = [];
  });

  it("offers arrival and only this beat's own branches as the condition", () => {
    const options = mountBeatPanel().findAll("select")[0]!.findAll("option");
    expect(options.map((option) => option.attributes("value"))).toEqual(["", "edge-high", "edge-bridge"]);
    expect(options.map((option) => option.text())).toEqual([
      "On arriving at this beat",
      "On taking the route to The high road",
      "On taking the route to The bridge crossing",
    ]);
  });

  it("attaches a branch rule to the edge, never to the beat it leads to", async () => {
    const wrapper = mountBeatPanel();
    await wrapper.findAll("select")[0]!.setValue("edge-bridge");
    // Action select first — it clears any already-picked target, so the
    // target objective must be picked after it, matching the real form.
    await wrapper.findAll("select")[1]!.setValue("fail");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "obj-1");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith({
      quest_id: "quest-1",
      on_beat_id: null,
      on_edge_id: "edge-bridge",
      on_objective_id: null,
      on_objective_status: null,
      on_quest_settled: false,
      after_days: 0,
      action: "fail",
      target_objective_id: "obj-1",
      action_payload: {},
    });
  });

  it("authors an arrival rule with a delay and a world action", async () => {
    const wrapper = mountBeatPanel();
    await wrapper.findAll("select")[1]!.setValue("send_broadcast");
    await wrapper.find('input[type="number"]').setValue(3);
    await wrapper.find('input[placeholder="Broadcast message…"]').setValue("The cult notices.");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      on_beat_id: "beat-fork",
      on_edge_id: null,
      after_days: 3,
      action: "send_broadcast",
      target_objective_id: null,
      action_payload: { message: "The cult notices." },
    }));
  });

  it("lists the rules that belong to this beat and ignores the rest of the quest", () => {
    mocks.rows = [
      consequence({ id: "c-1", on_beat_id: "beat-fork", action: "reveal", target_objective_id: "obj-1" }),
      consequence({ id: "c-2", on_edge_id: "edge-bridge", action: "fail", target_objective_id: "obj-1" }),
      consequence({ id: "c-3", on_edge_id: "edge-elsewhere", action: "complete", target_objective_id: "obj-1" }),
      consequence({ id: "c-4", on_objective_id: "obj-1", on_objective_status: "complete", action: "complete", target_objective_id: "obj-2" }),
    ];
    const rows = mountBeatPanel().findAll("ul li");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("on arrival");
    expect(rows[1]!.text()).toContain('on taking the route to "The bridge crossing"');
  });

  it("names an objective deleted out from under a rule instead of rendering a blank row", () => {
    mocks.rows = [
      consequence({ id: "c-1", on_beat_id: "beat-fork", action: "complete", target_objective_id: "gone" }),
    ];
    expect(mountBeatPanel().get("ul li").text()).toContain("Objective removed");
  });

  it("shows a delayed world action with a lightning glyph rather than a ledger-verb pill", () => {
    mocks.rows = [
      consequence({ id: "c-1", on_beat_id: "beat-fork", after_days: 5, action: "create_calendar_event", action_payload: { title: "The bridge falls", event_type: "deadline" } }),
    ];
    const row = mountBeatPanel().get("ul li");
    expect(row.text()).toContain('Calendar event: "The bridge falls"');
    expect(row.text()).toContain("(+5d)");
    expect(row.findComponent({ name: "QuestObjectiveStatusMark" }).exists()).toBe(false);
  });
});

describe("QuestConsequencesPanel — quest scope", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.rows = [];
  });

  it("defaults to the quest-settled condition and hides the objective picker", () => {
    const wrapper = mountQuestPanel();
    const options = wrapper.findAll("select")[0]!.findAll("option");
    expect(options.map((option) => option.attributes("value"))).toEqual(["settled", "objective"]);
    // Only the action's own target-objective combobox is offered yet.
    expect(comboboxes(wrapper)).toHaveLength(1);
  });

  it("reveals the objective and status pickers once the condition is 'objective'", async () => {
    const wrapper = mountQuestPanel();
    await wrapper.findAll("select")[0]!.setValue("objective");
    expect(comboboxes(wrapper)).toHaveLength(2);
    const statusOptions = wrapper.findAll("select")[1]!.findAll("option");
    expect(statusOptions.map((option) => option.attributes("value"))).toEqual(["pending", "complete", "failed"]);
  });

  it("authors an objective-became rule with a delayed world action", async () => {
    const wrapper = mountQuestPanel();
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
      action_payload: { title: "The cult reveals itself", event_type: "quest" },
    });
  });

  it("authors a quest-settled rule", async () => {
    const wrapper = mountQuestPanel();
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
    const wrapper = mountQuestPanel();
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
    const rows = mountQuestPanel().findAll("ul li");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('when "Keep the bridge standing" becomes completed');
    expect(rows[1]!.text()).toContain("when the quest settles");
  });

  it("removes a rule by id", async () => {
    mocks.rows = [
      consequence({ id: "c-1", on_quest_settled: true, action: "send_broadcast", action_payload: { message: "Done." } }),
    ];
    const wrapper = mountQuestPanel();
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith({ id: "c-1", questId: "quest-1" });
  });
});
