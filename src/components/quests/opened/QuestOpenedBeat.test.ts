import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestOpenedBeat from "./QuestOpenedBeat.vue";
import type { QuestBeat, QuestRuntimeContext } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  beats: [] as unknown[],
  attachments: [] as unknown[],
  context: null as unknown,
  site: null as unknown,
  markMove: vi.fn(),
  undoMove: vi.fn(),
  updateBeat: vi.fn(),
  shareIfBeatSeen: vi.fn(),
  updateLocation: vi.fn(),
}));
const query = (data: () => unknown) => ({ data: { get value() { return data(); } }, isLoading: { value: false } });

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => query(() => mocks.beats),
  useQuestBeatEdges: () => query(() => []),
  useQuestBeatAttachmentSummaries: () => query(() => mocks.attachments),
  useLootPlacements: () => query(() => []),
  useQuestConsequences: () => query(() => []),
  useQuestBeatTransitionsForQuest: () => query(() => []),
  useQuestRuntimeContext: () => query(() => mocks.context),
  useMarkQuestMove: () => ({ mutateAsync: mocks.markMove, isPending: ref(false) }),
  useUndoQuestMove: () => ({ mutateAsync: mocks.undoMove, isPending: ref(false) }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.updateBeat }),
}));
vi.mock("@/composables/quests/useShareQuest", () => ({ useShareQuest: () => ({ shareIfBeatSeen: mocks.shareIfBeatSeen }) }));
vi.mock("@/composables/quests/useBeatStagedSite", () => ({ useBeatStagedSite: () => ({ stagedLocation: { value: null }, siteWithRooms: { get value() { return mocks.site; } } }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/lib/quests/run", async (original) => ({ ...(await original<typeof import("@/lib/quests/run")>()), lootHeldByTheRun: () => [] }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));

function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "The mill", kind: "explore", visibility: "hidden",
    dm_content: null, how_it_plays: null, read_aloud: null, staged_at_location_id: null, updated_at: "2026-11-13T00:00:00Z",
    ...overrides,
  } as QuestBeat;
}
function context(overrides: Partial<QuestRuntimeContext> = {}): QuestRuntimeContext {
  return {
    state: { status: "running", campaign_id: "campaign-1", version: 3 }, current: beat(), previous: null, outgoing: [],
    return_target: null, path_so_far: [], thread: { id: "thread-1" }, threads: [], held: [], ...overrides,
  } as unknown as QuestRuntimeContext;
}

const stubs = {
  QuestPhoneTopBar: true, QuestThreadBar: true, QuestSiteHandoff: { name: "QuestSiteHandoff", template: "<div data-test='site' />" },
  QuestOpenedRail: { name: "QuestOpenedRail", emits: ["reveal", "preview"], template: "<button data-test='reveal' @click=\"$emit('reveal')\" />" },
  QuestOpenedPrep: { name: "QuestOpenedPrep", props: ["partyHere"], template: "<div />" },
  QuestAdvanceDialog: { name: "QuestAdvanceDialog", props: ["preselectedEdgeId"], template: "<div data-test='advance-dialog' />" },
  QuestPlayerPreviewDrawer: true, QuestRunContainedTool: true, DockBar: { template: "<div data-test='dock'><slot /></div>" },
};

async function mountOpened(partyBeatId: string | null = "beat-1", path = "/quests/quest-1") {
  setActivePinia(createPinia());
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/quests/:id", component: { template: "<div />" } }] });
  await router.push(path);
  const wrapper = mount(QuestOpenedBeat, {
    props: {
      questId: "quest-1", beatId: "beat-1", quest: null, threads: [], focusThreadId: "thread-1",
      currentBeatIdByThread: { "thread-1": partyBeatId }, presentations: {},
    },
    global: { plugins: [router], stubs },
  });
  await flushPromises();
  return { wrapper, router };
}
const button = (wrapper: Awaited<ReturnType<typeof mountOpened>>["wrapper"], label: string) =>
  wrapper.findAllComponents({ name: "AppButton" }).filter((b) => b.text().includes(label));

describe("QuestOpenedBeat", () => {
  beforeEach(() => {
    mocks.beats = [beat()];
    mocks.attachments = [];
    mocks.context = context();
    mocks.site = null;
    for (const fn of [mocks.markMove, mocks.undoMove, mocks.updateBeat, mocks.shareIfBeatSeen, mocks.updateLocation]) fn.mockReset();
  });

  // Bug: Advance offered on a beat the party is not at would move the cursor from somewhere else.
  it("offers Advance and Undo when the party is here, and no Put the party here", async () => {
    const { wrapper } = await mountOpened("beat-1");
    expect(button(wrapper, "Advance").length).toBeGreaterThan(0);
    expect(button(wrapper, "Undo").length).toBeGreaterThan(0);
    expect(button(wrapper, "Put the party here")).toHaveLength(0);
    expect(wrapper.text()).toContain("Party is here");
  });

  it("offers Put the party here, never Advance, when the party is elsewhere, and marks a party_here move", async () => {
    const { wrapper } = await mountOpened("beat-9");
    expect(button(wrapper, "Advance")).toHaveLength(0);
    expect(button(wrapper, "Undo")).toHaveLength(0);
    await button(wrapper, "Put the party here")[0]!.trigger("click");
    expect(mocks.markMove).toHaveBeenCalledWith({ campaignId: "campaign-1", questId: "quest-1", threadId: "thread-1", kind: "party_here", beatId: "beat-1" });
  });

  // Bug: Undo scoped to one thread would leave the quest's newest move, made on another thread, in place.
  it("undoes with no thread, so the quest's newest move is taken back", async () => {
    const { wrapper } = await mountOpened("beat-1");
    await button(wrapper, "Undo")[0]!.trigger("click");
    expect(mocks.undoMove).toHaveBeenCalledWith({ campaignId: "campaign-1", questId: "quest-1" });
  });

  // Bug: a thread parked at a converge beat is `waiting`; the server refuses its advance.
  it("disables Advance while the thread is not running", async () => {
    mocks.context = context({ state: { status: "waiting", campaign_id: "campaign-1", version: 3 } as QuestRuntimeContext["state"] });
    const { wrapper } = await mountOpened("beat-1");
    expect(button(wrapper, "Advance")[0]!.props("disabled")).toBe(true);
  });

  it("opens the Advance dialog preselected on the chosen route", async () => {
    mocks.context = context({ outgoing: [{ edge_id: "edge-1", beat_id: "beat-2", beat_title: "The cellar", route_kind: "choice", gate: null }] as unknown as QuestRuntimeContext["outgoing"] });
    const { wrapper } = await mountOpened("beat-1");
    await wrapper.find("ul button").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent({ name: "QuestAdvanceDialog" }).props("preselectedEdgeId")).toBe("edge-1");
  });

  // Bug: a closed route offered as a way forward.
  it("lists the routes out with their kind, and disables a gated one", async () => {
    mocks.context = context({ outgoing: [
      { edge_id: "edge-1", beat_title: "The cellar", route_kind: "choice", gate: null },
      { edge_id: "edge-2", beat_title: "The attic", route_kind: "parallel", gate: { is_open: false, conditions: [{ met: false, objective: "Find the key" }] } },
    ] as unknown as QuestRuntimeContext["outgoing"] });
    const { wrapper } = await mountOpened("beat-1");
    const rows = wrapper.findAll("ul button");
    expect(rows[0]!.text()).toContain("choice");
    expect(rows[1]!.text()).toContain("alongside");
    expect(rows[1]!.attributes("disabled")).toBeDefined();
    expect(rows[1]!.text()).toContain("needs Find the key");
  });

  // Bug: the site's own room stack and the beat's read-aloud both open in full, pushing the rooms off screen.
  it("folds the beat's read-aloud to one line at a site, and shows it whole without one", async () => {
    mocks.site = { id: "site-1", is_map_shared: false };
    const atSite = await mountOpened("beat-1");
    expect(atSite.wrapper.find('[data-test="site"]').exists()).toBe(true);
    expect(atSite.wrapper.findComponent({ name: "QuestOpenedReadAloud" }).props("folded")).toBe(true);
    mocks.site = null;
    const plain = await mountOpened("beat-1");
    expect(plain.wrapper.find('[data-test="site"]').exists()).toBe(false);
    expect(plain.wrapper.findComponent({ name: "QuestOpenedReadAloud" }).props("folded")).toBe(false);
  });

  it("moves Show map to players and Leave site into the header, and Leave site hands the middle back", async () => {
    mocks.site = { id: "site-1", is_map_shared: false };
    const { wrapper } = await mountOpened("beat-1");
    await button(wrapper, "Show map to players")[0]!.trigger("click");
    expect(mocks.updateLocation).toHaveBeenCalledWith({ id: "site-1", update: { is_map_shared: true } }, expect.anything());
    await button(wrapper, "Leave site")[0]!.trigger("click");
    expect(wrapper.find('[data-test="site"]').exists()).toBe(false);
    expect(button(wrapper, "Enter site")).toHaveLength(1);
  });

  it("hands the prep its place: open when the party is elsewhere", async () => {
    const here = await mountOpened("beat-1");
    expect(here.wrapper.findComponent({ name: "QuestOpenedPrep" }).props("partyHere")).toBe(true);
    const away = await mountOpened("beat-9");
    expect(away.wrapper.findComponent({ name: "QuestOpenedPrep" }).props("partyHere")).toBe(false);
  });

  it("collapses through the designer's own handler", async () => {
    const { wrapper } = await mountOpened("beat-1");
    await button(wrapper, "Flow")[0]!.trigger("click");
    expect(wrapper.emitted("collapse")).toHaveLength(1);
  });

  // Bug: revealing a beat of an unshared quest leaves it nowhere; and a failed write must not share.
  it("reveals through the shared visibility write, which shares the quest after it succeeds", async () => {
    mocks.updateBeat.mockResolvedValue(undefined);
    const { wrapper } = await mountOpened("beat-1");
    await wrapper.find('[data-test="reveal"]').trigger("click");
    await flushPromises();
    expect(mocks.updateBeat).toHaveBeenCalledWith(expect.objectContaining({ id: "beat-1", update: { visibility: "revealed" } }));
    expect(mocks.shareIfBeatSeen).toHaveBeenCalledWith("quest-1", "revealed");
  });

  it("shows the failure and shares nothing when the reveal write fails", async () => {
    mocks.updateBeat.mockRejectedValue(new Error("Someone else changed this beat"));
    const { wrapper } = await mountOpened("beat-1");
    await wrapper.find('[data-test="reveal"]').trigger("click");
    await flushPromises();
    expect(mocks.shareIfBeatSeen).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Someone else changed this beat");
  });

  it("says so when the beat is gone", async () => {
    mocks.beats = [];
    const { wrapper } = await mountOpened("beat-1");
    expect(wrapper.text()).toContain("missing or unavailable");
  });
});
