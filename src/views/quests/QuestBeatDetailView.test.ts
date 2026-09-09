import { reactive, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatDetailView from "./QuestBeatDetailView.vue";
import type { QuestBeat, QuestBeatAttachmentSummary, LootPlacement } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  route: { params: { id: "quest-1", beatId: "beat-1" }, query: {} as Record<string, string> },
  update: vi.fn(),
  confirm: vi.fn(),
  beat: null as QuestBeat | null,
  quest: { id: "quest-1", title: "The Tithe of Ashmouth", player_visible_to: [] as string[] },
  beats: [] as QuestBeat[],
  edges: [] as unknown[],
  attachments: [] as QuestBeatAttachmentSummary[],
  loot: [] as LootPlacement[],
  consequences: [] as unknown[],
  liveQuests: [] as unknown[],
  threads: [] as unknown[],
  locationOptions: [] as unknown[],
  siteReadiness: undefined as Record<string, unknown> | undefined,
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => reactive(mocks.route),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => ({ data: { get value() { return mocks.quest; } }, isLoading: ref(false) }),
}));
vi.mock("@/composables/quests/useQuestThreads", () => ({
  useQuestThreads: () => ({ data: { get value() { return mocks.threads; } } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { get value() { return mocks.locationOptions; } } }),
}));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({ readiness: { get value() { return mocks.siteReadiness; } } }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeat: () => ({ data: { get value() { return mocks.beat; } }, isLoading: ref(false) }),
  useQuestBeats: () => ({ data: { get value() { return mocks.beats; } } }),
  useQuestBeatEdges: () => ({ data: { get value() { return mocks.edges; } } }),
  useQuestBeatAttachmentSummaries: () => ({ data: { get value() { return mocks.attachments; } }, isLoading: ref(false) }),
  useLootPlacements: () => ({ data: { get value() { return mocks.loot; } }, isLoading: ref(false) }),
  useQuestConsequences: () => ({ data: { get value() { return mocks.consequences; } } }),
  useCampaignLiveQuests: () => ({ data: { get value() { return mocks.liveQuests; } } }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));

function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis",
    dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
    rumor_text: null, reveal_text: null, visibility: "rumored", kind: "social",
    presentation_hint: null, staged_at_location_id: null, canvas_x: 0, canvas_y: 0, is_improvised: false,
    improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "version-1",
    ...overrides,
  };
}

const stubs = {
  PageHeader: { props: ["title", "description"], template: '<div><p class="js-title">{{ title }}</p><p class="js-description">{{ description }}</p><div class="js-actions"><slot name="actions" /></div><slot /></div>' },
  QuestBeatFields: true,
  QuestBeatAttachmentsPanel: true,
  QuestBeatSitePanel: true,
  QuestBeatRoutesPanel: true,
  QuestPayoffPanel: true,
  QuestPlayerPreviewDrawer: true,
  EntityCombobox: true,
  RichTextViewer: true,
  RouterLink: { template: "<a><slot /></a>" },
};

function mountView() {
  return mount(QuestBeatDetailView, { global: { stubs } });
}

describe("QuestBeatDetailView", () => {
  beforeEach(() => {
    mocks.route.params = { id: "quest-1", beatId: "beat-1" };
    mocks.route.query = {};
    mocks.update.mockReset();
    mocks.update.mockImplementation(async (input: { update: Partial<QuestBeat> }) => ({ ...beat(), ...input.update, updated_at: "version-2" }));
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(true);
    mocks.beat = beat();
    mocks.beats = [mocks.beat];
    mocks.edges = [];
    mocks.attachments = [];
    mocks.loot = [];
    mocks.consequences = [];
    mocks.liveQuests = [];
    mocks.threads = [];
    mocks.locationOptions = [];
    mocks.siteReadiness = undefined;
  });

  it("shows the missing-beat message when the beat does not belong to this quest", () => {
    mocks.beat = beat({ quest_id: "quest-other" });
    const wrapper = mountView();
    expect(wrapper.text()).toContain("This beat is missing or unavailable.");
  });

  it("builds the eyebrow from kind, thread letter, and whether a live thread stands here", () => {
    mocks.liveQuests = [{ quest_id: "quest-1", beat_id: "beat-1", thread_id: "thread-b" }];
    mocks.threads = [
      { id: "thread-a", label: "Main", status: "live", created_at: "2026-01-01T00:00:00Z" },
      { id: "thread-b", label: "The vault", status: "live", created_at: "2026-01-02T00:00:00Z" },
    ];
    const wrapper = mountView();
    expect(wrapper.get(".js-description").text()).toBe("Social · Thread B · party is here");
  });

  it("shows an em dash when no live thread currently stands at this beat", () => {
    const wrapper = mountView();
    expect(wrapper.get(".js-description").text()).toBe("Social · —");
  });

  it("counts this beat's own prep gaps in the Beat panel's chip", () => {
    mocks.beat = beat({ dm_content: null, how_it_plays: null, rumor_text: null });
    const wrapper = mountView();
    expect(wrapper.text()).toContain("prep gap");
  });

  it("changes kind immediately through the inline select", async () => {
    const wrapper = mountView();
    await wrapper.get('select[aria-label="Kind"]').setValue("combat");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", update: { kind: "combat" } });
  });

  it("keeps the visibility select hidden until Edit is clicked, then saves and closes it", async () => {
    const wrapper = mountView();
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Edit")!.trigger("click");
    const select = wrapper.get('select[aria-label="Player visibility"]');
    await select.setValue("revealed");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", update: { visibility: "revealed" } });
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);
  });

  it("describes an unstaged beat, and a beat staged at a non-site place", async () => {
    const unstaged = mountView();
    expect(unstaged.text()).toContain("Not staged");
    expect(unstaged.text()).toContain("staged at · nowhere yet");

    mocks.beat = beat({ staged_at_location_id: "loc-1" });
    mocks.locationOptions = [{ id: "loc-1", name: "Ashmouth", location_type: "town", parent_id: null }];
    const staged = mountView();
    expect(staged.text()).toContain("Ashmouth");
    expect(staged.text()).toContain("staged at · not a site — no room surface");
  });

  it("describes a beat staged at a site by its room count", () => {
    mocks.beat = beat({ staged_at_location_id: "site-1" });
    mocks.locationOptions = [
      { id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null },
      { id: "room-1", name: "Room 1", location_type: "room", parent_id: "site-1" },
      { id: "room-2", name: "Room 2", location_type: "room", parent_id: "site-1" },
    ];
    const wrapper = mountView();
    expect(wrapper.text()).toContain("staged at · site: 2 rooms");
  });

  it("describes a beat staged at a room by the site it opens into, not as a non-site place (#868 S12)", () => {
    mocks.beat = beat({ staged_at_location_id: "room-1" });
    mocks.locationOptions = [
      { id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null },
      { id: "room-1", name: "Nave of Ash", location_type: "room", parent_id: "site-1" },
      { id: "room-2", name: "Room 2", location_type: "room", parent_id: "site-1" },
    ];
    const wrapper = mountView();
    expect(wrapper.text()).toContain("Nave of Ash");
    expect(wrapper.text()).toContain("staged at · opens at this room in The sealed crypt — 2 rooms");
  });

  it("adds the site's readiness to the beat's own prep gap count once staged there", () => {
    mocks.beat = beat({ staged_at_location_id: "site-1", dm_content: "Prepared", how_it_plays: "Explore", visibility: "hidden" });
    mocks.locationOptions = [{ id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null }];
    const clean = mountView();
    expect(clean.text()).not.toContain("prep gap");

    mocks.siteReadiness = { bound: false, waysOut: true, caption: "1 space unbound" };
    const withGap = mountView();
    expect(withGap.text()).toContain("1 prep gap");
  });

  it("offers Reveal fully for a rumored beat and Reveal to players for a hidden one, but no reveal action once revealed", async () => {
    mocks.beat = beat({ visibility: "rumored" });
    const rumored = mountView();
    expect(rumored.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Reveal fully")).toBe(true);

    mocks.beat = beat({ visibility: "hidden" });
    const hidden = mountView();
    expect(hidden.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Reveal to players")).toBe(true);

    mocks.beat = beat({ visibility: "revealed" });
    const revealed = mountView();
    expect(revealed.findAllComponents({ name: "AppButton" }).some((button) => button.props("label")?.startsWith("Reveal"))).toBe(false);
  });

  it("reveals the beat after confirming, using the existing reveal mutation", async () => {
    const wrapper = mountView();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Reveal fully")!.trigger("click");
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      id: "beat-1", questId: "quest-1", expectedUpdatedAt: "version-1", update: { visibility: "revealed" },
    });
  });

  it("does not reveal when the confirmation is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountView();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Reveal fully")!.trigger("click");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("opens the player preview drawer from the page header action", async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(false);
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(true);
  });

  it("passes only this beat's own attachments and loot down to the Placements and Payoff panels", () => {
    mocks.attachments = [
      { id: "a-1", beat_id: "beat-1" } as QuestBeatAttachmentSummary,
      { id: "a-2", beat_id: "beat-other" } as QuestBeatAttachmentSummary,
    ];
    mocks.loot = [
      { id: "loot-1", beat_id: "beat-1" } as LootPlacement,
      { id: "loot-2", beat_id: "beat-other" } as LootPlacement,
    ];
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: "QuestBeatAttachmentsPanel" }).props("attachments")).toEqual([{ id: "a-1", beat_id: "beat-1" }]);
    expect(wrapper.findComponent({ name: "QuestPayoffPanel" }).props("loot")).toEqual([{ id: "loot-1", beat_id: "beat-1" }]);
  });
});
