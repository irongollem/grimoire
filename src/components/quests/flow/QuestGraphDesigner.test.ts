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
  useQuestBeatTransitionsForQuest: () => mocks.query(() => []),
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
      stubs: { QuestFlowCanvas: true, QuestPanel: { template: '<div data-test="quest-panel" />' }, QuestOpenedBeat: true, QuestPlayerPreviewDrawer: true, QuestRoutePanel: true, QuestSelectedBeatPanel: true },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("QuestGraphDesigner", () => {
  beforeEach(() => {
    mocks.beats = [beat({ id: "beat-1" })];
    mocks.objectives = [];
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
    mocks.objectives = [{ id: "obj-1", quest_id: "quest-1", description: "Find the miller", status: "dormant", is_player_visible: false, sort_order: 0, due_year: null, due_month: null, due_day: null } satisfies Partial<QuestObjective>];
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
});
