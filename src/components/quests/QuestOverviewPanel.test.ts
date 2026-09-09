import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestOverviewPanel from "./QuestOverviewPanel.vue";
import type { Quest, QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  beats: [] as QuestBeat[],
  edges: [] as QuestBeatEdge[],
  createBeat: vi.fn(),
  push: vi.fn(),
  route: { query: {} as Record<string, string> },
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { value: mocks.beats }, isLoading: { value: false } }),
  useQuestBeatEdges: () => ({ data: { value: mocks.edges }, isLoading: { value: false } }),
  useQuestBeatEdgeGates: () => ({ data: { value: [] }, isLoading: { value: false } }),
  useQuestConsequences: () => ({ data: { value: [] }, isLoading: { value: false } }),
  useCreateQuestBeatWithRoute: () => ({ mutateAsync: mocks.createBeat }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [] }, isLoading: { value: false } }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}));

const quest = {
  id: "quest-1",
  title: "The Unseen",
  status: "active",
  entry_beat_id: null,
} as Quest;

const beat = (id: string, title: string): QuestBeat => ({
  id, quest_id: "quest-1", campaign_id: "campaign-1", title,
  dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
  rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral",
  presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null,
  improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "now",
});

function mountPanel(questOverrides: Partial<Quest> = {}) {
  return mount(QuestOverviewPanel, {
    props: { quest: { ...quest, ...questOverrides } },
    global: {
      stubs: {
        QuestOverviewMetadata: true,
        QuestOverviewLifecycle: true,
        RouterLink: RouterLinkStub,
      },
    },
  });
}

describe("QuestOverviewPanel", () => {
  beforeEach(() => {
    mocks.beats = [];
    mocks.edges = [];
    mocks.route.query = {};
    mocks.createBeat.mockReset();
    mocks.push.mockReset();
  });

  it("presents the quest dossier in place rather than as an overlay", () => {
    const wrapper = mountPanel();
    expect(wrapper.get("section").attributes("aria-label")).toBe("Quest overview");
    // No dialog, no backdrop: it is a surface of the quest screen, not a layer
    // over one, so nothing here traps focus or needs dismissing.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Close quest overview"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "QuestOverviewMetadata" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "QuestOverviewLifecycle" }).exists()).toBe(true);
    wrapper.unmount();
  });

  // The overview beat (a stored `is_overview` row with its own editor) is gone
  // (#793) — a beatless quest gets the honest empty state instead, and the
  // beat it creates is the ordinary `create_quest_beat_with_route` path every
  // other beat uses.
  it("offers to write the opening beat when the quest has none, and lands on it in Story flow", async () => {
    mocks.createBeat.mockResolvedValue(beat("beat-new", "Opening beat"));
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Write the opening beat");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(mocks.createBeat).toHaveBeenCalledWith(expect.objectContaining({ questId: "quest-1" }));
    expect(mocks.push).toHaveBeenCalledWith({ query: { view: "work", beat: "beat-new" } });
  });

  it("lists every graph root as a link into Story flow, never a beat with an incoming route", () => {
    mocks.beats = [beat("a", "The tavern"), beat("b", "The docks"), beat("c", "The cave")];
    mocks.edges = [
      { id: "e", quest_id: "quest-1", campaign_id: "campaign-1", source_beat_id: "a", target_beat_id: "c", route_kind: "choice", thread_label: null, created_by: "dm", created_at: "now" },
    ];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("The tavern");
    expect(wrapper.text()).toContain("The docks");
    expect(wrapper.text()).not.toContain("The cave");
  });

  it("shows Opens at, with the entry beat first and tagged with its chip", () => {
    mocks.beats = [beat("a", "The tavern"), beat("b", "The docks")];
    mocks.edges = [];
    const wrapper = mountPanel({ entry_beat_id: "b" });
    expect(wrapper.get("h3").text()).toBe("Opens at");
    const items = wrapper.findAll("li").map((li) => li.text());
    expect(items[0]).toContain("entry");
    expect(items[0]).toContain("The docks");
    expect(items[0]).not.toContain("not a root");
    expect(items[1]).toContain("The tavern");
  });

  it("still leads with the entry when the DM chose a beat that is not a computed root, and captions it", () => {
    mocks.beats = [beat("a", "The tavern"), beat("b", "The docks")];
    mocks.edges = [
      { id: "e", quest_id: "quest-1", campaign_id: "campaign-1", source_beat_id: "a", target_beat_id: "b", route_kind: "choice", thread_label: null, created_by: "dm", created_at: "now" },
    ];
    const wrapper = mountPanel({ entry_beat_id: "b" });
    const items = wrapper.findAll("li").map((li) => li.text());
    expect(items[0]).toContain("entry · not a root");
    expect(items[0]).toContain("The docks");
    // "a" is the sole computed root and is listed after the entry.
    expect(items[1]).toContain("The tavern");
  });
});
