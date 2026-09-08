import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBackfillPanel from "./QuestBackfillPanel.vue";
import type {
  Quest,
  QuestBeat,
  QuestBeatEdge,
  QuestBeatTransition,
  QuestConsequence,
  QuestObjective,
  QuestRuntimeState,
} from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  beats: [] as QuestBeat[],
  edges: [] as QuestBeatEdge[],
  consequences: [] as QuestConsequence[],
  objectives: [] as QuestObjective[],
  transitions: [] as QuestBeatTransition[],
  runtimeState: null as QuestRuntimeState | null,
  assertRuntime: vi.fn(),
  activeCampaignId: "campaign-1" as string | null,
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { value: mocks.beats }, isLoading: { value: false } }),
  useQuestBeatEdges: () => ({ data: { value: mocks.edges }, isLoading: { value: false } }),
  useQuestConsequences: () => ({ data: { value: mocks.consequences } }),
  useQuestBeatTransitionsForQuest: () => ({ data: { value: mocks.transitions } }),
  useQuestRuntimeState: () => ({ data: { value: mocks.runtimeState } }),
  useAssertQuestRuntime: () => ({ mutateAsync: mocks.assertRuntime }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: mocks.objectives } }),
}));
vi.mock("@/composables/quests/useQuestThreads", () => ({
  useQuestThreads: () => ({ data: { value: [{ id: "thread-1", quest_id: "quest-1", status: "live", label: "Main" }] } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }),
}));

const quest = { id: "quest-1", title: "The Unseen" } as Quest;

function beat(id: string, title: string, kind = "neutral"): QuestBeat {
  return {
    id, quest_id: "quest-1", campaign_id: "campaign-1", title,
    dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
    rumor_text: null, reveal_text: null, visibility: "hidden", kind,
    presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null,
    improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "now",
  };
}

function edge(source_beat_id: string, target_beat_id: string): QuestBeatEdge {
  return {
    id: `${source_beat_id}-${target_beat_id}`, quest_id: "quest-1", campaign_id: "campaign-1", source_beat_id, target_beat_id,
    route_kind: "choice", thread_label: null, created_by: "dm", created_at: "now",
  };
}

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1", on_beat_id: null, on_edge_id: null, on_objective_id: null,
    on_objective_status: null, on_quest_settled: false, after_days: 0,
    action: "complete", target_objective_id: null, target_npc_id: null, target_quest_id: null, action_payload: {},
    created_at: "now", updated_at: "now",
    ...overrides,
  };
}

function transition(overrides: Partial<QuestBeatTransition> & { to_beat_id: string; created_at: string }): QuestBeatTransition {
  return {
    id: `t-${overrides.to_beat_id}-${overrides.created_at}`,
    campaign_id: "campaign-1",
    from_quest_id: "quest-1",
    from_beat_id: null,
    to_quest_id: "quest-1",
    transition_kind: "forward",
    reason: null,
    runtime_version: 1,
    from_quest_title: null,
    from_beat_title: null,
    to_quest_title: "The Unseen",
    to_beat_title: null,
    provenance: {},
    created_by: "dm",
    thread_id: "thread-1",
    ...overrides,
  };
}

function runtimeState(overrides: Partial<QuestRuntimeState> = {}): QuestRuntimeState {
  return {
    campaign_id: "campaign-1", quest_id: "quest-1", thread_id: "thread-1", current_beat_id: null, status: "idle",
    visit_stack: [], visit_index: 0, return_stack: [], version: 1, updated_by: "dm",
    created_at: "now", updated_at: "now",
    ...overrides,
  };
}

function mountPanel() {
  return mount(QuestBackfillPanel, { props: { quest } });
}

function findButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

describe("QuestBackfillPanel", () => {
  beforeEach(() => {
    mocks.beats = [];
    mocks.edges = [];
    mocks.consequences = [];
    mocks.objectives = [];
    mocks.transitions = [];
    mocks.runtimeState = null;
    mocks.activeCampaignId = "campaign-1";
    mocks.assertRuntime.mockReset();
  });

  it("shows an empty state when the quest has no beats to backfill", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Write a beat in Story flow");
    expect(findButton(wrapper, "Mark as played")).toBeUndefined();
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

  it("shows each row's own state, derived from the transition log and the cursor", () => {
    mocks.beats = [beat("a", "The Flooded Hall"), beat("b", "The Drowned Vault"), beat("c", "The Sunken Shrine")];
    mocks.edges = [edge("a", "b"), edge("b", "c")];
    mocks.transitions = [
      transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" }),
      transition({ to_beat_id: "b", transition_kind: "assert", reason: "Session 4", created_at: "2026-01-02T00:00:00Z" }),
    ];
    mocks.runtimeState = runtimeState({ current_beat_id: "b", status: "paused" });
    const wrapper = mountPanel();
    const items = wrapper.findAll("li").map((li) => li.text());

    expect(items[0]).toContain("Played");
    expect(items[1]).toContain("The party is here");
    expect(items[2]).toContain("Not played");
  });

  it("labels the cursor's beat as playing now while the runtime is running", () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    mocks.runtimeState = runtimeState({ current_beat_id: "a", status: "running" });
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Playing now");
  });

  it("selects only unplayed beats on 'Select all'", async () => {
    mocks.beats = [beat("a", "The Flooded Hall"), beat("b", "The Drowned Vault")];
    mocks.edges = [edge("a", "b")];
    mocks.transitions = [transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" })];
    const wrapper = mountPanel();

    await findButton(wrapper, "Select all")!.trigger("click");

    expect(wrapper.text()).toContain("1 of 2 selected");
  });

  it("disables both actions until at least one beat is selected", () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    const wrapper = mountPanel();
    expect(findButton(wrapper, "Mark as played")!.props("disabled")).toBe(true);
    expect(findButton(wrapper, "Mark as played and put the party here")!.props("disabled")).toBe(true);
  });

  it("names the last selected beat in the place-the-party action's label", async () => {
    mocks.beats = [beat("b", "The Drowned Vault"), beat("a", "The Flooded Hall")];
    mocks.edges = [edge("a", "b")];
    const wrapper = mountPanel();

    await findButton(wrapper, "Select all")!.trigger("click");

    expect(findButton(wrapper, "Mark as played and put the party at “The Drowned Vault”")).toBeDefined();
  });

  it("warns when a selected beat is already in the record", async () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    mocks.transitions = [transition({ to_beat_id: "a", transition_kind: "forward", created_at: "2026-01-01T00:00:00Z" })];
    const wrapper = mountPanel();

    await wrapper.find('input[type="checkbox"]').setValue(true);

    expect(wrapper.text()).toContain("1 of these is already in the record; recording it again appends a second entry.");
  });

  it("does not warn when every selected beat is unplayed", async () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    const wrapper = mountPanel();

    await wrapper.find('input[type="checkbox"]').setValue(true);

    expect(wrapper.text()).not.toContain("already in the record");
  });

  it("marks as played without placing the cursor when 'Mark as played' is used", async () => {
    mocks.beats = [beat("b", "The Drowned Vault"), beat("a", "The Flooded Hall")];
    mocks.edges = [edge("a", "b")];
    mocks.assertRuntime.mockResolvedValue({ asserted: 2, beats: ["The Flooded Hall", "The Drowned Vault"], cursor_placed: false, current_beat_id: null });
    const wrapper = mountPanel();

    await findButton(wrapper, "Select all")!.trigger("click");
    await wrapper.find('input[placeholder="Session 11"]').setValue("Session 4 recap");
    await findButton(wrapper, "Mark as played")!.trigger("click");
    await flushPromises();

    expect(mocks.assertRuntime).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-1",
      beatIds: ["a", "b"],
      placeCursor: false,
      reason: "Session 4 recap",
    });
    expect(wrapper.text()).toContain("Recorded 2 beats as played in Session 4 recap.");
    expect(wrapper.text()).not.toContain('"The Flooded Hall"');
  });

  it("places the cursor when the named action is used", async () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    mocks.assertRuntime.mockResolvedValue({ asserted: 1, beats: ["The Flooded Hall"], cursor_placed: true, current_beat_id: "a" });
    const wrapper = mountPanel();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await findButton(wrapper, "Mark as played and put the party at “The Flooded Hall”")!.trigger("click");
    await flushPromises();

    expect(mocks.assertRuntime).toHaveBeenCalledWith(expect.objectContaining({ placeCursor: true }));
    expect(wrapper.text()).toContain("Recorded 1 beat as played.");
  });

  it("clears the selection and reason after a successful record", async () => {
    mocks.beats = [beat("a", "The Flooded Hall")];
    mocks.assertRuntime.mockResolvedValue({ asserted: 1, beats: ["The Flooded Hall"], cursor_placed: false, current_beat_id: null });
    const wrapper = mountPanel();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await findButton(wrapper, "Mark as played")!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("0 of 1 selected");
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
    expect(findButton(wrapper, "Mark as played")!.props("disabled")).toBe(true);
  });
});
