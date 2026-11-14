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
  useQuestBeatEdges: () => mocks.query(() => []),
  useQuestBeats: () => mocks.query(() => mocks.beats),
  useQuestBeatTransitionsForQuest: () => mocks.query(() => mocks.transitions),
  useUndoQuestMove: mocks.mutation,
  useQuestConsequences: () => mocks.query(() => []),
  useQuestRuntimeContext: () => mocks.query(() => undefined),
  useUpdateQuestBeatEdge: mocks.mutation,
  useSetQuestRouteGate: mocks.mutation,
  useSetQuestBeatPositions: mocks.mutation,
}));
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
        QuestPanel: { props: ["playersFirst"], template: '<div data-test="quest-panel" :data-players-first="playersFirst" />' },
        QuestOpenedBeat: true,
        QuestPlayerPreviewDrawer: true,
        QuestRoutePanel: true,
        QuestSelectedBeatPanel: { props: ["sessionId"], template: '<div data-test="beat-panel" :data-session="sessionId" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("QuestGraphDesigner", () => {
  beforeEach(() => {
    mocks.beats = [beat({ id: "beat-1" })];
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
    expect(wrapper.find('[data-test="quest-panel"]').exists()).toBe(true);
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
  it("hands the chosen session to the beat panel", async () => {
    mocks.sessions = [{ id: "s1", number: 11, title: null, played_on: null, started_at: "2026-02-01T18:00:00Z", ended_at: "2026-02-01T22:00:00Z", created_at: "2026-02-01T00:00:00Z" }];
    const { wrapper } = await mountDesigner("/quests/quest-1?beat=beat-1");
    expect(wrapper.get('[data-test="beat-panel"]').attributes("data-session")).toBe("s1");
  });

  // Fails if the lens swaps the tally text but leaves the DM tally, or the reverse.
  it("swaps the tally for what the party knows in Players' view", async () => {
    mocks.beats = [beat({ id: "b1", visibility: "revealed" }), beat({ id: "b2", visibility: "rumored" }), beat({ id: "b3", visibility: "hidden" }), beat({ id: "b4", visibility: "hidden" })];
    const { wrapper } = await mountDesigner();
    expect(wrapper.text()).not.toContain("revealed");
    await wrapper.findAll("button").find((b) => b.text().includes("Players' view"))!.trigger("click");
    await flushPromises();
    const text = wrapper.get('[aria-label="What the party knows"]').text();
    expect(text).toContain("1 revealed");
    expect(text).toContain("1 rumored");
    expect(text).toContain("2 hidden");
    expect(wrapper.get('[data-test="quest-panel"]').attributes("data-players-first")).toBe("true");
  });
});
