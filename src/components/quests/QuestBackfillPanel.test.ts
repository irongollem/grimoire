import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBackfillPanel from "./QuestBackfillPanel.vue";
import type {
  Quest,
  QuestBeat,
  QuestBeatEdge,
  QuestConsequence,
  QuestObjective,
} from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  beats: [] as QuestBeat[],
  edges: [] as QuestBeatEdge[],
  consequences: [] as QuestConsequence[],
  objectives: [] as QuestObjective[],
  assertRuntime: vi.fn(),
  activeCampaignId: "campaign-1" as string | null,
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { value: mocks.beats }, isLoading: { value: false } }),
  useQuestBeatEdges: () => ({ data: { value: mocks.edges }, isLoading: { value: false } }),
  useQuestConsequences: () => ({ data: { value: mocks.consequences } }),
  useAssertQuestRuntime: () => ({ mutateAsync: mocks.assertRuntime }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: mocks.objectives } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }),
}));

const quest = { id: "quest-1", title: "The Unseen" } as Quest;

function beat(id: string, title: string, kind = "neutral"): QuestBeat {
  return {
    id, quest_id: "quest-1", campaign_id: "campaign-1", title,
    dm_content: null, read_aloud: null, how_it_plays: null, outcomes: null, consequences: null,
    rumor_text: null, reveal_text: null, visibility: "hidden", kind,
    presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null,
    improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "now",
  };
}

function edge(source_beat_id: string, target_beat_id: string): QuestBeatEdge {
  return { id: `${source_beat_id}-${target_beat_id}`, quest_id: "quest-1", campaign_id: "campaign-1", source_beat_id, target_beat_id, created_by: "dm", created_at: "now" };
}

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1", on_beat_id: null, on_edge_id: null, on_objective_id: null,
    on_objective_status: null, on_quest_settled: false, after_days: 0,
    action: "complete", target_objective_id: null, action_payload: {},
    created_at: "now", updated_at: "now",
    ...overrides,
  };
}

function mountPanel() {
  return mount(QuestBackfillPanel, { props: { quest } });
}

describe("QuestBackfillPanel", () => {
  beforeEach(() => {
    mocks.beats = [];
    mocks.edges = [];
    mocks.consequences = [];
    mocks.objectives = [];
    mocks.activeCampaignId = "campaign-1";
    mocks.assertRuntime.mockReset();
  });

  it("shows an empty state when the quest has no beats to backfill", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Write a beat in Story flow");
    expect(wrapper.findAllComponents({ name: "AppButton" }).some((b) => b.props("label") === "Record")).toBe(false);
  });

  // The point of a backfill is that the order is the story's order, not the
  // order beats happen to have been authored in (#796).
  it("lists beats in story order, not creation order", () => {
    mocks.beats = [beat("b", "The Drowned Vault"), beat("a", "The Flooded Hall")];
    mocks.edges = [edge("a", "b")];
    const wrapper = mountPanel();
    const items = wrapper.findAll("li").map((li) => li.text());
    expect(items[0]).toContain("The Flooded Hall");
    expect(items[1]).toContain("The Drowned Vault");
  });

  it("disables Record until at least one beat is selected", () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    const wrapper = mountPanel();
    const recordButton = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Record")!;
    expect(recordButton.props("disabled")).toBe(true);
  });

  it("submits selected beats in story order with the reason and cursor-placement toggle", async () => {
    mocks.beats = [beat("b", "The Drowned Vault"), beat("a", "The Flooded Hall")];
    mocks.edges = [edge("a", "b")];
    mocks.assertRuntime.mockResolvedValue({ asserted: 2, beats: ["The Flooded Hall", "The Drowned Vault"], cursor_placed: true, current_beat_id: "b" });
    const wrapper = mountPanel();

    const selectAll = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Select all")!;
    await selectAll.trigger("click");
    await wrapper.find('input[placeholder="Session name or note — why these rows exist…"]').setValue("Session 4 recap");

    const recordButton = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Record")!;
    await recordButton.trigger("click");
    await flushPromises();

    expect(mocks.assertRuntime).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      questId: "quest-1",
      beatIds: ["a", "b"],
      placeCursor: true,
      reason: "Session 4 recap",
    });
    expect(wrapper.text()).toContain('Recorded 2 beats: "The Flooded Hall", "The Drowned Vault"');
    expect(wrapper.text()).toContain('The party is now placed at "The Drowned Vault"');
  });

  it("previews only the consequence rules attached directly to a selected beat's arrival", async () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    mocks.objectives = [{ id: "obj-1", quest_id: "quest-1", description: "Find the missing miller", status: "pending", is_player_visible: false, sort_order: 0 }];
    mocks.consequences = [
      consequence({ id: "c1", on_beat_id: "a", action: "complete", target_objective_id: "obj-1" }),
      // Not shown: a route-triggered rule (assert never fires on_edge_id conditions).
      consequence({ id: "c2", on_edge_id: "some-edge", action: "fail", target_objective_id: "obj-1" }),
    ];
    const wrapper = mountPanel();
    await wrapper.find('input[type="checkbox"]').setValue(true);

    expect(wrapper.text()).toContain('Complete "Find the missing miller"');
    expect(wrapper.text()).not.toContain('Fail "Find the missing miller"');
  });

  it("does not submit without an active campaign", async () => {
    mocks.activeCampaignId = null;
    mocks.beats = [beat("a", "The Flooded Hall")];
    const wrapper = mountPanel();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    const recordButton = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Record")!;
    expect(recordButton.props("disabled")).toBe(true);
  });
});
