import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatObjectivesPanel from "./QuestBeatObjectivesPanel.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  effects: [] as unknown[],
}));

vi.mock("@/composables/useQuestFlow", () => ({
  useQuestObjectiveEffects: () => ({ data: { get value() { return mocks.effects; } } }),
  useCreateQuestObjectiveEffect: () => ({ mutateAsync: mocks.create }),
  useDeleteQuestObjectiveEffect: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [
    { id: "obj-1", quest_id: "quest-1", description: "Keep the bridge standing", status: "pending", is_player_visible: true, sort_order: 1 },
  ] } }),
}));

const beat = { id: "beat-fork", quest_id: "quest-1", campaign_id: "campaign-1", title: "The fork" } as QuestBeat;
const edges = [
  { id: "edge-high", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-high", label: "Take the high road" },
  { id: "edge-bridge", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-bridge", label: "Cross the bridge" },
  // Belongs to a different beat, so it must not be offered here.
  { id: "edge-elsewhere", quest_id: "quest-1", source_beat_id: "beat-high", target_beat_id: "beat-end", label: "Press on" },
] as QuestBeatEdge[];

function mountPanel() {
  return mount(QuestBeatObjectivesPanel, {
    props: { beat, edges },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestBeatObjectivesPanel", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.effects = [];
  });

  it("offers arrival and only this beat's own branches as triggers", () => {
    const options = mountPanel().findAll("select")[0]!.findAll("option");
    expect(options.map((option) => option.attributes("value"))).toEqual(["beat", "edge-high", "edge-bridge"]);
    expect(options.map((option) => option.text())).toEqual([
      "On arriving at this beat",
      "On taking: Take the high road",
      "On taking: Cross the bridge",
    ]);
  });

  it("attaches a branch rule to the edge, never to the beat it leads to", async () => {
    const wrapper = mountPanel();
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "obj-1");
    await wrapper.findAll("select")[0]!.setValue("edge-bridge");
    await wrapper.findAll("select")[1]!.setValue("fail");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith({
      quest_id: "quest-1",
      objective_id: "obj-1",
      trigger_beat_id: null,
      trigger_edge_id: "edge-bridge",
      effect: "fail",
    });
  });

  it("lists the rules that belong to this beat and ignores the rest of the quest", () => {
    mocks.effects = [
      { id: "fx-1", quest_id: "quest-1", objective_id: "obj-1", trigger_beat_id: "beat-fork", trigger_edge_id: null, effect: "reveal" },
      { id: "fx-2", quest_id: "quest-1", objective_id: "obj-1", trigger_beat_id: null, trigger_edge_id: "edge-bridge", effect: "fail" },
      { id: "fx-3", quest_id: "quest-1", objective_id: "obj-1", trigger_beat_id: null, trigger_edge_id: "edge-elsewhere", effect: "complete" },
      { id: "fx-4", quest_id: "quest-1", objective_id: "obj-1", trigger_beat_id: "beat-other", trigger_edge_id: null, effect: "complete" },
    ];
    const rows = mountPanel().findAll("ul li");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("on arrival");
    expect(rows[1]!.text()).toContain('on taking "Cross the bridge"');
  });

  it("names an objective deleted out from under a rule instead of rendering a blank row", () => {
    mocks.effects = [
      { id: "fx-1", quest_id: "quest-1", objective_id: "gone", trigger_beat_id: "beat-fork", trigger_edge_id: null, effect: "complete" },
    ];
    expect(mountPanel().get("ul li").text()).toContain("Objective removed");
  });
});
