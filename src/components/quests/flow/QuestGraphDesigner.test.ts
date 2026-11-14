import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestGraphDesigner from "./QuestGraphDesigner.vue";
import type { QuestBeat, QuestObjective } from "@/types/quest.types";

// Nothing else in the suite mounts the designer. A `useQuestSelection(...)`
// call placed above the computeds its immediate watcher reads threw a
// ReferenceError (temporal dead zone) on mount and took the whole quest screen
// with it while every other test stayed green. Mounting it is the guard.
// Plain objects, not refs: `vi.hoisted` runs before "vue" is evaluated.
const mocks = vi.hoisted(() => ({
  beats: [] as unknown[],
  edges: [] as unknown[],
  objectives: [] as unknown[],
  transitions: [] as unknown[],
  sessions: [] as unknown[],
  query: (data: () => unknown) => ({ data: { get value() { return data(); } }, isLoading: { value: false }, isSuccess: { value: true }, refetch: async () => ({ data: data() }) }),
  mutation: () => ({ mutateAsync: () => Promise.resolve(), isPending: { value: false } }),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeatAttachmentSummaries: () => mocks.query(() => []),
  useQuestBeatEdgeGates: () => mocks.query(() => []),
  useLootPlacements: () => mocks.query(() => []),
  useArchiveQuestBeat: mocks.mutation,
  useCreateQuestBeatWithRoute: mocks.mutation,
  useCreateQuestBeatEdge: mocks.mutation,
  useDeleteQuestBeatEdge: mocks.mutation,
  useQuestBeatEdges: () => mocks.query(() => mocks.edges),
  useQuestBeats: () => mocks.query(() => mocks.beats),
  useQuestBeatTransitionsForQuest: () => mocks.query(() => mocks.transitions),
  useUndoQuestMove: mocks.mutation,
  useQuestConsequences: () => mocks.query(() => []),
  useQuestRuntimeContext: () => mocks.query(() => undefined),
  useUpdateQuestBeatEdge: mocks.mutation,
  useSetQuestRouteGate: mocks.mutation,
  useSetQuestBeatPositions: mocks.mutation,
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/quests/useQuestThreads", () => ({ useQuestThreads: () => mocks.query(() => []) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => mocks.query(() => ({ id: "quest-1", title: "The Unseen", campaign_id: "campaign-1" })),
  useQuestObjectives: () => mocks.query(() => mocks.objectives),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => mocks.query(() => []) }));
vi.mock("@/composables/locations/useLocationDescriptions", () => ({ useLocationDescriptions: () => ({ data: { value: undefined } }) }));
vi.mock("@/composables/quests/useSiteBeatGaps", () => ({ useSiteBeatGaps: () => ({ readinessBySite: { value: {} } }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => mocks.query(() => mocks.sessions) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session: { value: null }, isRunning: { value: false } }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

function beat(overrides: Partial<QuestBeat> & { id: string }): QuestBeat {
  return {
    quest_id: "quest-1", title: "The mill", kind: "neutral", visibility: "hidden", dm_content: "Run it", how_it_plays: null,
    rumor_text: null, reveal_text: null, is_improvised: false, improv_reviewed_at: null, converge_mode: "any",
    staged_at_location_id: null, canvas_x: 0, canvas_y: 0, ...overrides,
  } as QuestBeat;
}

async function mountDesigner(path = "/quests/quest-1") {
  setActivePinia(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/quests/:id", component: { template: "<div />" } }] });
  await router.push(path);
  const wrapper = mount(QuestGraphDesigner, {
    props: { questId: "quest-1" },
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        QuestFlowCanvas: true,
        QuestColumn: { template: '<div data-test="quest-column" />' },
        QuestWide: { template: '<div data-test="quest-wide" />' },
        QuestBeatColumn: { props: ["sessionId", "beatId"], template: '<div data-test="beat-column" :data-session="sessionId" :data-beat="beatId" />' },
        QuestBeatWide: { template: '<div data-test="beat-wide" />' },
        QuestRouteColumn: { props: ["edgeId"], template: '<div data-test="route-column" :data-edge="edgeId" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("QuestGraphDesigner", () => {
  beforeEach(() => {
    mocks.beats = [beat({ id: "beat-1" })];
    mocks.edges = [];
    mocks.objectives = [];
    mocks.transitions = [];
    mocks.sessions = [];
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("mounts, with the toolbar and the quest drawer", async () => {
    const { wrapper } = await mountDesigner();
    expect(wrapper.text()).toContain("Add beat");
    expect(wrapper.find('[aria-label="Quest drawer"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="quest-column"]').exists()).toBe(true);
  });

  // Fails if the quest's wide part is not reachable with nothing selected, or shows while folded.
  it("shows the quest's wide part only when open=1 with nothing selected", async () => {
    expect((await mountDesigner()).wrapper.find('[data-test="quest-wide"]').exists()).toBe(false);
    const { wrapper } = await mountDesigner("/quests/quest-1?open=1");
    expect(wrapper.find('[data-test="quest-wide"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="quest-column"]').exists()).toBe(true);
  });

  // Fails if a beat mounts the quest's column, or its wide part ignores open.
  it("a selected beat mounts the beat column, and its wide part only when opened", async () => {
    const { wrapper } = await mountDesigner("/quests/quest-1?beat=beat-1");
    expect(wrapper.get('[data-test="beat-column"]').attributes("data-beat")).toBe("beat-1");
    expect(wrapper.find('[data-test="quest-column"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="beat-wide"]').exists()).toBe(false);
    const opened = await mountDesigner("/quests/quest-1?beat=beat-1&open=1");
    expect(opened.wrapper.find('[data-test="beat-wide"]').exists()).toBe(true);
  });

  // Fails if a route gets a wide part, even when the URL asks for one.
  it("a selected route mounts the route column and never a wide part", async () => {
    mocks.beats = [beat({ id: "beat-1" }), beat({ id: "beat-2" })];
    mocks.edges = [{ id: "edge-1", quest_id: "quest-1", source_beat_id: "beat-1", target_beat_id: "beat-2", route_kind: "choice" }];
    const { wrapper } = await mountDesigner("/quests/quest-1?edge=edge-1&open=1");
    expect(wrapper.get('[data-test="route-column"]').attributes("data-edge")).toBe("edge-1");
    expect(wrapper.find('[data-test="beat-wide"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="quest-wide"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Wide part"]').exists()).toBe(false);
  });

  it("lists a beat's prep gap in the tally, and picking it selects that beat", async () => {
    mocks.beats = [beat({ id: "beat-1", title: "The mill", dm_content: null })];
    const { wrapper, router } = await mountDesigner();
    const chip = wrapper.findAll("button").find((button) => button.text().includes("prep gaps"))!;
    expect(chip.text()).toContain("1 prep gaps");
    await chip.trigger("click");
    await flushPromises();
    const row = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Add DM guidance"))!;
    expect(row.textContent).toContain("The mill");
    row.click();
    await flushPromises();
    expect(router.currentRoute.value.query.beat).toBe("beat-1");
  });

  it("lists a wiring finding with no beat of its own, and does not offer to select it", async () => {
    mocks.objectives = [{ id: "obj-1", quest_id: "quest-1", description: "Find the miller", status: "dormant", sort_order: 0, due_year: null, due_month: null, due_day: null } satisfies Partial<QuestObjective>];
    const { wrapper, router } = await mountDesigner();
    const chip = wrapper.findAll("button").find((button) => button.text().includes("prep gaps"))!;
    await chip.trigger("click");
    await flushPromises();
    const row = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((el) => el.textContent?.includes("Find the miller"))!;
    expect(row).toBeDefined();
    expect(row.disabled).toBe(true);
    expect(router.currentRoute.value.query.beat).toBeUndefined();
  });

  it("shows no gap chip when nothing is missing", async () => {
    const { wrapper } = await mountDesigner();
    expect(wrapper.text()).not.toContain("prep gaps");
  });

  // Fails if the toolbar's session pick never reaches the panels that file marks.
  it("hands the chosen session to the beat column", async () => {
    mocks.sessions = [{ id: "s1", number: 11, title: null, played_on: null, started_at: "2026-02-01T18:00:00Z", ended_at: "2026-02-01T22:00:00Z", created_at: "2026-02-01T00:00:00Z" }];
    const { wrapper } = await mountDesigner("/quests/quest-1?beat=beat-1");
    expect(wrapper.get('[data-test="beat-column"]').attributes("data-session")).toBe("s1");
  });

  // Fails if the progress tally stays hidden behind a lens state that no longer exists.
  it("shows the progress tally without any lens", async () => {
    mocks.beats = [beat({ id: "b1", visibility: "revealed" }), beat({ id: "b2", visibility: "hidden" })];
    const { wrapper } = await mountDesigner();
    expect(wrapper.find('[aria-label="Story flow progress"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="What the party knows"]').exists()).toBe(false);
  });
});
